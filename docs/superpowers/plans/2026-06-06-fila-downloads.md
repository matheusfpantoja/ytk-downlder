# Fila de Downloads — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar sistema de fila visual sequencial de downloads ao YTK DOWNLDER, com botão "Adicionar à fila", cards individuais com progresso, e reutilização do mesmo fluxo pelo botão "Baixar agora".

**Architecture:** A fila vive 100% no frontend (`App.queue` em `app.js`). Quando chega a vez de um item, o JS chama `start_download(params)` exatamente como hoje. Os eventos `progress` e `download_complete` vindos do Python atualizam o card do item ativo. O `progressCard` global é removido e substituído pelas barras individuais de cada card. O backend (`app.py`) não é alterado.

**Tech Stack:** HTML, CSS, JavaScript vanilla, PyWebView (backend intocado)

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `ui/index.html` | Modificar | Remover `#progressCard`; adicionar `.btn-row`, `#btnAddQueue`, `#queueSection`, `#queueList` |
| `ui/style.css` | Modificar | Estilos para `.btn-row`, `#btnAddQueue`, `.queue-card`, `.queue-bar-*`, `.queue-remove` |
| `ui/app.js` | Modificar | Adicionar estado da fila, `addToQueue`, `processQueue`, `removeFromQueue`, `clearQueueDone`, `renderQueue`, `_makeQueueCard`, `_shortUrl`, `_queueMeta`; reescrever `download()` e `handle()`; remover código morto |

---

## Task 1: HTML — Estrutura da fila

**Files:**
- Modify: `ui/index.html`

- [ ] **Passo 1: Remover o `#progressCard` existente**

No `index.html`, localizar e deletar o bloco inteiro (linhas ~211-218):

```html
<!-- REMOVER ESTE BLOCO INTEIRO: -->
<div class="card bordered" id="progressCard" style="display:none">
  <div class="card-label">Progresso</div>
  <div class="prog-status" id="progStatus">Iniciando…</div>
  <div class="prog-bar-track">
    <div class="prog-bar-fill" id="progBar"></div>
  </div>
  <div class="prog-detail" id="progDetail"></div>
</div>
```

- [ ] **Passo 2: Substituir o botão único por uma linha de botões**

Localizar:
```html
      <button class="btn-primary" id="btnDownload" onclick="App.download()">
        <span id="btnLabel">⬇  Baixar agora</span>
      </button>
```

Substituir por:
```html
      <div class="btn-row">
        <button class="btn-primary" id="btnDownload" onclick="App.download()">
          <span id="btnLabel">⬇  Baixar agora</span>
        </button>
        <button class="btn-secondary" id="btnAddQueue" onclick="App.addToQueue()">
          ＋ Adicionar à fila
        </button>
      </div>
```

- [ ] **Passo 3: Adicionar a seção da fila após a `.drop-zone-hint`**

Localizar a `.drop-zone-hint` e, logo após ela, inserir:
```html
      <!-- Fila de downloads -->
      <div id="queueSection" style="display:none">
        <div class="queue-header">
          <span class="queue-header-title">Fila de downloads</span>
          <button class="btn-ghost btn-ghost-sm" onclick="App.clearQueueDone()">
            Limpar concluídos
          </button>
        </div>
        <div id="queueList"></div>
      </div>
```

- [ ] **Passo 4: Verificar que o HTML está correto**

Abrir `ui/index.html` em um editor e confirmar:
- `#progressCard` não existe mais
- `.btn-row` existe com `#btnDownload` e `#btnAddQueue` dentro
- `#queueSection` existe com `#queueList` dentro, logo após `.drop-zone-hint`

- [ ] **Passo 5: Commit**

```bash
git add ui/index.html
git commit -m "feat: html da fila de downloads — btn-row e queueSection"
```

---

## Task 2: CSS — Estilos da fila

**Files:**
- Modify: `ui/style.css`

- [ ] **Passo 1: Adicionar estilos ao final de `style.css`**

Copiar e colar o bloco abaixo ao final do arquivo:

```css
/* ─── Fila de downloads ─────────────────────────────── */

.btn-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-row .btn-primary {
  flex: 1;
  min-width: 160px;
}

.btn-secondary {
  flex: 1;
  min-width: 160px;
  padding: 12px 20px;
  border-radius: 10px;
  border: 1.5px solid #939393;
  background: transparent;
  color: #939393;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.btn-secondary:hover {
  background: #939393;
  color: #fff;
}

#queueSection {
  margin-top: 20px;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.queue-header-title {
  font-size: 13px;
  font-weight: 600;
  color: #939393;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.btn-ghost-sm {
  font-size: 12px;
  padding: 4px 10px;
}

.queue-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  margin-bottom: 8px;
  background: #fafafa;
  animation: fadeSlideIn 0.18s ease both;
}

[data-tema="dark"] .queue-card {
  background: #1a1a1a;
  border-color: #2a2a2a;
}

.queue-card[data-status="baixando"] {
  border-color: #939393;
}

.queue-card[data-status="concluido"] {
  opacity: 0.65;
}

.queue-icon {
  font-size: 16px;
  margin-top: 2px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.queue-info {
  flex: 1;
  min-width: 0;
}

.queue-titulo {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.queue-meta {
  font-size: 11px;
  color: #939393;
  margin-bottom: 6px;
}

.queue-bar-track {
  height: 4px;
  background: #e5e5e5;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

[data-tema="dark"] .queue-bar-track {
  background: #2a2a2a;
}

.queue-bar-fill {
  height: 100%;
  background: #939393;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.queue-card[data-status="erro"] .queue-bar-fill {
  background: #f43f5e;
}

.queue-card[data-status="concluido"] .queue-bar-fill {
  background: #22c55e;
}

.queue-detalhe {
  font-size: 11px;
  color: #939393;
  font-family: 'DM Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: #aaa;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 0.15s, background 0.15s;
  margin-top: 1px;
}

.queue-remove:hover:not(:disabled) {
  color: #f43f5e;
  background: rgba(244, 63, 94, 0.08);
}

.queue-remove:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

- [ ] **Passo 2: Verificar que a animação `fadeSlideIn` já existe no CSS**

Abrir `style.css` e procurar por `fadeSlideIn`. Se não existir, adicionar também:

```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

(Se já existir, não duplicar.)

- [ ] **Passo 3: Commit**

```bash
git add ui/style.css
git commit -m "feat: css da fila de downloads"
```

---

## Task 3: JS — Estado da fila e renderização

**Files:**
- Modify: `ui/app.js`

- [ ] **Passo 1: Adicionar estado da fila ao objeto `App`**

Localizar o bloco de estado no topo do objeto `App`:
```js
  /* ── Estado ───────────────────────────────────────────── */
  downloading: false,
  tema: 'dark',
  pastaFull: '',
```

Substituir por:
```js
  /* ── Estado ───────────────────────────────────────────── */
  downloading: false,
  tema: 'dark',
  pastaFull: '',
  queue: [],
  queueRunning: false,
  queueActive: null,
```

- [ ] **Passo 2: Adicionar os métodos auxiliares de renderização**

Localizar a seção `/* ══ UTILS ══ */` (onde está `_esc`) e adicionar logo antes dela os seguintes métodos:

```js
  /* ══════════════════════════════════════════════════════
     FILA
     ══════════════════════════════════════════════════════ */
  renderQueue() {
    const section = document.getElementById('queueSection')
    const list    = document.getElementById('queueList')
    if (!section || !list) return
    if (!this.queue.length) {
      section.style.display = 'none'
      return
    }
    section.style.display = 'block'
    list.innerHTML = ''
    this.queue.forEach(item => list.appendChild(this._makeQueueCard(item)))
  },

  _makeQueueCard(item) {
    const icons = { aguardando: '⏳', baixando: '⬇', concluido: '✅', erro: '❌' }
    const card  = document.createElement('div')
    card.className  = 'queue-card'
    card.dataset.id = item.id
    card.dataset.status = item.status
    const showBar  = item.status === 'baixando'
    const disabled = item.status === 'baixando' ? 'disabled' : ''
    card.innerHTML = `
      <div class="queue-icon">${icons[item.status] || '⏳'}</div>
      <div class="queue-info">
        <div class="queue-titulo">${this._esc(item.titulo)}</div>
        <div class="queue-meta">${this._esc(this._queueMeta(item.params))}</div>
        <div class="queue-bar-track" style="display:${showBar ? 'block' : 'none'}">
          <div class="queue-bar-fill" style="width:${Math.round((item.pct || 0) * 100)}%"></div>
        </div>
        <div class="queue-detalhe">${this._esc(item.erro || '')}</div>
      </div>
      <button class="queue-remove" ${disabled}
        onclick="App.removeFromQueue('${this._esc(item.id)}')">✕</button>
    `
    return card
  },

  _queueMeta(params) {
    if (params.tipo === 'video')    return `🎬 ${params.resolucao || '720'}p`
    if (params.tipo === 'playlist') return `📋 Playlist · ${(params.formato || 'mp3').toUpperCase()} ${params.qualidade || '192'}kbps`
    return `🎵 ${(params.formato || 'mp3').toUpperCase()} · ${params.qualidade || '192'}kbps`
  },

  _shortUrl(url) {
    try {
      const u = new URL(url)
      const s = u.hostname.replace(/^www\./, '') + u.pathname
      return s.length > 52 ? s.slice(0, 49) + '…' : s
    } catch (_) {
      return url.length > 52 ? url.slice(0, 49) + '…' : url
    }
  },

  removeFromQueue(id) {
    const item = this.queue.find(i => i.id === id)
    if (!item || item.status === 'baixando') return
    this.queue = this.queue.filter(i => i.id !== id)
    this.renderQueue()
  },

  clearQueueDone() {
    this.queue = this.queue.filter(i => i.status === 'aguardando' || i.status === 'baixando')
    this.renderQueue()
  },
```

- [ ] **Passo 3: Commit**

```bash
git add ui/app.js
git commit -m "feat: estado e renderização da fila (renderQueue, _makeQueueCard)"
```

---

## Task 4: JS — `addToQueue` e `processQueue`

**Files:**
- Modify: `ui/app.js`

- [ ] **Passo 1: Adicionar `addToQueue` logo após `clearQueueDone`**

```js
  addToQueue() {
    const raw  = document.getElementById('urlInput').value || ''
    const urls = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    if (!urls.length) return

    const baseParams = this._buildParams()
    urls.forEach(url => {
      this.queue.push({
        id:     'q_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        url,
        titulo: this._shortUrl(url),
        params: { ...baseParams, url },
        status: 'aguardando',
        pct:    0,
        erro:   null,
      })
    })

    document.getElementById('urlInput').value = ''
    this.renderQueue()
    if (!this.queueRunning) this.processQueue()
  },
```

- [ ] **Passo 2: Adicionar `processQueue` logo após `addToQueue`**

```js
  async processQueue() {
    const item = this.queue.find(i => i.status === 'aguardando')
    if (!item) {
      this.queueRunning = false
      this.queueActive  = null
      return
    }

    this.queueRunning = true
    this.queueActive  = item.id
    item.status = 'baixando'
    this.renderQueue()

    const r = await window.pywebview.api.start_download(item.params)
    if (!r.ok) {
      item.status = 'erro'
      item.erro   = r.error || 'Erro ao iniciar download'
      this.queueActive = null
      this.renderQueue()
      this.processQueue()
    }
  },
```

- [ ] **Passo 3: Commit**

```bash
git add ui/app.js
git commit -m "feat: addToQueue e processQueue"
```

---

## Task 5: JS — Reescrever `handle()` para a fila

**Files:**
- Modify: `ui/app.js`

- [ ] **Passo 1: Substituir o método `handle` atual**

Localizar:
```js
  handle(event, data) {
    switch (event) {
      case 'progress':       this.updateProgress(data);       break
      case 'status':         this.setStatus(data.msg);        break
      case 'download_complete': this.onDownloadDone(data);    break
      case 'history_update': this.prependHistoryItem(data.item); break
    }
  },
```

Substituir por:
```js
  handle(event, data) {
    switch (event) {
      case 'progress': {
        if (!this.queueActive) break
        const item = this.queue.find(i => i.id === this.queueActive)
        if (item) item.pct = data.pct || 0
        const card = document.querySelector(`.queue-card[data-id="${this.queueActive}"]`)
        if (card) {
          const bar     = card.querySelector('.queue-bar-fill')
          const detalhe = card.querySelector('.queue-detalhe')
          const titulo  = card.querySelector('.queue-titulo')
          if (bar)    bar.style.width     = Math.round((data.pct || 0) * 100) + '%'
          if (detalhe) detalhe.textContent = data.detalhe || ''
          if (data.titulo && titulo) titulo.textContent = data.titulo.slice(0, 52)
        }
        break
      }
      case 'status': {
        if (!this.queueActive) break
        const card = document.querySelector(`.queue-card[data-id="${this.queueActive}"]`)
        if (card) {
          const detalhe = card.querySelector('.queue-detalhe')
          if (detalhe) detalhe.textContent = data.msg || ''
        }
        break
      }
      case 'download_complete': {
        if (this.queueActive) {
          const item = this.queue.find(i => i.id === this.queueActive)
          if (item) {
            item.status = data.ok ? 'concluido' : 'erro'
            item.erro   = data.ok ? null : (data.error || 'Erro no download')
            item.pct    = data.ok ? 1 : item.pct
          }
          this.queueActive = null
          this.renderQueue()
          this.processQueue()
        }
        break
      }
      case 'history_update':
        this.prependHistoryItem(data.item)
        break
    }
  },
```

- [ ] **Passo 2: Commit**

```bash
git add ui/app.js
git commit -m "feat: handle() atualizado para eventos da fila"
```

---

## Task 6: JS — Reescrever `download()` para usar a fila

**Files:**
- Modify: `ui/app.js`

- [ ] **Passo 1: Substituir o método `download` atual**

Localizar o método `download()` inteiro:
```js
  async download() {
    if (this.downloading) return
    // ... (todo o bloco)
  },
```

Substituir por:
```js
  async download() {
    const tipo = document.querySelector('input[name="tipo"]:checked')?.value
    document.getElementById('audioOpts').style.display = tipo === 'video' ? 'none' : 'block'
    document.getElementById('videoOpts').style.display = tipo === 'video' ? 'block' : 'none'

    const params = this._buildParams()
    if (!params.url) return

    const item = {
      id:     'q_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      url:    params.url,
      titulo: this._shortUrl(params.url),
      params,
      status: 'aguardando',
      pct:    0,
      erro:   null,
    }

    this.queue.unshift(item)
    document.getElementById('urlInput').value = ''
    this.renderQueue()
    if (!this.queueRunning) this.processQueue()
  },
```

- [ ] **Passo 2: Commit**

```bash
git add ui/app.js
git commit -m "feat: download() agora usa a fila (unshift + processQueue)"
```

---

## Task 7: JS — Remover código morto e ajustar atalho Escape

**Files:**
- Modify: `ui/app.js`

- [ ] **Passo 1: Remover os métodos que não são mais usados**

Localizar e deletar completamente os seguintes métodos do objeto `App`:
- `updateProgress(d) { … }`
- `setStatus(msg) { … }`
- `onDownloadDone(data) { … }`
- `setBtnState(loading) { … }`
- `showProgress(show) { … }`

> **Atenção:** Não apagar `showPopup`, `closePopup` — eles ainda são usados pelo pop-up de conclusão (que agora pode ser removido também, mas manter por ora não faz mal).

- [ ] **Passo 2: Atualizar o atalho `Escape` no listener de teclado**

No listener de teclado global, localizar:
```js
  if (e.key === 'Escape' && App.downloading) {
```

Substituir por:
```js
  if (e.key === 'Escape' && App.queueRunning) {
```

- [ ] **Passo 3: Verificar que `App.downloading` não é mais referenciado**

Executar uma busca no arquivo por `downloading` e confirmar que só existe na declaração `downloading: false,` (que pode ser removida também, mas é inofensiva).

- [ ] **Passo 4: Commit**

```bash
git add ui/app.js
git commit -m "refactor: remove código morto do fluxo antigo de progresso"
```

---

## Task 8: Verificação manual completa

**Files:** nenhum

- [ ] **Passo 1: Iniciar o app**

```bash
python app.py
```

- [ ] **Passo 2: Verificar layout inicial**

- O campo de URL aparece normalmente
- Há dois botões: "⬇ Baixar agora" e "＋ Adicionar à fila" lado a lado
- A seção de fila está oculta (nada visível abaixo dos botões)
- O antigo card de "Progresso" não aparece em lugar nenhum

- [ ] **Passo 3: Testar "Adicionar à fila" com URL única**

1. Colar uma URL do YouTube no campo
2. Clicar "＋ Adicionar à fila"
3. Verificar: card aparece na fila com status ⏳, título abreviado, badge do formato
4. Verificar: campo de URL foi limpo
5. Verificar: download inicia automaticamente (ícone muda para ⬇, barra de progresso aparece)
6. Verificar: ao concluir, ícone muda para ✅ e barra fica cheia/verde

- [ ] **Passo 4: Testar múltiplas URLs**

1. Colar 3 URLs em linhas separadas no campo
2. Clicar "＋ Adicionar à fila"
3. Verificar: 3 cards aparecem — 1 baixando, 2 aguardando
4. Verificar: ao concluir cada um, o próximo inicia automaticamente

- [ ] **Passo 5: Testar "Baixar agora"**

1. Com uma URL no campo, clicar "⬇ Baixar agora"
2. Verificar: card aparece e download inicia imediatamente
3. Se havia itens aguardando na fila, "Baixar agora" vai para a frente (primeiro da lista)

- [ ] **Passo 6: Testar botão ✕ (remover)**

1. Adicionar 3 URLs à fila
2. Clicar ✕ em um item com status ⏳ — deve desaparecer
3. Clicar ✕ no item que está ⬇ baixando — o botão deve estar desabilitado (não fazer nada)

- [ ] **Passo 7: Testar "Limpar concluídos"**

1. Deixar alguns downloads completarem (✅ e ❌)
2. Clicar "Limpar concluídos"
3. Verificar: só ficam itens ⏳ aguardando ou ⬇ baixando

- [ ] **Passo 8: Testar Escape**

1. Com download em andamento, pressionar Escape
2. Verificar: download cancela, item marca como ❌ erro

- [ ] **Passo 9: Testar "Baixar da busca"**

1. Ir à aba Buscar, pesquisar algo
2. Clicar "⬇ Baixar" em um resultado
3. Verificar: volta para aba Download, card aparece na fila e inicia

---

## Referência rápida — estrutura final do `App`

```
App.queue           — array de itens da fila
App.queueRunning    — boolean: fila ativa?
App.queueActive     — id do item sendo baixado agora

App.addToQueue()    — parse de URLs, cria itens, inicia fila
App.processQueue()  — pega próximo aguardando, chama start_download
App.removeFromQueue(id) — remove item (se não estiver baixando)
App.clearQueueDone()    — remove concluídos e erros
App.renderQueue()       — re-renderiza #queueList
App._makeQueueCard(item)— retorna DOM do card
App._queueMeta(params)  — retorna string "🎵 MP3 · 192kbps"
App._shortUrl(url)      — abrevia URL para exibição
App.handle()            — atualizado para rotear eventos para o card ativo
App.download()          — agora faz unshift na fila e chama processQueue
```
