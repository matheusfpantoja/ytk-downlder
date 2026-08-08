# YTK_HANDOFF_01 — MCP GitHub configurado + correções de fila e UI pendentes

**Último trabalho feito em: desktop**

---

## O que foi feito neste chat

1. Identificação da pasta correta do projeto (desktop: `D:\8. DEVKARL\1. PROJETOS\YTK DOWNLOADER\ytk-downlder`)
2. Estado do Git verificado — branch `fix/ffmpeg-location-pasta`, em dia com o remoto
3. Configuração do MCP GitHub no Claude Desktop — funcionando e testado
4. Diagnóstico do bug de fila — erro causado pelo `if self.baixando` em `start_download()`
5. Prompt gerado para corrigir a fila (não executado ainda)
6. Diagnóstico da UI — `#urlHint` precisa ir acima dos botões de Tipo
7. Prompt gerado para mover o hint (não executado ainda)

## Próximo passo

Executar os dois prompts abaixo no Claude Code.

### Prompt 1 — Correção da fila

```
Preciso de 3 mudanças cirúrgicas. Não altere nada além do descrito.

1. app.py: no método start_download, remova estas 2 linhas:
    if self.baixando:
        return {"ok": False, "error": "Já há um download em andamento."}

2. ui/app.js: substitua o corpo inteiro do método download() por:
    async download() {
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
   Em seguida delete o método addToQueue() inteiro.

3. ui/index.html: remova o elemento com id btnAddQueue.

Depois rode python app.py para confirmar.
```

### Prompt 2 — Hint de tipo acima dos botões

```
Duas mudanças cirúrgicas:

1. ui/index.html: no opt-row do Tipo, envolva radio-group e urlHint
   numa div.tipo-group-wrap, com urlHint ACIMA do radio-group:

    <div class="opt-row opt-row-tipo">
      <div class="opt-label">Tipo</div>
      <div class="tipo-group-wrap">
        <div id="urlHint" class="url-hint"></div>
        <div class="radio-group" id="tipoGroup">
          ... (conteúdo idêntico ao atual)
        </div>
      </div>
    </div>

2. ui/style.css: adicione ao final:
    .opt-row-tipo { align-items: flex-start; }
    .tipo-group-wrap { display: flex; flex-direction: column; gap: 6px; }
    .tipo-group-wrap .url-hint { margin: 0; }
```

## Estado do Git no fechamento

- Branch ativa: `fix/ffmpeg-location-pasta`
- Último commit no remoto: `2326c96` — fix: usar pasta do ffmpeg
- Arquivos modificados localmente (não commitados): `ui/app.js`, `ui/index.html`, `ui/style.css`, `bin/`
- Push esperado: sim (handoff.config.md e este arquivo foram commitados no master via MCP)

## Arquivos para ler antes de continuar

- `handoff.config.md`
- `CLAUDE.md`
- `app.py` — método `start_download`
- `ui/app.js` — métodos `download()`, `addToQueue()`, `processQueue()`
- `ui/index.html` — seção opt-row do Tipo e btn-row

<!-- ROTINA DE HANDOFF (ponteiro) -->
Este projeto usa a skill `chat-handoff` para trocar de sessão; ela é a fonte de verdade.
Se a skill NAO estiver disponivel, fallback minimo:
- ABRIR: git fetch todas as branches; se atras, pull antes de tocar em qualquer coisa;
  leia o handoff de maior numero; confira que o git real bate com ele.
- FECHAR: git fetch ANTES de numerar; incremente numero do chat + versao do PRD;
  gere YTK_HANDOFF_NN.md; push de TODAS as branches incluindo o handoff.
Detalhes completos: skill chat-handoff.
