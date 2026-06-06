/**
 * YT Downloader v3 — app.js
 * Gerencia toda a UI e se comunica com o backend Python via pywebview
 */

const App = {

  /* ── Estado ───────────────────────────────────────────── */
  downloading: false,
  tema: 'dark',
  pastaFull: '',
  queue: [],
  queueRunning: false,
  queueActive: null,

  /* ══════════════════════════════════════════════════════
     INIT — chamado quando pywebview estiver pronto
     ══════════════════════════════════════════════════════ */
  async init() {
    try {
      const d = await window.pywebview.api.get_initial_data()

      // Tema
      this.tema = d.tema || 'dark'
      this.applyTheme(this.tema)

      // Pasta
      this.pastaFull = d.pasta_full || ''
      document.getElementById('folderPath').textContent = d.pasta || '–'

      // Histórico inicial
      if (d.historico && d.historico.length > 0) {
        this.renderHistory(d.historico)
      } else {
        this.renderHistoryEmpty()
      }

    } catch (e) {
      console.error('Erro ao iniciar: ' + e)
    }
  },

  /* ══════════════════════════════════════════════════════
     EVENTOS vindos do Python via evaluate_js
     ══════════════════════════════════════════════════════ */
  handle(event, data) {
    switch (event) {
      case 'progress':       this.updateProgress(data);       break
      case 'status':         this.setStatus(data.msg);        break
      case 'download_complete': this.onDownloadDone(data);    break
      case 'history_update': this.prependHistoryItem(data.item); break
    }
  },

  /* ══════════════════════════════════════════════════════
     NAVEGAÇÃO
     ══════════════════════════════════════════════════════ */
  tab(name) {
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name)
    )
    document.querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === 'tab-' + name)
    )
  },

  /* ══════════════════════════════════════════════════════
     TEMA
     ══════════════════════════════════════════════════════ */
  applyTheme(t) {
    document.documentElement.dataset.tema = t
    document.getElementById('themeIcon').textContent  = t === 'dark' ? '◐' : '○'
    document.getElementById('themeLabel').textContent = t === 'dark' ? 'Tema claro' : 'Tema escuro'
  },

  async toggleTheme() {
    this.tema = this.tema === 'dark' ? 'light' : 'dark'
    this.applyTheme(this.tema)
    await window.pywebview.api.save_config({ tema: this.tema })
  },

  /* ══════════════════════════════════════════════════════
     PASTA
     ══════════════════════════════════════════════════════ */
  async chooseFolder() {
    const r = await window.pywebview.api.choose_folder()
    if (r.ok) {
      this.pastaFull = r.pasta_full
      document.getElementById('folderPath').textContent = r.pasta
    }
  },

  async openFolder() {
    await window.pywebview.api.open_folder(this.pastaFull)
  },

  /* ══════════════════════════════════════════════════════
     TXT
     ══════════════════════════════════════════════════════ */
  async loadTxt() {
    const r = await window.pywebview.api.open_txt_dialog()
    if (r.ok) {
      document.getElementById('urlInput').value = 'TXT:' + r.path
    }
  },

  /* ══════════════════════════════════════════════════════
     OPÇÕES — mostrar/esconder áudio vs vídeo
     ══════════════════════════════════════════════════════ */
  toggleTrim() {
    const on = document.getElementById('trimCheck').checked
    document.getElementById('trimStart').disabled = !on
    document.getElementById('trimEnd').disabled   = !on
  },

  _buildParams() {
    const tipo = document.querySelector('input[name="tipo"]:checked')?.value || 'musica'
    const params = {
      url:              document.getElementById('urlInput').value.trim(),
      tipo,
      qualidade:        document.querySelector('input[name="qualidade"]:checked')?.value || '192',
      formato:          document.querySelector('input[name="formato"]:checked')?.value  || 'mp3',
      resolucao:        document.querySelector('input[name="resolucao"]:checked')?.value || '720',
      organizar:        document.getElementById('chkOrganizar').checked,
      metadados:        document.getElementById('chkMeta').checked,
      pular_duplicados: document.getElementById('chkSkip').checked,
      notificar:        document.getElementById('chkNotify').checked,
      recorte:          document.getElementById('trimCheck').checked,
      recorte_inicio:   document.getElementById('trimStart').value.trim(),
      recorte_fim:      document.getElementById('trimEnd').value.trim(),
    }
    return params
  },

  /* ══════════════════════════════════════════════════════
     DOWNLOAD
     ══════════════════════════════════════════════════════ */
  async download() {
    if (this.downloading) return

    // Mostrar/esconder opções de acordo com o tipo
    const tipo = document.querySelector('input[name="tipo"]:checked')?.value
    document.getElementById('audioOpts').style.display = tipo === 'video' ? 'none' : 'block'
    document.getElementById('videoOpts').style.display = tipo === 'video' ? 'block' : 'none'

    const params = this._buildParams()
    if (!params.url) {
      return
    }

    const r = await window.pywebview.api.start_download(params)

    if (!r.ok) {
      this.showPopup(false, r.error)
      return
    }

    this.downloading = true
    this.setBtnState(true)
    this.showProgress(true)
  },

  updateProgress(d) {
    const bar    = document.getElementById('progBar')
    const status = document.getElementById('progStatus')
    const detail = document.getElementById('progDetail')

    if (bar)    bar.style.width    = Math.round(d.pct * 100) + '%'
    if (status) status.textContent = d.titulo ? '⬇ ' + d.titulo : 'Baixando…'
    if (detail) detail.textContent = d.detalhe || ''
  },

  setStatus(msg) {
    const el = document.getElementById('progStatus')
    if (el) el.textContent = msg
  },

  onDownloadDone(data) {
    this.downloading = false
    this.setBtnState(false)

    const bar = document.getElementById('progBar')

    if (data.ok) {
      if (bar) { bar.style.width = '100%' }
      setTimeout(() => {
        this.showPopup(true, null)
        if (bar) { bar.style.width = '0%'; bar.style.background = '' }
        this.setStatus('Pronto para baixar')
        const det = document.getElementById('progDetail')
        if (det) det.textContent = ''
      }, 600)
    } else {
      if (bar) bar.style.background = '#f43f5e'
      const msg = data.error || 'Ocorreu um erro durante o download.'
      setTimeout(() => {
        this.showPopup(false, msg)
        if (bar) { bar.style.width = '0%'; bar.style.background = '' }
        this.setStatus('Pronto para baixar')
        const det = document.getElementById('progDetail')
        if (det) det.textContent = ''
      }, 600)
    }
  },

  showPopup(ok, errorMsg) {
    const popup    = document.getElementById('downloadPopup')
    const iconWrap = document.getElementById('popupIconWrap')
    const icon     = document.getElementById('popupIcon')
    const title    = document.getElementById('popupTitle')
    const msg      = document.getElementById('popupMsg')

    if (ok) {
      iconWrap.className = 'popup-icon-wrap popup-icon-ok'
      icon.innerHTML = '<polyline points="20 6 9 17 4 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
      title.textContent = 'Download concluído!'
      msg.textContent   = 'Seu arquivo foi salvo com sucesso.'
    } else {
      iconWrap.className = 'popup-icon-wrap popup-icon-err'
      icon.innerHTML = '<line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>'
      title.textContent = 'Erro no download'
      msg.textContent   = errorMsg || 'Ocorreu um erro. Tente novamente.'
    }

    popup.style.display = 'flex'
    requestAnimationFrame(() => popup.classList.add('popup-visible'))
  },

  closePopup(e) {
    if (e && e.target !== document.getElementById('downloadPopup')) return
    const popup = document.getElementById('downloadPopup')
    popup.classList.remove('popup-visible')
    setTimeout(() => { popup.style.display = 'none' }, 220)
  },

  setBtnState(loading) {
    const btn   = document.getElementById('btnDownload')
    const label = document.getElementById('btnLabel')
    if (btn)   btn.disabled        = loading
    if (label) label.textContent   = loading ? '⏳  Baixando…' : '⬇  Baixar agora'
  },

  showProgress(show) {
    const card = document.getElementById('progressCard')
    if (card) card.style.display = show ? 'block' : 'none'
  },

  /* ══════════════════════════════════════════════════════
     BUSCA
     ══════════════════════════════════════════════════════ */
  async search() {
    const q = document.getElementById('searchInput').value.trim()
    if (!q) return

    const btn    = document.getElementById('btnSearch')
    const status = document.getElementById('searchStatus')
    const list   = document.getElementById('searchResults')

    btn.disabled       = true
    btn.textContent    = '⏳'
    status.textContent = 'Buscando…'
    list.innerHTML     = ''

    const source = document.querySelector('input[name="searchSource"]:checked')?.value || 'youtube'
    const results = await window.pywebview.api.search_youtube(q, source)

    btn.disabled    = false
    btn.textContent = 'Buscar'

    if (!results || results.length === 0) {
      status.textContent = 'Nenhum resultado.'
      return
    }

    status.textContent = results.length + ' resultados'
    this.renderSearchResults(results)
  },

  renderSearchResults(results) {
    const list = document.getElementById('searchResults')
    list.innerHTML = ''
    results.forEach((r, i) => {
      const card = document.createElement('div')
      card.className = 'result-card'
      card.style.animationDelay = (i * 30) + 'ms'
      card.innerHTML = `
        ${r.thumb
          ? `<img class="result-thumb" src="${r.thumb}" alt="" loading="lazy">`
          : `<div class="result-thumb"></div>`
        }
        <div class="result-info">
          <div class="result-title">${this._esc(r.titulo)}</div>
          <div class="result-meta">
            <span>${this._esc(r.canal)}</span>
            ${r.duracao ? `<span class="dot">·</span><span>${r.duracao}</span>` : ''}
          </div>
        </div>
        <button class="btn-down-sm" data-url="${this._esc(r.url)}">⬇ Baixar</button>
      `
      card.querySelector('button').addEventListener('click', (e) => {
        this.downloadFromSearch(e.target.dataset.url)
      })
      list.appendChild(card)
    })
  },

  downloadFromSearch(url) {
    document.getElementById('urlInput').value = url
    this.tab('download')
    this.download()
  },

  /* ══════════════════════════════════════════════════════
     HISTÓRICO
     ══════════════════════════════════════════════════════ */
  renderHistory(items) {
    const list = document.getElementById('historyList')
    list.innerHTML = ''
    if (!items || items.length === 0) {
      this.renderHistoryEmpty()
      return
    }
    items.forEach((item, i) => {
      list.appendChild(this._makeHistCard(item, i))
    })
  },

  renderHistoryEmpty() {
    document.getElementById('historyList').innerHTML = `
      <div class="empty">
        <span class="emoji">🎵</span>
        Nenhum download ainda.<br>Baixe sua primeira música!
      </div>
    `
  },

  prependHistoryItem(item) {
    const list = document.getElementById('historyList')
    // Remover empty state se existir
    const empty = list.querySelector('.empty')
    if (empty) empty.remove()
    list.prepend(this._makeHistCard(item, 0))
  },

  _makeHistCard(item, delay) {
    const card = document.createElement('div')
    card.className = 'hist-card'
    card.style.animationDelay = (delay * 20) + 'ms'

    const pasta = item.arquivo ? item.arquivo.replace(/[^/\\]*$/, '').slice(0, -1) : ''

    card.innerHTML = `
      <div class="hist-badge">${this._esc((item.formato || 'mp3').toUpperCase())}</div>
      <div class="hist-info">
        <div class="hist-title">${this._esc((item.titulo || '').substring(0, 52))}</div>
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

  async clearHistory() {
    if (!confirm('Limpar todo o histórico de downloads?')) return
    await window.pywebview.api.clear_history()
    this.renderHistoryEmpty()
  },

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

  /* ══════════════════════════════════════════════════════
     UTILS
     ══════════════════════════════════════════════════════ */
  _esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
  },
}

/* ── Aguardar pywebview estar pronto ──────── */
window.addEventListener('pywebviewready', () => App.init())

/* Fallback caso pywebview já esteja pronto */
if (window.pywebview) App.init()

/* ── Atalhos de teclado globais ─────────────────────────── */
document.addEventListener('keydown', async (e) => {
  // Ignora quando estiver digitando em campos de texto
  const tag = document.activeElement?.tagName
  const digitando = tag === 'INPUT' || tag === 'TEXTAREA'

  // Ctrl+D → aba Download
  if (e.ctrlKey && e.key === 'd') {
    e.preventDefault()
    App.tab('download')
    return
  }

  // Ctrl+H → aba Histórico
  if (e.ctrlKey && e.key === 'h') {
    e.preventDefault()
    App.tab('history')
    return
  }

  // Ctrl+F ou Ctrl+S → aba Busca + foco no campo
  if (e.ctrlKey && (e.key === 'f' || e.key === 's')) {
    e.preventDefault()
    App.tab('search')
    setTimeout(() => document.getElementById('searchInput')?.focus(), 50)
    return
  }

  // Escape → cancela download em andamento
  if (e.key === 'Escape' && App.downloading) {
    e.preventDefault()
    await window.pywebview.api.cancel_download()
    return
  }

  // Ctrl+V → colar URL e iniciar download (apenas fora de campos de texto)
  if (e.ctrlKey && e.key === 'v' && !digitando) {
    e.preventDefault()
    try {
      const texto = await navigator.clipboard.readText()
      const urlValida = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|soundcloud\.com|bandcamp\.com|vimeo\.com|dailymotion\.com|twitch\.tv|music\.youtube\.com)/.test(texto.trim())
      if (urlValida) {
        App.tab('download')
        document.getElementById('urlInput').value = texto.trim()
        App.download()
      }
    } catch (_) {
      // Permissão de clipboard negada — ignora silenciosamente
    }
    return
  }
})

/* ── Drag & Drop global ─────────────────────────────── */
;(function () {
  const overlay = document.getElementById('dropOverlay')
  if (!overlay) return

  // Contador de entradas para lidar com drag sobre elementos filhos
  let dragDepth = 0

  function extrairUrl(dt) {
    // text/uri-list é o formato padrão para links arrastados do browser
    const uriList = dt.getData('text/uri-list')
    if (uriList) {
      const primeira = uriList.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'))
      if (primeira) return primeira
    }
    // Fallback: text/plain
    const texto = dt.getData('text/plain')
    if (texto && /^https?:\/\//i.test(texto.trim())) return texto.trim()
    return null
  }

  document.addEventListener('dragenter', (e) => {
    // Só mostra o overlay se o item arrastado contém um link/texto
    const tipos = e.dataTransfer?.types || []
    const temLink = tipos.includes('text/uri-list') || tipos.includes('text/plain')
    if (!temLink) return
    dragDepth++
    overlay.classList.add('drop-active')
  })

  document.addEventListener('dragleave', () => {
    dragDepth--
    if (dragDepth <= 0) {
      dragDepth = 0
      overlay.classList.remove('drop-active')
    }
  })

  document.addEventListener('dragover', (e) => {
    e.preventDefault() // necessário para permitir o drop
    e.dataTransfer.dropEffect = 'copy'
  })

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
})()

/* ── Extras para v3 UI ─────────────────────────────── */

App.onTipoChange = function() {
  const tipo = document.querySelector('input[name="tipo"]:checked')?.value
  document.getElementById('audioOpts').style.display = tipo === 'video' ? 'none' : 'block'
  document.getElementById('videoOpts').style.display = tipo === 'video' ? 'block' : 'none'
}

App.detectUrlType = function(url) {
  if (!url || !url.trim()) return null

  let hostname = ''
  try {
    hostname = new URL(url.trim()).hostname.replace(/^www\./, '')
  } catch (e) {
    return null
  }

  const AUDIO_ONLY = [
    'soundcloud.com', 'bandcamp.com', 'audiomack.com',
    'spotify.com', 'deezer.com', 'tidal.com', 'music.apple.com'
  ]
  const ALL_TYPES = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv'
  ]

  const PLAYLIST_PATTERNS = ['/sets/', '?list=', '&list=', '/playlist/', '/playlists/', '/albums/', '/album/']
  const isPlaylist = PLAYLIST_PATTERNS.some(p => url.includes(p))

  const isAudioOnly = AUDIO_ONLY.some(d => hostname === d || hostname.endsWith('.' + d))
  const isKnown     = isAudioOnly || ALL_TYPES.some(d => hostname === d || hostname.endsWith('.' + d))

  if (!isKnown) {
    // Domínio desconhecido mas ainda validamos playlist
    const bloqueados = isPlaylist ? [] : ['playlist']
    const hints = []
    if (isPlaylist) {
      hints.push('📋 Playlist detectada — tipo alterado automaticamente')
    } else {
      hints.push('⚠️ Link n\xE3o reconhecido como playlist')
    }
    return { tipo: isPlaylist ? 'playlist' : null, bloqueados, hint: hints.join(' \xB7 ') }
  }

  const hints = []
  let bloqueados = []
  let tipo = null

  if (isAudioOnly) {
    const siteName = hostname.split('.').slice(-2).join('.')
    const label = siteName.charAt(0).toUpperCase() + siteName.slice(1)
    hints.push('🎵 ' + label + ' detectado — v\xEDdeo n\xE3o dispon\xEDvel')
    bloqueados = ['video']
    tipo = 'musica'
  }

  if (isPlaylist) {
    hints.push('📋 Playlist detectada — tipo alterado automaticamente')
    tipo = 'playlist'
  } else {
    bloqueados.push('playlist')
    hints.push('⚠️ Link n\xE3o reconhecido como playlist')
  }

  return {
    tipo,
    bloqueados,
    hint: hints.join(' \xB7 ')
  }
}

App.applyUrlDetection = function(resultado) {
  const hintEl = document.getElementById('urlHint')

  // Restaurar todos os radio buttons
  document.querySelectorAll('input[name="tipo"]').forEach(r => {
    r.closest('label').style.opacity = ''
    r.closest('label').style.pointerEvents = ''
  })

  if (!resultado) {
    // Campo vazio: bloquear "playlist" (não faz sentido sem URL)
    const playlistRadio = document.querySelector('input[name="tipo"][value="playlist"]')
    if (playlistRadio) {
      playlistRadio.closest('label').style.opacity = '0.35'
      playlistRadio.closest('label').style.pointerEvents = 'none'
      if (playlistRadio.checked) {
        const musica = document.querySelector('input[name="tipo"][value="musica"]')
        if (musica) musica.checked = true
      }
    }
    if (hintEl) hintEl.textContent = ''
    this.onTipoChange()
    return
  }

  // Bloquear tipos inválidos
  if (resultado.bloqueados && resultado.bloqueados.length) {
    resultado.bloqueados.forEach(val => {
      const radio = document.querySelector('input[name="tipo"][value="' + val + '"]')
      if (radio) {
        radio.closest('label').style.opacity = '0.35'
        radio.closest('label').style.pointerEvents = 'none'
        // Se estava selecionado, trocar para "musica"
        if (radio.checked) {
          const musica = document.querySelector('input[name="tipo"][value="musica"]')
          if (musica) musica.checked = true
        }
      }
    })
  }

  // Selecionar tipo automaticamente
  if (resultado.tipo) {
    const radio = document.querySelector('input[name="tipo"][value="' + resultado.tipo + '"]')
    if (radio) radio.checked = true
  }

  // Mostrar hint
  if (hintEl) hintEl.textContent = resultado.hint || ''

  this.onTipoChange()
}

// Listener de detecção no campo URL
;(function() {
  function onUrlChange() {
    const url = document.getElementById('urlInput')?.value || ''
    const resultado = App.detectUrlType(url)
    if (!url.trim()) {
      App.applyUrlDetection(null)
    } else {
      App.applyUrlDetection(resultado)
    }
  }
  function attachListeners() {
    const input = document.getElementById('urlInput')
    if (input && !input._urlDetectBound) {
      input._urlDetectBound = true
      input.addEventListener('input', onUrlChange)
      input.addEventListener('paste', function() { setTimeout(onUrlChange, 0) })
    }
    // Estado inicial: campo vazio → bloquear playlist
    onUrlChange()
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachListeners)
  } else {
    attachListeners()
  }
})()

// Override tab para atualizar o topbar
const _origTab = App.tab.bind(App)
App.tab = function(name) {
  _origTab(name)
  const labels = { download: 'DOWNLOAD', search: 'BUSCAR', history: 'HISTÓRICO' }
  const el = document.getElementById('topbarTitle')
  if (el) el.innerHTML = '<span>YTK</span> — ' + (labels[name] || name.toUpperCase())
}

// Override applyTheme para o dot do sidebar
const _origTheme = App.applyTheme.bind(App)
App.applyTheme = function(t) {
  _origTheme(t)
  const lbl2 = document.getElementById('themeLabel2')
  if (lbl2) lbl2.textContent = t === 'dark' ? 'Tema claro' : 'Tema escuro'
}
