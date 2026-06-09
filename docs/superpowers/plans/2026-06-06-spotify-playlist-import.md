# Spotify Playlist Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to paste a Spotify playlist URL, pick tracks via a checklist modal, and download each track by searching YouTube via yt-dlp's existing pipeline.

**Architecture:** Spotify Web API (Client Credentials Flow, no OAuth) provides playlist metadata and track list. Python emits a `spotify_tracks` event with the track data. JS renders two modals — credentials setup (once) and track preview with checkboxes + format selector. Each selected track becomes a queue item with URL `ytsearch1:{titulo} {artista}`, which flows through the existing `processQueue` → `start_download` pipeline unchanged.

**Tech Stack:** Python `requests` (already in requirements), Spotify Web API v1, existing yt-dlp + queue system

---

## Files

| File | Action | Changes |
|------|--------|---------|
| `app.py` | Modify | New methods: `save_spotify_credentials`, `get_spotify_playlist_info`, `open_url`; new private methods: `_spotify_token`, `_spotify_playlist_thread`; update `Historico.add` with `fonte` param; update `_pos_download` to pass `fonte` |
| `ui/index.html` | Modify | Add credentials modal + playlist preview modal (before `<script>`) |
| `ui/style.css` | Modify | Add styles for modals and Spotify badge in history |
| `ui/app.js` | Modify | Spotify state + methods, updated `download()`, `handle()`, `detectUrlType()`, `_makeHistCard()`, `_queueMeta()` |

---

## Task 1: Backend Python — Spotify API integration

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Add imports at the top of app.py**

After line 13 (`from datetime import datetime`), add:

```python
import re
import base64
import webbrowser
```

- [ ] **Step 2: Update `Historico.add` to accept `fonte` parameter**

Replace the existing `add` method (lines 69–77):

```python
    def add(self, titulo, url, formato, qualidade, arquivo, fonte=""):
        item = {
            "titulo": titulo, "url": url,
            "formato": formato, "qualidade": qualidade,
            "arquivo": arquivo,
            "data": datetime.now().strftime("%d/%m/%Y %H:%M"),
        }
        if fonte:
            item["fonte"] = fonte
        self.itens.insert(0, item)
        self.itens = self.itens[:500]
        self.save()
```

- [ ] **Step 3: Update `_pos_download` to pass `fonte` to `historico.add`**

In `_pos_download` (around line 361), replace:
```python
        self.historico.add(titulo, url, fmt, qual, arquivo)
```
With:
```python
        self.historico.add(titulo, url, fmt, qual, arquivo, fonte=params.get("fonte", ""))
```

- [ ] **Step 4: Add `_spotify_token` private method**

Add after the `_short` method (after line 410), before the `if __name__ == "__main__":` block:

```python
    # ── Spotify ──────────────────────────────────────────
    
    def _spotify_token(self, client_id, client_secret):
        """Obtém access token do Spotify via Client Credentials Flow."""
        import requests
        auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        r = requests.post(
            "https://accounts.spotify.com/api/token",
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()["access_token"]

    def _spotify_playlist_thread(self, spotify_url):
        """Extrai faixas de uma playlist Spotify e emite evento spotify_tracks."""
        import requests
        try:
            cfg = {}
            try:
                if os.path.exists(CONFIG_PATH):
                    with open(CONFIG_PATH, encoding="utf-8") as f:
                        cfg = json.load(f)
            except Exception:
                pass

            client_id     = cfg.get("spotify_client_id", "").strip()
            client_secret = cfg.get("spotify_client_secret", "").strip()

            if not client_id or not client_secret:
                self._emit("spotify_tracks", {"ok": False, "error": "no_credentials"})
                return

            m = re.search(r"open\.spotify\.com/playlist/([A-Za-z0-9]+)", spotify_url)
            if not m:
                self._emit("spotify_tracks", {"ok": False, "error": "URL de playlist Spotify inválida."})
                return

            playlist_id = m.group(1)
            token   = self._spotify_token(client_id, client_secret)
            headers = {"Authorization": f"Bearer {token}"}

            r = requests.get(
                f"https://api.spotify.com/v1/playlists/{playlist_id}?fields=name",
                headers=headers, timeout=15,
            )
            r.raise_for_status()
            playlist_nome = r.json().get("name", "Playlist Spotify")

            faixas = []
            url = (
                f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks"
                f"?fields=items(track(name,artists(name),duration_ms,type)),next&limit=100"
            )
            while url:
                r = requests.get(url, headers=headers, timeout=15)
                r.raise_for_status()
                data = r.json()
                for item in data.get("items", []):
                    track = item.get("track")
                    if not track or track.get("type") != "track":
                        continue
                    nome     = track.get("name", "")
                    artistas = ", ".join(a["name"] for a in track.get("artists", []))
                    ms       = track.get("duration_ms", 0)
                    duracao  = f"{ms // 60000}:{(ms % 60000) // 1000:02d}"
                    faixas.append({"titulo": nome, "artista": artistas, "duracao": duracao})
                url = data.get("next")

            self._emit("spotify_tracks", {
                "ok": True,
                "playlist_nome": playlist_nome,
                "faixas": faixas,
            })
        except Exception as e:
            self._emit("spotify_tracks", {"ok": False, "error": str(e)})

    def get_spotify_playlist_info(self, spotify_url):
        """Inicia extração de faixas de playlist Spotify (assíncrono via thread)."""
        threading.Thread(
            target=self._spotify_playlist_thread,
            args=(spotify_url,),
            daemon=True,
        ).start()
        return {"ok": True}

    def save_spotify_credentials(self, cfg):
        """Salva e valida credenciais Spotify no .config.json."""
        client_id     = (cfg.get("client_id") or "").strip()
        client_secret = (cfg.get("client_secret") or "").strip()
        if not client_id or not client_secret:
            return {"ok": False, "error": "Preencha Client ID e Client Secret."}
        try:
            self._spotify_token(client_id, client_secret)
        except Exception:
            return {"ok": False, "error": "Credenciais inválidas. Verifique o Client ID e Secret no Spotify Developer."}
        self.save_config({"spotify_client_id": client_id, "spotify_client_secret": client_secret})
        return {"ok": True}

    def open_url(self, url):
        """Abre URL no navegador padrão do sistema."""
        webbrowser.open(url)
        return True
```

- [ ] **Step 5: Commit**

```bash
git add app.py
git commit -m "feat: backend Spotify — extração de playlist via Web API + credenciais"
```

---

## Task 2: HTML — Modais de credenciais e preview

**Files:**
- Modify: `ui/index.html`

- [ ] **Step 1: Adicionar modal de credenciais Spotify**

Antes da linha `<script src="app.js"></script>` (linha 305), inserir:

```html
<!-- ── Modal: Configuração Spotify ── -->
<div id="spotifyCredModal" class="modal-overlay" style="display:none"
     onclick="if(event.target===this) App.closeSpotifyCredModal()">
  <div class="modal-card">
    <div class="modal-header">
      <span class="modal-title">🎵 Conectar ao Spotify</span>
      <button class="modal-close" onclick="App.closeSpotifyCredModal()">✕</button>
    </div>
    <p class="modal-desc">
      Para importar playlists, você precisa de um App gratuito no Spotify Developer.
    </p>
    <a class="modal-link" onclick="App.openSpotifyDevLink()">Como criar um app →</a>
    <div class="modal-field">
      <label class="modal-field-label">Client ID</label>
      <input type="text" id="spotClientId" class="input-url" placeholder="Cole o Client ID aqui">
    </div>
    <div class="modal-field">
      <label class="modal-field-label">Client Secret</label>
      <input type="password" id="spotClientSecret" class="input-url" placeholder="Cole o Client Secret aqui">
    </div>
    <div id="spotCredError" class="modal-error" style="display:none"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="App.closeSpotifyCredModal()">Cancelar</button>
      <button class="btn-primary" id="btnSpotConnect" onclick="App.saveSpotifyCredentials()">Conectar</button>
    </div>
  </div>
</div>

<!-- ── Modal: Preview de playlist Spotify ── -->
<div id="spotifyPreviewModal" class="modal-overlay" style="display:none"
     onclick="if(event.target===this) App.closeSpotifyPreview()">
  <div class="modal-card modal-card-lg">
    <div class="modal-header">
      <span class="modal-title" id="spotPlaylistName">Carregando…</span>
      <button class="modal-close" onclick="App.closeSpotifyPreview()">✕</button>
    </div>
    <div class="spot-format-row">
      <span class="opt-label">Formato</span>
      <div class="radio-group">
        <label class="radio-pill"><input type="radio" name="spotFormato" value="mp3" checked> MP3</label>
        <label class="radio-pill"><input type="radio" name="spotFormato" value="wav"> WAV</label>
        <label class="radio-pill"><input type="radio" name="spotFormato" value="flac"> FLAC</label>
      </div>
      <span class="opt-label" style="margin-left:14px">Qualidade</span>
      <div class="radio-group">
        <label class="radio-pill"><input type="radio" name="spotQualidade" value="128"> 128</label>
        <label class="radio-pill"><input type="radio" name="spotQualidade" value="192"> 192</label>
        <label class="radio-pill"><input type="radio" name="spotQualidade" value="320" checked> 320</label>
      </div>
    </div>
    <div class="spot-track-controls">
      <button class="btn-ghost btn-ghost-sm" onclick="App.spotSelectAll(true)">Selecionar tudo</button>
      <button class="btn-ghost btn-ghost-sm" onclick="App.spotSelectAll(false)">Desmarcar tudo</button>
    </div>
    <div id="spotTrackList" class="spot-track-list"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="App.closeSpotifyPreview()">Cancelar</button>
      <button class="btn-primary" id="btnSpotDownload" onclick="App.startSpotifyDownload()">
        Baixar <span id="spotDownloadCount">0</span> faixas →
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add ui/index.html
git commit -m "feat: HTML — modais de credenciais Spotify e preview de playlist"
```

---

## Task 3: CSS — Estilos dos modais e badge Spotify

**Files:**
- Modify: `ui/style.css`

- [ ] **Step 1: Adicionar estilos no final do style.css**

Acrescentar ao final do arquivo:

```css
/* ═══════════════════════════════════════════════════
   MODAIS SPOTIFY
   ═══════════════════════════════════════════════════ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 5, 13, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  opacity: 0;
  transition: opacity 200ms ease;
  backdrop-filter: blur(2px);
}
.modal-overlay.modal-visible { opacity: 1; }

.modal-card {
  background: #e8e8ee;
  border-radius: 14px;
  padding: 28px 28px 24px;
  width: 420px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transform: translateY(10px) scale(0.97);
  transition: transform 200ms cubic-bezier(.4,0,.2,1);
  box-shadow: 0 24px 60px rgba(0,0,0,.45);
}
.modal-overlay.modal-visible .modal-card { transform: translateY(0) scale(1); }

.modal-card-lg {
  width: 560px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: #0e0e1a;
  letter-spacing: -.01em;
}

.modal-close {
  background: none;
  border: none;
  font-size: 16px;
  color: #666;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 120ms;
}
.modal-close:hover { background: rgba(0,0,0,0.08); }

.modal-desc {
  font-size: 12px;
  color: #44445a;
  line-height: 1.6;
  margin: 0;
}

.modal-link {
  font-size: 12px;
  color: #1db954;
  cursor: pointer;
  font-weight: 600;
  text-decoration: underline;
  margin-top: -6px;
}
.modal-link:hover { color: #17a348; }

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.modal-field-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: #939393;
}

.modal-error {
  font-size: 11px;
  color: var(--red);
  background: rgba(231,76,60,.10);
  border-radius: 6px;
  padding: 8px 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

/* Spotify preview — formato/qualidade row */
.spot-format-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--main-b);
}

.spot-track-controls {
  display: flex;
  gap: 6px;
  margin-bottom: -4px;
}

.spot-track-list {
  overflow-y: auto;
  flex: 1;
  min-height: 120px;
  max-height: 340px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 4px;
}

.spot-track-item {
  border-radius: 6px;
  transition: background 100ms;
}
.spot-track-item:hover { background: rgba(0,0,0,0.05); }

.spot-track-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  cursor: pointer;
  width: 100%;
}

.spot-track-check { flex-shrink: 0; cursor: pointer; }

.spot-track-num {
  font-family: var(--mono);
  font-size: 10px;
  color: #999;
  width: 22px;
  flex-shrink: 0;
  text-align: right;
}

.spot-track-titulo {
  font-size: 12px;
  font-weight: 600;
  color: #0e0e1a;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spot-track-artista {
  font-size: 11px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.spot-track-dur {
  font-family: var(--mono);
  font-size: 10px;
  color: #999;
  flex-shrink: 0;
  margin-left: auto;
}

/* Badge Spotify no histórico */
.hist-fonte-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .06em;
  background: #1db954;
  color: #fff;
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
  vertical-align: middle;
  text-transform: uppercase;
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/style.css
git commit -m "style: CSS para modais Spotify e badge no histórico"
```

---

## Task 4: JavaScript — Lógica Spotify

**Files:**
- Modify: `ui/app.js`

- [ ] **Step 1: Adicionar estado Spotify ao objeto App**

No início do objeto `App` (após `queueActive: null,`, por volta da linha 13), adicionar:

```js
  spotifyUrl:    '',
  spotifyTracks: [],
```

- [ ] **Step 2: Adicionar `case 'spotify_tracks'` ao `App.handle`**

Dentro do `switch (event)` em `App.handle` (antes do fechamento `}`), adicionar após o `case 'history_update'`:

```js
      case 'spotify_tracks': {
        document.getElementById('urlHint').textContent = ''
        if (!data.ok) {
          if (data.error === 'no_credentials') {
            App.openSpotifyCredModal()
          } else {
            document.getElementById('urlHint').textContent = '❌ ' + data.error
          }
        } else {
          App.openSpotifyPreview(data)
        }
        break
      }
```

- [ ] **Step 3: Interceptar download de playlist Spotify em `App.download()`**

No início do método `download()` (antes da linha `const tipo = ...`), adicionar:

```js
    const rawUrl = document.getElementById('urlInput').value.trim()
    if (/open\.spotify\.com\/playlist\//i.test(rawUrl)) {
      App.openSpotifyFlow(rawUrl)
      return
    }
```

- [ ] **Step 4: Atualizar `detectUrlType` para Spotify playlist**

No início da função `App.detectUrlType` (após a verificação `if (!url || !url.trim()) return null`), adicionar antes de `let hostname`:

```js
  if (/open\.spotify\.com\/playlist\//i.test(url.trim())) {
    return {
      tipo: null,
      bloqueados: [],
      hint: '🎵 Playlist Spotify — clique em Baixar para importar',
    }
  }
```

- [ ] **Step 5: Atualizar `_queueMeta` para faixas Spotify**

Substituir o método `_queueMeta` existente:

```js
  _queueMeta(params) {
    if (params.fonte === 'Spotify') return `🎵 Spotify · ${(params.formato||'mp3').toUpperCase()} · ${params.qualidade||'320'}kbps`
    if (params.tipo === 'video')    return `🎬 ${params.resolucao || '720'}p`
    if (params.tipo === 'playlist') return `📋 Playlist · ${(params.formato || 'mp3').toUpperCase()} ${params.qualidade || '192'}kbps`
    return `🎵 ${(params.formato || 'mp3').toUpperCase()} · ${params.qualidade || '192'}kbps`
  },
```

- [ ] **Step 6: Atualizar `_makeHistCard` para exibir badge Spotify**

Substituir o método `_makeHistCard` existente:

```js
  _makeHistCard(item, delay) {
    const card = document.createElement('div')
    card.className = 'hist-card'
    card.style.animationDelay = (delay * 20) + 'ms'

    const pasta      = item.arquivo ? item.arquivo.replace(/[^/\\]*$/, '').slice(0, -1) : ''
    const spotBadge  = item.fonte === 'Spotify'
      ? `<span class="hist-fonte-badge">Spotify</span>` : ''

    card.innerHTML = `
      <div class="hist-badge">${this._esc((item.formato || 'mp3').toUpperCase())}</div>
      <div class="hist-info">
        <div class="hist-title">${this._esc((item.titulo || '').substring(0, 52))}${spotBadge}</div>
        <div class="hist-meta">${this._esc(item.qualidade || '')} · ${this._esc(item.data || '')}</div>
      </div>
      ${pasta ? `<button class="hist-open" data-path="${this._esc(pasta)}">📂</button>` : ''}
    `
    if (pasta) {
      card.querySelector('.hist-open').addEventListener('click', async () => {
        await window.pywebview.api.open_folder(pasta)
      })
    }
    return card
  },
```

- [ ] **Step 7: Adicionar todos os métodos Spotify ao App**

Antes da linha `/* ── Aguardar pywebview estar pronto ── */` (final do app.js), adicionar:

```js
/* ══════════════════════════════════════════════════════
   SPOTIFY — fluxo de importação de playlist
   ══════════════════════════════════════════════════════ */

App.openSpotifyFlow = function(url) {
  this.spotifyUrl = url
  document.getElementById('urlHint').textContent = '⏳ Carregando playlist Spotify…'
  window.pywebview.api.get_spotify_playlist_info(url)
}

App.openSpotifyCredModal = function() {
  document.getElementById('spotClientId').value      = ''
  document.getElementById('spotClientSecret').value  = ''
  document.getElementById('spotCredError').style.display = 'none'
  document.getElementById('btnSpotConnect').disabled  = false
  document.getElementById('btnSpotConnect').textContent = 'Conectar'
  const m = document.getElementById('spotifyCredModal')
  m.style.display = 'flex'
  requestAnimationFrame(() => m.classList.add('modal-visible'))
}

App.closeSpotifyCredModal = function() {
  const m = document.getElementById('spotifyCredModal')
  m.classList.remove('modal-visible')
  setTimeout(() => { m.style.display = 'none' }, 220)
}

App.openSpotifyDevLink = function() {
  window.pywebview.api.open_url('https://developer.spotify.com/dashboard')
}

App.saveSpotifyCredentials = async function() {
  const btn       = document.getElementById('btnSpotConnect')
  const errEl     = document.getElementById('spotCredError')
  const clientId  = document.getElementById('spotClientId').value.trim()
  const secret    = document.getElementById('spotClientSecret').value.trim()

  if (!clientId || !secret) {
    errEl.textContent    = 'Preencha os dois campos.'
    errEl.style.display  = 'block'
    return
  }

  btn.disabled    = true
  btn.textContent = '⏳ Verificando…'
  errEl.style.display = 'none'

  const r = await window.pywebview.api.save_spotify_credentials({
    client_id:     clientId,
    client_secret: secret,
  })

  btn.disabled    = false
  btn.textContent = 'Conectar'

  if (!r.ok) {
    errEl.textContent   = r.error
    errEl.style.display = 'block'
    return
  }

  App.closeSpotifyCredModal()
  document.getElementById('urlHint').textContent = '⏳ Carregando playlist Spotify…'
  window.pywebview.api.get_spotify_playlist_info(App.spotifyUrl)
}

App.openSpotifyPreview = function(data) {
  App.spotifyTracks = data.faixas
  document.getElementById('spotPlaylistName').textContent =
    data.playlist_nome + '  •  ' + data.faixas.length + ' faixas'

  const list = document.getElementById('spotTrackList')
  list.innerHTML = ''
  data.faixas.forEach((faixa, i) => {
    const item = document.createElement('div')
    item.className = 'spot-track-item'
    item.innerHTML = `
      <label class="spot-track-label">
        <input type="checkbox" class="spot-track-check" data-index="${i}" checked>
        <span class="spot-track-num">${i + 1}.</span>
        <span class="spot-track-titulo">${App._esc(faixa.titulo)}</span>
        <span class="spot-track-artista">— ${App._esc(faixa.artista)}</span>
        <span class="spot-track-dur">${App._esc(faixa.duracao)}</span>
      </label>
    `
    item.querySelector('input').addEventListener('change', () => App.updateSpotDownloadCount())
    list.appendChild(item)
  })
  App.updateSpotDownloadCount()

  const modal = document.getElementById('spotifyPreviewModal')
  modal.style.display = 'flex'
  requestAnimationFrame(() => modal.classList.add('modal-visible'))
}

App.closeSpotifyPreview = function() {
  const m = document.getElementById('spotifyPreviewModal')
  m.classList.remove('modal-visible')
  setTimeout(() => { m.style.display = 'none' }, 220)
}

App.spotSelectAll = function(checked) {
  document.querySelectorAll('.spot-track-check').forEach(c => { c.checked = checked })
  App.updateSpotDownloadCount()
}

App.updateSpotDownloadCount = function() {
  const count = document.querySelectorAll('.spot-track-check:checked').length
  document.getElementById('spotDownloadCount').textContent = count
  document.getElementById('btnSpotDownload').disabled = count === 0
}

App.startSpotifyDownload = function() {
  const formato   = document.querySelector('input[name="spotFormato"]:checked')?.value  || 'mp3'
  const qualidade = document.querySelector('input[name="spotQualidade"]:checked')?.value || '320'
  const organizar = document.getElementById('chkOrganizar').checked
  const metadados = document.getElementById('chkMeta').checked
  const pular     = document.getElementById('chkSkip').checked
  const notificar = document.getElementById('chkNotify').checked

  const selecionadas = []
  document.querySelectorAll('.spot-track-check:checked').forEach(c => {
    selecionadas.push(App.spotifyTracks[parseInt(c.dataset.index)])
  })

  App.closeSpotifyPreview()
  document.getElementById('urlInput').value = ''

  selecionadas.forEach(faixa => {
    const query  = `ytsearch1:${faixa.titulo} ${faixa.artista}`
    const params = {
      url:              query,
      tipo:             'musica',
      formato,
      qualidade,
      organizar,
      metadados,
      pular_duplicados: pular,
      notificar,
      recorte:          false,
      recorte_inicio:   '',
      recorte_fim:      '',
      fonte:            'Spotify',
    }
    App.queue.push({
      id:     'q_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      url:    query,
      titulo: `${faixa.titulo} — ${faixa.artista}`,
      params,
      status: 'aguardando',
      pct:    0,
      erro:   null,
    })
  })

  App.renderQueue()
  if (!App.queueRunning) App.processQueue()
}
```

- [ ] **Step 8: Commit**

```bash
git add ui/app.js
git commit -m "feat: JS — detecção Spotify, modais, fila e badge no histórico"
```

---

## Task 5: Commit final e PR

- [ ] **Step 1: Criar branch feat/spotify-import e reorganizar commits (se ainda não fez)**

Se todos os commits acima foram feitos diretamente na branch de trabalho, apenas garanta que está na branch correta:

```bash
git checkout -b feat/spotify-import
# (se já estiver na branch certa, pule este passo)
```

- [ ] **Step 2: Push e abrir PR**

```bash
git push origin feat/spotify-import
gh pr create \
  --title "feat: importação de playlist Spotify" \
  --body "Permite colar link do Spotify, selecionar faixas com checkboxes e baixar via YouTube. Usa Spotify Web API (Client Credentials). Badge 'Spotify' no histórico."
```
