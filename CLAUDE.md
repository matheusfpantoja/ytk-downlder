# CLAUDE.md — YTK DOWNLDER
> Memória de contexto para o Claude Code. Leia este arquivo antes de qualquer tarefa.

---

## O que é este projeto

**YTK DOWNLDER** — app desktop para download de músicas e vídeos do YouTube (e 1000+ outros sites).
Desenvolvido por Karl, dev iniciante. O nome com erro ortográfico é **intencional**, nunca corrigir.

---

## Perfil do desenvolvedor

- Iniciante em programação, pouca experiência em VS Code
- Usa **Claude Pro** (web + desktop) e **Claude Code** (aba `</>` no Claude Desktop)
- Aprendeu Git durante este projeto
- Prefere **explicações em português**, passo a passo, com contexto de "por quê" além do "como"
- Avise sobre erros comuns *antes* de acontecerem
- Use guias visuais/interativos sempre que possível

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Python 3.10+ |
| Janela desktop | PyWebView 4.4+ |
| Download | yt-dlp |
| Metadados/capa | mutagen + Pillow |
| Notificações | plyer (importado com fallback silencioso) |
| UI | HTML + CSS + JavaScript vanilla |
| Fontes | Plus Jakarta Sans, DM Mono (Google Fonts) |
| Tema atual | Grayscale Clean — sidebar cinza (#939393 → gradiente), main branco |

---

## Estrutura de arquivos

```
youtube-downloader/
├── app.py              # Backend Python (classe Api + classe Historico)
├── requirements.txt    # pywebview, yt-dlp, mutagen, Pillow, requests, plyer
├── instalar.bat        # Instalador Windows
├── CLAUDE.md           # Este arquivo
└── ui/
    ├── index.html      # Estrutura HTML da interface
    ├── style.css       # CSS completo (tema Grayscale Clean)
    └── app.js          # Lógica JS (objeto App + comunicação com Python)
```

---

## Arquitetura — como as partes se comunicam

```
PyWebView abre janela → carrega ui/index.html
    │
    ├── JS chama Python:  await window.pywebview.api.nome_metodo(args)
    └── Python chama JS:  window.evaluate_js('App.handle("evento", dados)')
```

**Eventos que Python envia ao JS (`App.handle`):**

| Evento | Dados | Descrição |
|--------|-------|-----------|
| `progress` | `{pct, titulo, detalhe}` | Atualiza barra de progresso do card ativo na fila |
| `status` | `{msg}` | Mensagem de detalhe no card ativo da fila |
| `download_complete` | `{ok, error?}` | Download terminou — avança a fila |
| `history_update` | `{item}` | Novo item no histórico |
| `log` | `{msg}` | Mensagem de log (emitida pelo Python, não tratada no JS atualmente) |

---

## Funcionalidades implementadas

- [x] Download de **música** — MP3 / WAV / FLAC (128 / 192 / 320 kbps)
- [x] Download de **vídeo** — MP4 (360p / 480p / 720p / 1080p)
- [x] Download de **playlist** inteira
- [x] Download via arquivo **.txt** com múltiplos links (prefixo `TXT:` no campo URL)
- [x] **Busca** integrada no YouTube e SoundCloud (sem abrir navegador) — `ytsearch8:` / `scsearch8:`
- [x] **Recorte** de trecho (início/fim em `mm:ss`)
- [x] Metadados automáticos (artista, capa do álbum via FFmpegMetadata + EmbedThumbnail)
- [x] Organização por pasta artista/canal
- [x] **Histórico** de downloads (JSON local em `~/Músicas-YT/.historico.json`)
- [x] Pular duplicados (verifica URL no histórico)
- [x] Toggle tema claro/escuro (persiste em `.config.json`)
- [x] Pop-up de conclusão (sucesso / erro) com animação
- [x] **Fila visual** de downloads com status individual por item (aguardando / baixando / concluído / erro)
- [x] **Notificações do sistema** ao terminar download (`plyer`, falha silenciosamente se ausente)
- [x] **Auto-atualizar yt-dlp** ao abrir o app (roda em thread daemon, emite evento `log`)
- [x] **Atalhos de teclado**: `Ctrl+V` baixa, `Ctrl+F`/`Ctrl+S` foca busca, `Ctrl+D` aba download, `Ctrl+H` aba histórico, `Esc` cancela
- [x] **Drag & drop** de links do navegador (overlay visual ao arrastar)
- [x] **Detecção automática de URL** — identifica tipo (música / vídeo / playlist) e bloqueia opções inválidas com hint visual
- [x] Suporte a SoundCloud, Bandcamp, Vimeo e 1000+ sites (yt-dlp nativo)

---

## Funcionalidades pendentes (próximos passos)

- [ ] Importar playlist do Spotify e buscar no YouTube (`spotdl`)
- [ ] Topbar com título dinâmico (`#topbarTitle`) — JS já tem o override preparado mas o elemento não existe no HTML

---

## Tema visual atual — Grayscale Clean

```css
/* Sidebar */
--sidebar-bg:     gradiente #939393 → #7a7a7a → #303030 (bottom-left)
--sidebar-text:   #ffffff

/* Main */
--main-bg:        #ffffff
--main-title:     #939393
--main-text:      #000000
--main-sub:       #444444

/* Botão primário */
--btn-bg:         #939393
--btn-hover:      #7a7a7a

/* Status */
--green: #2ecc71
--red:   #e74c3c
```

**Janela PyWebView:** 1000×720px, mínimo 800×580, `background_color = "#08080f"`

---

## Convenções do código

### Python (`app.py`)
- Classe `Api`: métodos públicos = acessíveis ao JS
- Classe `Historico`: persiste em `~/Músicas-YT/.historico.json` (até 500 itens)
- `_emit(event, data)` → envia evento ao JS via `evaluate_js`
- `_hook(d)` → callback do yt-dlp para progresso; lança exceção se `_cancelar=True`
- `_build_opts(params)` → constrói opções do yt-dlp
- `_baixar_unico(url, params)` → executa um download individual; retorna título
- `_download_thread(url, params)` → roda em thread daemon; detecta prefixo `TXT:`
- `_verificar_ytdlp()` → atualiza yt-dlp via pip ao iniciar (thread daemon)
- `_notify(title, message)` → notificação do SO via plyer (falha silenciosamente)
- `resource_path(rel)` → resolve caminhos em dev e em `.exe` (PyInstaller)
- Constantes de caminho no topo: `PASTA_PADRAO`, `HISTORICO_PATH`, `CONFIG_PATH`

### JavaScript (`app.js`)
- Objeto global `App` com todos os métodos
- **Estado:** `App.tema`, `App.pastaFull`, `App.queue[]`, `App.queueRunning`, `App.queueActive`
- `App.init()` → chamado pelo evento `pywebviewready`
- `App.handle(event, data)` → recebe eventos do Python; atualiza card ativo da fila
- `App.tab(name)` → troca de aba; atualiza `#topbarTitle` se existir
- `App.download()` → cria item na fila com `unshift` (prioridade) e chama `processQueue()`
- `App.addToQueue()` → adiciona URLs do campo (suporta múltiplas linhas) no final da fila
- `App.processQueue()` → pega próximo `aguardando` e chama `start_download`
- `App.renderQueue()` → re-renderiza `#queueSection` / `#queueList`
- `App.removeFromQueue(id)` → remove item não-ativo da fila
- `App.clearQueueDone()` → remove concluídos/erros da fila
- `App.detectUrlType(url)` → retorna `{tipo, bloqueados[], hint}` baseado no domínio/padrão da URL
- `App.applyUrlDetection(resultado)` → bloqueia radios inválidos e mostra hint; `null` reseta
- `App.onTipoChange()` → mostra/esconde `#audioOpts` / `#videoOpts`
- `App._buildParams()` → lê todos os campos do formulário
- `App._esc(str)` → escapa HTML para evitar XSS
- `App._shortUrl(url)` → trunca URL para exibição na fila

### HTML (`index.html`)
- Três seções `tab-panel`: `#tab-download`, `#tab-search`, `#tab-history`
- **URL:** `#urlInput`, `#urlHint` (hint de detecção automática)
- **Botões principais:** `#btnDownload`, `#btnAddQueue`
- **Fila:** `#queueSection` (oculto por padrão), `#queueList`
- **Pop-up:** `#downloadPopup`, `#popupIconWrap`, `#popupIcon`, `#popupTitle`, `#popupMsg`
- **Sidebar footer:** `#folderPath`, `#themeBtn`, `#themeLabel`, `#themeLabel2`
- **Drop overlay:** `#dropOverlay` (visível ao arrastar link sobre a janela)
- Topbar (`#topbarTitle`) **não existe no HTML** — JS já tem o código preparado

---

## Dependências (`requirements.txt`)

```
pywebview>=4.4
yt-dlp
mutagen
Pillow
requests
plyer
```

FFmpeg deve estar instalado separadamente (necessário para conversão de áudio e vídeo).

---

## Armadilhas conhecidas / cuidados

1. **PyWebView e threads**: nunca chamar `evaluate_js` de dentro da thread principal — sempre usar threads daemon para downloads.
2. **Playlist vs. single**: o parâmetro `noplaylist` deve ser `True` para `tipo != "playlist"`.
3. **EmbedThumbnail**: requer FFmpeg instalado; falha silenciosamente se ausente.
4. **`TXT:` prefix**: quando o usuário carrega um `.txt`, o valor do `urlInput` recebe `TXT:/caminho/arquivo.txt`. O backend detecta esse prefixo.
5. **`window.pywebview` pode não estar pronto**: o JS escuta `pywebviewready` *e* testa `if (window.pywebview)` como fallback.
6. **Caminhos no PyInstaller**: sempre usar `resource_path()` para arquivos bundled.
7. **Fila — `download()` usa `unshift`**: novos itens vão para o topo (prioridade imediata). `addToQueue()` usa `push` (final da fila).
8. **`queueActive`**: é o `id` do item em andamento. `App.handle` usa esse ID para encontrar o card correto na fila.
9. **Evento `log`**: o Python emite, mas o `App.handle` não tem `case 'log'` — cai no `default` do switch sem erro.
10. **Detecção de URL**: `App.detectUrlType` retorna `null` para URL inválida. `App.applyUrlDetection(null)` reseta e bloqueia apenas "playlist".
11. **Tema**: `data-tema` fica no `<html>`. O CSS atual é Grayscale Clean estático — o toggle persiste, mas o CSS não diferencia dark/light visualmente (trabalho futuro).
12. **plyer**: importado com `try/except` — se não instalado, `_plyer_notification = None` e `_notify()` retorna imediatamente sem erro.

---

## Decisões de arquitetura já tomadas

| Decisão | Alternativa descartada | Motivo |
|---------|----------------------|--------|
| PyWebView | CustomTkinter | Visual muito limitado |
| PyWebView | Electron | Pesado, exige Node.js |
| PyWebView | Streamlit | Não gera `.exe` desktop |
| yt-dlp direto | youtube-dl | yt-dlp é mais mantido e rápido |
| JSON simples | SQLite | Simplicidade para iniciante |
| Fila com `unshift` no download() | `push` | Novos downloads têm prioridade imediata |

---

## Como rodar em desenvolvimento

```bash
# Instalar dependências
pip install -r requirements.txt

# Rodar o app
python app.py
```

A janela abre em 1000×720px (mínimo 800×580).

---

## Histórico de versões (resumo)

| Versão | Mudança principal |
|--------|------------------|
| v1 | CustomTkinter puro |
| v2 | PyWebView + tema escuro inicial |
| v3 (atual) | PyWebView + tema Grayscale Clean, fila visual, drag & drop, detecção automática de URL, atalhos de teclado, notificações plyer, auto-update yt-dlp |
