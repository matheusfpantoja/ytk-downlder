# Drag & Drop — URL Detection Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a detecção automática de tipo de URL disparar corretamente quando um link é inserido via drag & drop.

**Architecture:** O handler de drop seta `urlInput.value` mas tenta chamar `App.onUrlChange()` — que não existe no objeto `App` pois está dentro de um IIFE privado. A correção é disparar um evento sintético `input` no elemento `urlInput` logo após setar o valor, aproveitando o listener já registrado pelo IIFE existente.

**Tech Stack:** JavaScript vanilla (nenhuma dependência nova)

---

### Task 1: Corrigir o handler de drop em `ui/app.js`

**Files:**
- Modify: `ui/app.js` (bloco IIFE do drag & drop, trecho do evento `drop`)

**Contexto — por que a detecção falha:**

O IIFE que cuida da detecção de URL (linhas ~628-653) registra um listener de `input` no `urlInput`:

```js
input.addEventListener('input', onUrlChange)
```

Mas `onUrlChange` é uma variável local do IIFE — não está em `App`. O handler de drop chama:

```js
App.onUrlChange?.()   // undefined → silenciosamente ignorado
```

**A correção:** substituir essa chamada por um evento sintético `input`, que o listener do IIFE já sabe processar.

- [ ] **Step 1: Localizar o trecho exato no handler de drop**

No arquivo `ui/app.js`, procurar o bloco dentro do IIFE de drag & drop (começa com `document.addEventListener('drop', ...)`). O trecho atual é:

```js
  document.addEventListener('drop', (e) => {
    e.preventDefault()
    dragDepth = 0
    overlay.classList.remove('drop-active')

    const url = extrairUrl(e.dataTransfer)
    if (!url) return

    App.tab('download')
    document.getElementById('urlInput').value = url
    // Dispara detecção automática de tipo de URL se existir
    if (typeof App.detectUrlType === 'function') {
      App.onUrlChange?.()
    }
    document.getElementById('urlInput').focus()
  })
```

- [ ] **Step 2: Substituir a chamada `App.onUrlChange?.()` pelo evento sintético**

Trocar o bloco inteiro do `drop` listener por:

```js
  document.addEventListener('drop', (e) => {
    e.preventDefault()
    dragDepth = 0
    overlay.classList.remove('drop-active')

    const url = extrairUrl(e.dataTransfer)
    if (!url) return

    App.tab('download')
    const input = document.getElementById('urlInput')
    input.value = url
    // Dispara o listener de detecção de URL já registrado no campo
    input.dispatchEvent(new Event('input'))
    input.focus()
  })
```

**Por que `dispatchEvent(new Event('input'))` funciona:**
O IIFE de detecção registra `input.addEventListener('input', onUrlChange)`. Qualquer evento `input` no elemento — seja do usuário digitando, colando, ou sintético como este — vai executar `onUrlChange()`, que lê `input.value` e chama `App.applyUrlDetection()`.

- [ ] **Step 3: Verificar manualmente**

1. Rodar o app: `python app.py`
2. Arrastar um link do YouTube do browser e soltar na janela
3. Confirmar que:
   - O link aparece no campo `urlInput` ✓
   - A detecção de tipo dispara (ex.: opções de áudio/vídeo se ajustam) ✓
4. Arrastar um link do SoundCloud — confirmar que o modo áudio é selecionado automaticamente ✓
5. Arrastar um link de playlist (`?list=`) — confirmar que o tipo "Playlist" é selecionado ✓

- [ ] **Step 4: Commit**

```bash
git add ui/app.js
git commit -m "fix: dispara detecção de URL ao inserir link via drag & drop"
```
