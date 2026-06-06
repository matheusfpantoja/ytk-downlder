# Design: Sistema de Fila de Downloads

**Data:** 2026-06-06  
**Status:** Aprovado

---

## Objetivo

Adicionar uma fila visual de downloads que permita ao usuário enfileirar múltiplos links com configurações individuais, processados sequencialmente. O botão "Baixar agora" continua funcionando como antes (download imediato).

---

## Decisões de design

| Decisão | Escolha |
|---------|---------|
| Onde vive a fila | 100% no frontend (JS) |
| Mudanças no backend | Nenhuma |
| Params por item | Congelados no momento de adição |
| Persistência | Efêmera (apagada ao fechar o app) |
| Card de progresso global | Removido — cada item tem seu próprio progresso |

---

## Estrutura de dados

Cada item da fila é um objeto em `App.queue` (array):

```js
{
  id:     String,   // Date.now() + Math.random() — identificador único
  url:    String,   // URL original
  titulo: String,   // URL abreviada (ex: "youtube.com/watch?v=abc…")
  params: Object,   // snapshot de _buildParams() no momento de adição
  status: String,   // 'aguardando' | 'baixando' | 'concluido' | 'erro'
  pct:    Number,   // 0.0 → 1.0
  erro:   String|null
}
```

**Estado global da fila:**
- `App.queue` — array de itens
- `App.queueRunning` — boolean, true enquanto há download ativo via fila
- `App.queueActive` — id do item sendo baixado no momento

---

## Componentes novos em app.js

### `App.addToQueue()`
- Lê o campo `urlInput`; divide por `\n`; filtra linhas vazias e linhas começando com `#`
- Para cada URL válida, cria um item com `status: 'aguardando'` e `params` congelados
- Limpa o campo `urlInput` após adicionar
- Chama `App.renderQueue()` e, se a fila não estiver rodando, `App.processQueue()`

### `App.processQueue()`
- Encontra o primeiro item com `status === 'aguardando'`
- Se não encontrar, seta `queueRunning = false` e retorna
- Seta `queueRunning = true`, `queueActive = item.id`, `item.status = 'baixando'`
- Chama `window.pywebview.api.start_download(item.params)` (igual ao fluxo atual)
- Atualiza o card do item na UI

### `App.removeFromQueue(id)`
- Remove o item se `status !== 'baixando'`
- Re-renderiza a fila

### `App.clearQueueDone()`
- Remove todos os itens com `status === 'concluido'` ou `status === 'erro'`
- Re-renderiza a fila

### `App.renderQueue()`
- Renderiza todos os cards no `#queueList`
- Mostra/oculta `#queueSection` conforme `App.queue.length > 0`

### Modificações em `App.handle()`
- `progress` → se `queueRunning`, atualiza `pct` e re-renderiza o card do item ativo
- `download_complete` → se `queueRunning`, marca item ativo como `concluido` ou `erro`, chama `processQueue()` para o próximo

---

## HTML — novos elementos em `#tab-download`

### Botão de fila (ao lado de "Baixar agora")
```html
<div class="btn-row">
  <button id="btnDownload" …>⬇ Baixar agora</button>
  <button id="btnAddQueue" onclick="App.addToQueue()">＋ Adicionar à fila</button>
</div>
```

### Seção da fila
```html
<div id="queueSection" style="display:none">
  <div class="queue-header">
    <span>Fila de downloads</span>
    <button onclick="App.clearQueueDone()">Limpar concluídos</button>
  </div>
  <div id="queueList"></div>
</div>
```

### Card de item (gerado via JS)
```html
<div class="queue-card" data-id="…" data-status="…">
  <div class="queue-icon">⏳</div>
  <div class="queue-info">
    <div class="queue-titulo">youtube.com/watch?v=…</div>
    <div class="queue-meta">🎵 MP3 · 320kbps</div>
    <div class="queue-bar-track" style="display:none">
      <div class="queue-bar-fill"></div>
    </div>
    <div class="queue-detalhe"></div>
  </div>
  <button class="queue-remove" onclick="App.removeFromQueue('…')">✕</button>
</div>
```

---

## CSS — novos estilos em style.css

- `.btn-row` — flexbox, gap entre os dois botões; `#btnAddQueue` com estilo secundário (outline/ghost)
- `.queue-card` — card com padding, borda, animação de entrada
- `.queue-icon` — ícone de status (⏳/⬇/✅/❌)
- `.queue-bar-track` / `.queue-bar-fill` — barra de progresso inline (mesmos tokens do `prog-bar`)
- `.queue-remove` — botão ✕ pequeno, desabilitado quando status=baixando

---

## Remoção do `progressCard` global

O `#progressCard` existente é removido do HTML. As funções `showProgress()`, `updateProgress()` e `setStatus()` são substituídas pela lógica de atualização dos cards da fila.

> **Atenção:** o fluxo de "Baixar agora" (download imediato) **não usa a fila**. Ele mantém seu próprio mini-card de progresso inline — ou redireciona para a fila automaticamente adicionando o item e iniciando imediatamente. **Decisão: "Baixar agora" adiciona o item à frente da fila e inicia de imediato**, reutilizando toda a lógica da fila. Isso elimina a necessidade de manter dois caminhos separados.

---

## Fluxo completo

```
Usuário cola URL(s) → clica "Adicionar à fila"
  → addToQueue() cria itens com params congelados
  → renderQueue() mostra os cards
  → processQueue() inicia o primeiro item
    → start_download(params) no Python
    → Python emite progress → JS atualiza card ativo
    → Python emite download_complete → JS marca concluído
    → processQueue() pega próximo item → …
    → Fila vazia → queueRunning = false
```

"Baixar agora":
```
Usuário clica "Baixar agora"
  → item criado com prioridade (unshift) na fila
  → processQueue() inicia imediatamente se fila não rodando
```
