/**
 * YT Downloader v3 — app.js
 * Gerencia toda a UI e se comunica com o backend Python via pywebview
 */

const App = {

  /* ── Estado ───────────────────────────────────────────── */
  downloading: false,
  tema: 'dark',
  pastaFull: '',

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
      this.log('⚠ Erro ao iniciar: ' + e, 'err')
    }
  },

  /* ══════════════════════════════════════════════════════
     EVENTOS vindos do Python via evaluate_js
     ══════════════════════════════════════════════════════ */
  handle(event, data) {
    switch (event) {
      case 'progress':       this.updateProgress(data);       break
      case 'log':            this.log(data.msg);              break
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
      this.log('📁 Carregado: ' + r.nome)
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
      this.log('⚠ Cole um link antes de baixar', 'err')
      return
    }

    const r = await window.pywebview.api.start_download(params)

    if (!r.ok) {
      this.log('❌ ' + r.error, 'err')
      return
    }

    this.downloading = true
    this.setBtnState(true)
    this.showProgress(true)
    this.log('⬇ Download iniciado…')
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
      if (bar) {
        bar.style.width = '100%'
        bar.style.background = 'linear-gradient(90deg, #059669, #10b981)'
      }
      this.setStatus('✅ Concluído!')
    } else {
      if (bar) bar.style.background = '#f43f5e'
      this.setStatus('❌ ' + (data.error || 'Erro no download'))
    }

    // Resetar barra após 4 segundos
    setTimeout(() => {
      if (bar) {
        bar.style.width = '0%'
        bar.style.background = ''
      }
      this.setStatus('Pronto para baixar')
      document.getElementById('progDetail').textContent = ''
    }, 4000)
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

    const results = await window.pywebview.api.search_youtube(q)

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
    this.log('🗑 Histórico limpo')
  },

  /* ══════════════════════════════════════════════════════
     LOG
     ══════════════════════════════════════════════════════ */
  log(msg, type = '') {
    const box   = document.getElementById('logBox')
    if (!box) return
    const entry = document.createElement('div')
    entry.className = 'log-entry' + (type ? ' ' + type : '')

    const isOk  = msg.startsWith('✅')
    const isErr = msg.startsWith('❌')
    if (isOk)  entry.classList.add('ok')
    if (isErr) entry.classList.add('err')

    const now = new Date()
    const hh  = String(now.getHours()).padStart(2,'0')
    const mm  = String(now.getMinutes()).padStart(2,'0')
    const ss  = String(now.getSeconds()).padStart(2,'0')
    entry.textContent = `[${hh}:${mm}:${ss}] ${msg}`

    box.appendChild(entry)
    box.scrollTop = box.scrollHeight

    // Manter máximo de 80 linhas
    while (box.children.length > 80) box.removeChild(box.firstChild)
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

/* ── Extras para v3 UI ─────────────────────────────── */

App.onTipoChange = function() {
  const tipo = document.querySelector('input[name="tipo"]:checked')?.value
  document.getElementById('audioOpts').style.display = tipo === 'video' ? 'none' : 'block'
  document.getElementById('videoOpts').style.display = tipo === 'video' ? 'block' : 'none'
}

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
