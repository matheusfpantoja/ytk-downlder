/**
 * YT Downloader v3 — app.js
 * Gerencia toda a UI e se comunica com o backend Python via pywebview
 */

const App = {

  /* ── Estado ───────────────────────────────────────────── */
  tema: 'light',
  pastaFull: '',
  queue: [],
  queueRunning: false,
  queueActive: null,
  subtitleActive: false,
  captionActive: false,
  captionFilePath: null,
  logHistory: [],

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

      // Logs emitidos antes de a página existir chegam aqui de uma vez
      ;(d.logs_iniciais || []).forEach(msg => {
        const time = new Date().toLocaleTimeString('pt-BR', { hour12: false })
        this.logHistory.push(`[${time}] ${msg}`)
      })

      if (d.ffmpeg_ok === false) {
        this.addWarning(
          '<strong>FFmpeg não encontrado.</strong> Sem ele, downloads de música e vídeo vão falhar. ' +
          'Baixe a versão "essentials", extraia e adicione a pasta bin ao PATH do Windows. ' +
          '<button class="app-warn-link" onclick="App.abrirSiteFFmpeg()">Abrir página de download</button>'
        )
      }
      if (d.pasta_indisponivel) {
        this.addWarning(
          '<strong>Pasta indisponível.</strong> A pasta configurada (' + this._esc(d.pasta_indisponivel) +
          ') não pôde ser acessada. Os arquivos serão salvos na pasta padrão até você escolher outra em "Salvar em".'
        )
      }

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
      case 'progress': {
        if (this.subtitleActive) {
          const bar = document.getElementById('subtitleProgBar')
          const detalhe = document.getElementById('subtitleProgDetalhe')
          const titulo = document.getElementById('subtitleProgTitulo')
          if (bar) bar.style.width = Math.round((data.pct || 0) * 100) + '%'
          if (detalhe) detalhe.textContent = data.detalhe || ''
          if (data.titulo && titulo) titulo.textContent = data.titulo.slice(0, 52)
        }
        if (!this.queueActive) break
        const item = this.queue.find(i => i.id === this.queueActive)
        if (item) item.pct = data.pct || 0
        if (item && data.titulo) item.titulo = data.titulo.slice(0, 52)
        const card = document.querySelector(`.queue-card[data-id="${this.queueActive}"]`)
        if (card) {
          const bar     = card.querySelector('.queue-bar-fill')
          const detalhe = card.querySelector('.queue-detalhe')
          const titulo  = card.querySelector('.queue-titulo')
          if (bar)     bar.style.width      = Math.round((data.pct || 0) * 100) + '%'
          if (detalhe) detalhe.textContent  = data.detalhe || ''
          if (data.titulo && titulo) titulo.textContent = data.titulo.slice(0, 52)
        }
        break
      }
      case 'status': {
        if (this.subtitleActive) {
          const detalhe = document.getElementById('subtitleProgDetalhe')
          if (detalhe) detalhe.textContent = data.msg || ''
        }
        if (this.captionActive) {
          const detalhe = document.getElementById('captionProgDetalhe')
          if (detalhe) detalhe.textContent = data.msg || ''
        }
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
            if (data.skipped) {
              item.status = 'pulado'
              item.erro   = 'Já estava no histórico — nada foi baixado.'
              item.pct    = 0
            } else {
              item.status = data.ok ? 'concluido' : 'erro'
              item.erro   = data.ok ? null : (data.error || 'Erro no download')
              item.pct    = data.ok ? 1 : item.pct
            }
          }
          this.queueActive = null
          this.renderQueue()
          this.processQueue()
        }
        if (this.subtitleActive) {
          const card = document.getElementById('subtitleProgressCard')
          const icon = document.getElementById('subtitleProgIcon')
          const barTrack = document.getElementById('subtitleProgBarTrack')
          const bar = document.getElementById('subtitleProgBar')
          const detalhe = document.getElementById('subtitleProgDetalhe')
          const btn = document.getElementById('btnSubtitle')
          if (card) card.dataset.status = data.ok ? 'concluido' : 'erro'
          if (icon) icon.textContent = data.ok ? '✓' : '✕'
          if (bar) bar.style.width = data.ok ? '100%' : (bar.style.width || '0%')
          if (barTrack) barTrack.style.display = data.ok ? 'none' : 'block'
          if (detalhe) detalhe.textContent = data.ok
            ? 'Concluído! Arquivos salvos na pasta de downloads.'
            : (data.error || 'Erro desconhecido.')
          if (btn) btn.disabled = false
          const cancelBtn = document.getElementById('subtitleCancelBtn')
          if (cancelBtn) cancelBtn.style.display = 'none'
          this.subtitleActive = false
          if (!this.queueActive) this.processQueue()
        }
        if (this.captionActive) {
          const card = document.getElementById('captionProgressCard')
          const icon = document.getElementById('captionProgIcon')
          const detalhe = document.getElementById('captionProgDetalhe')
          const btn = document.getElementById('btnCaption')
          if (card) card.dataset.status = data.ok ? 'concluido' : 'erro'
          if (icon) icon.textContent = data.ok ? '✓' : '✕'
          if (detalhe) detalhe.textContent = data.ok
            ? 'Concluído! O .srt foi salvo ao lado do vídeo.'
            : (data.error || 'Erro desconhecido.')
          if (btn) btn.disabled = false
          const cancelBtnC = document.getElementById('captionCancelBtn')
          if (cancelBtnC) cancelBtnC.style.display = 'none'
          this.captionActive = false
          if (!this.queueActive) this.processQueue()
        }
        break
      }
      case 'history_update':
        this.prependHistoryItem(data.item)
        break
      case 'caption_file_dropped': {
        this.tab('caption')
        this.captionFilePath = data.path
        const nameEl = document.getElementById('captionFileName')
        if (nameEl) nameEl.textContent = data.nome
        const btn = document.getElementById('btnCaption')
        if (btn) btn.disabled = false
        break
      }
      case 'warn':
        this.addWarning(data.msg || '')
        break
      case 'log': {
        const time = new Date().toLocaleTimeString('pt-BR', { hour12: false })
        this.logHistory.push(`[${time}] ${data.msg}`)
        if (this.logHistory.length > 500) this.logHistory.shift()
        this._refreshLogModalIfOpen()
        break
      }
    }
  },

  _ocupado() {
    // Fila e abas de legenda compartilham os mesmos eventos do Python.
    // Enquanto não houver identificação por operação, só uma pode rodar por vez —
    // senão o "download_complete" de uma marca a outra como concluída.
    return this.queueActive !== null || this.subtitleActive || this.captionActive
  },

  addWarning(html) {
    const el = document.getElementById('appWarn')
    if (!el) return
    const div = document.createElement('div')
    div.className = 'app-warn-item'
    div.innerHTML = html
    el.appendChild(div)
    el.style.display = 'block'
  },

  abrirSiteFFmpeg() {
    window.pywebview.api.open_url('https://www.gyan.dev/ffmpeg/builds/')
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
    const themeIcon = document.getElementById('themeIcon')
    if (themeIcon) themeIcon.textContent = t === 'dark' ? '◐' : '○'
    document.getElementById('themeLabel').textContent = t === 'dark' ? 'Tema claro' : 'Tema escuro'
  },

  async toggleTheme() {
    this.tema = this.tema === 'dark' ? 'light' : 'dark'
    this.applyTheme(this.tema)
    try {
      await window.pywebview.api.save_config({ tema: this.tema })
    } catch (e) { this._falhou('salvar tema', e) }
  },

  toggleSidebar() {
    const app = document.querySelector('.app')
    const collapsed = app.classList.toggle('sidebar-collapsed')
    try { localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0') } catch (_) {}
  },

  /* ══════════════════════════════════════════════════════
     PASTA
     ══════════════════════════════════════════════════════ */
  async chooseFolder() {
    try {
      const r = await window.pywebview.api.choose_folder()
      if (r.ok) {
        this.pastaFull = r.pasta_full
        document.getElementById('folderPath').textContent = r.pasta
      }
    } catch (e) { this._falhou('escolher pasta', e) }
  },

  async openFolder() {
    try {
      await window.pywebview.api.open_folder(this.pastaFull)
    } catch (e) { this._falhou('abrir pasta', e) }
  },

  /* ══════════════════════════════════════════════════════
     TXT
     ══════════════════════════════════════════════════════ */
  async loadTxt() {
    try {
      const r = await window.pywebview.api.open_txt_dialog()
      if (r.ok) {
        document.getElementById('urlInput').value = 'TXT:' + r.path
      }
    } catch (e) { this._falhou('carregar .txt', e) }
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
      playlist:         document.getElementById('chkPlaylist')?.checked || false,
    }
    return params
  },

  /* ══════════════════════════════════════════════════════
     DOWNLOAD
     ══════════════════════════════════════════════════════ */
  async download() {
    try {
      const raw  = document.getElementById('urlInput').value || ''
      const urls = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      if (!urls.length) return

      if (document.getElementById('trimCheck')?.checked) {
        const re = /^\d{1,2}(:\d{1,2}){1,2}$/
        const ini = document.getElementById('trimStart').value.trim()
        const fim = document.getElementById('trimEnd').value.trim()
        if ((ini && !re.test(ini)) || (fim && !re.test(fim))) {
          alert('Horário de recorte inválido.\n\nUse mm:ss (ex: 1:30) ou hh:mm:ss (ex: 0:01:30).')
          return
        }
        if (!ini && !fim) {
          alert('O recorte está ativado mas nenhum horário foi preenchido.')
          return
        }
      }
      if (document.getElementById('chkPlaylist')?.checked) {
        const ok = confirm(
          'A opção "Baixar playlist inteira" está marcada.\n\n' +
          'Isso pode baixar dezenas ou centenas de arquivos e demorar bastante.\n\n' +
          'Deseja continuar?'
        )
        if (!ok) return
      }
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
    } catch (e) {
      const time = new Date().toLocaleTimeString('pt-BR', { hour12: false })
      this.logHistory.push(`[${time}] ❌ Exceção em download(): ${e?.stack || e}`)
      this._refreshLogModalIfOpen()
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

  openSitesModal() {
    const m = document.getElementById('sitesModal')
    m.style.display = 'flex'
    requestAnimationFrame(() => m.classList.add('popup-visible'))
  },

  closeSitesModal(e) {
    if (e && e.target !== document.getElementById('sitesModal')) return
    const m = document.getElementById('sitesModal')
    m.classList.remove('popup-visible')
    setTimeout(() => { m.style.display = 'none' }, 220)
  },

  openLogModal(isError) {
    this.renderLogModal()
    const icon = document.getElementById('logModalIcon')
    if (icon) icon.style.display = isError ? 'flex' : 'none'
    const m = document.getElementById('logModal')
    m.style.display = 'flex'
    requestAnimationFrame(() => m.classList.add('popup-visible'))
  },

  closeLogModal(e) {
    if (e && e.target !== document.getElementById('logModal')) return
    const m = document.getElementById('logModal')
    m.classList.remove('popup-visible')
    setTimeout(() => { m.style.display = 'none' }, 220)
  },

  renderLogModal() {
    const body = document.getElementById('logModalBody')
    if (!body) return
    body.textContent = this.logHistory.length ? this.logHistory.join('\n') : 'Nenhum log registrado ainda.'
    body.scrollTop = body.scrollHeight
  },

  _refreshLogModalIfOpen() {
    const m = document.getElementById('logModal')
    if (m && m.style.display === 'flex') this.renderLogModal()
  },

  async copyLog() {
    try {
      await navigator.clipboard.writeText(this.logHistory.join('\n'))
      const btn = document.getElementById('logCopyBtn')
      if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copiado!'; setTimeout(() => btn.textContent = orig, 1500) }
    } catch (_) {}
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
    let results = []
    try {
      results = await window.pywebview.api.search_youtube(q, source)
    } catch (e) {
      btn.disabled = false
      btn.textContent = 'Buscar'
      status.textContent = 'Erro ao buscar. Veja os Logs para detalhes.'
      this._falhou('busca', e)
      return
    }

    btn.disabled    = false
    btn.textContent = 'Buscar'

    if (!results || results.length === 0) {
      status.textContent = 'Nenhum resultado.'
      return
    }

    status.textContent = results.length + ' resultados'
    this.renderSearchResults(results, source)
  },

  renderSearchResults(results, source) {
    const list = document.getElementById('searchResults')
    list.innerHTML = ''
    results.forEach((r, i) => {
      const card = document.createElement('div')
      card.className = 'result-card'
      card.style.animationDelay = (i * 30) + 'ms'

      // YouTube permite baixar áudio OU vídeo — oferece as duas opções
      // explicitamente, sem depender do que está marcado na aba Download.
      // SoundCloud/Mixcloud só têm áudio, então um único botão basta.
      const acoes = source === 'youtube'
        ? `
          <div class="result-actions">
            <button class="btn-down-sm" data-url="${this._esc(r.url)}" data-tipo="musica">♪ Áudio</button>
            <button class="btn-down-sm" data-url="${this._esc(r.url)}" data-tipo="video">▶ Vídeo</button>
          </div>
        `
        : `
          <div class="result-actions">
            <button class="btn-down-sm" data-url="${this._esc(r.url)}" data-tipo="musica">⬇ Baixar</button>
          </div>
        `

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
        ${acoes}
      `
      card.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.downloadFromSearch(e.currentTarget.dataset.url, e.currentTarget.dataset.tipo)
        })
      })
      list.appendChild(card)
    })
  },

  downloadFromSearch(url, tipo) {
    document.getElementById('urlInput').value = url
    this.tab('download')

    if (tipo) {
      const radio = document.querySelector(`input[name="tipo"][value="${tipo}"]`)
      if (radio) radio.checked = true
    }
    this.applyUrlDetection(this.detectUrlType(url))

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
        <span class="emoji">♪</span>
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
      ${pasta ? `<button class="hist-open" data-path="${this._esc(pasta)}">↗</button>` : ''}
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
    try {
      await window.pywebview.api.clear_history()
      this.renderHistoryEmpty()
    } catch (e) { this._falhou('limpar histórico', e) }
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
    const tit = document.querySelector('.queue-header-title')
    if (tit) {
      const pend = this.queue.filter(i => i.status === 'aguardando' || i.status === 'baixando').length
      tit.textContent = pend
        ? `Fila de downloads — ${pend} pendente${pend > 1 ? 's' : ''}`
        : 'Fila de downloads'
    }
  },

  _makeQueueCard(item) {
    const icons = { aguardando: '◌', baixando: '⬇', concluido: '✓', erro: '✕', pulado: '⏭' }
    const card  = document.createElement('div')
    card.className  = 'queue-card'
    card.dataset.id = item.id
    card.dataset.status = item.status
    const showBar    = item.status === 'baixando'
    const isBaixando = item.status === 'baixando'
    const detalhesBtn = item.status === 'erro'
      ? `<button class="queue-details-btn" onclick="App.openLogModal(true)">Ver log completo</button>`
      : ''
    const cancelBtn = isBaixando
      ? `<button class="queue-cancel-btn" onclick="App.cancelDownload()">Cancelar</button>`
      : ''
    const removeBtn = isBaixando
      ? ''
      : `<button class="queue-remove" onclick="App.removeFromQueue('${this._esc(item.id)}')">✕</button>`
    card.innerHTML = `
      <div class="queue-icon">${icons[item.status] || '◌'}</div>
      <div class="queue-info">
        <div class="queue-titulo">${this._esc(item.titulo)}</div>
        <div class="queue-meta">${this._esc(this._queueMeta(item.params))}</div>
        <div class="queue-bar-track" style="display:${showBar ? 'block' : 'none'}">
          <div class="queue-bar-fill" style="width:${Math.round((item.pct || 0) * 100)}%"></div>
        </div>
        <div class="queue-detalhe">${this._esc(item.erro || '')}</div>
      </div>
      ${detalhesBtn}
      ${cancelBtn}
      ${removeBtn}
    `
    return card
  },

  _queueMeta(params) {
    const prefix = params.playlist ? '☰ Playlist · ' : ''
    if (params.tipo === 'video') return `${prefix}▶ ${params.resolucao || '720'}p`
    return `${prefix}♪ ${(params.formato || 'mp3').toUpperCase()} · ${params.qualidade || '192'}kbps`
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

  async cancelDownload() {
    await window.pywebview.api.cancel_download()
  },

  clearQueueDone() {
    this.queue = this.queue.filter(i => i.status === 'aguardando' || i.status === 'baixando')
    this.renderQueue()
  },

  async processQueue() {
    // Espera a aba de legenda terminar antes de puxar o próximo item da fila.
    // Quando ela terminar, o handle('download_complete') chama processQueue de novo.
    if (this.subtitleActive || this.captionActive) {
      this.queueRunning = false
      return
    }
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

    try {
      const r = await window.pywebview.api.start_download(item.params)
      if (!r.ok) {
        item.status = 'erro'
        item.erro   = r.error || 'Erro ao iniciar download'
        const time = new Date().toLocaleTimeString('pt-BR', { hour12: false })
        this.logHistory.push(`[${time}] ❌ Falha ao iniciar: ${item.erro}`)
        this.queueActive = null
        this.renderQueue()
        this.processQueue()
      }
    } catch (e) {
      item.status = 'erro'
      item.erro   = 'Erro inesperado ao iniciar download: ' + (e?.message || e)
      const time = new Date().toLocaleTimeString('pt-BR', { hour12: false })
      this.logHistory.push(`[${time}] ❌ Exceção em processQueue: ${e?.stack || e}`)
      this._refreshLogModalIfOpen()
      this.queueActive = null
      this.renderQueue()
      this.processQueue()
    }
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

  _falhou(onde, e) {
    const time = new Date().toLocaleTimeString('pt-BR', { hour12: false })
    this.logHistory.push(`[${time}] ❌ Falha em ${onde}: ${e?.message || e}`)
    this._refreshLogModalIfOpen()
    alert('Não foi possível completar a ação (' + onde + ').\n\nAbra "Logs" na barra lateral para ver o detalhe.')
  },

  onSubtitleModeChange() {
    const mode = document.querySelector('input[name="subtitleMode"]:checked').value
    document.getElementById('subtitleNativeOpts').style.display  = mode === 'native'  ? '' : 'none'
    document.getElementById('subtitleWhisperOpts').style.display = mode === 'whisper' ? '' : 'none'
    document.getElementById('subtitleNativeInfo').style.display  = mode === 'native'  ? '' : 'none'
    document.getElementById('subtitleWhisperInfo').style.display = mode === 'whisper' ? '' : 'none'
  },

  toggleWhisperInfo() {
    const panel = document.getElementById('whisperInfoPanel')
    const icon  = document.getElementById('whisperInfoToggleIcon')
    const abrir = panel.style.display === 'none'
    panel.style.display = abrir ? 'block' : 'none'
    icon.textContent = abrir ? '▾' : '▸'
  },

  async downloadSubtitle() {
    const url = (document.getElementById('subtitleUrl').value || '').trim()
    if (!url) { alert('Cole uma URL primeiro.'); return; }
    if (this._ocupado()) {
      alert('Já existe um download ou transcrição em andamento. Espere terminar (ou cancele) antes de começar outro.')
      return
    }
    const mode = document.querySelector('input[name="subtitleMode"]:checked').value
    const btn = document.getElementById('btnSubtitle')

    this.subtitleActive = true
    const wrap = document.getElementById('subtitleProgressWrap')
    const card = document.getElementById('subtitleProgressCard')
    const icon = document.getElementById('subtitleProgIcon')
    const titulo = document.getElementById('subtitleProgTitulo')
    const meta = document.getElementById('subtitleProgMeta')
    const barTrack = document.getElementById('subtitleProgBarTrack')
    const bar = document.getElementById('subtitleProgBar')
    const detalhe = document.getElementById('subtitleProgDetalhe')

    if (wrap) wrap.style.display = 'block'
    if (card) card.dataset.status = 'baixando'
    if (icon) icon.textContent = '⬇'
    if (titulo) titulo.textContent = 'Preparando…'
    if (meta) meta.textContent = mode === 'whisper' ? '⚙ Whisper (IA)' : '❝ Legenda nativa'
    if (barTrack) barTrack.style.display = 'block'
    const cancelBtn = document.getElementById('subtitleCancelBtn')
    if (cancelBtn) cancelBtn.style.display = ''
    if (bar) bar.style.width = '0%'
    if (detalhe) detalhe.textContent = ''
    btn.disabled = true

    try {
      let res
      if (mode === 'native') {
        const lang = document.querySelector('input[name="subLang"]:checked').value
        res = await window.pywebview.api.get_subtitles(url, lang, 'srt')
      } else {
        const model = document.querySelector('input[name="whisperModel"]:checked').value
        const lang  = document.querySelector('input[name="whisperLang"]:checked').value
        res = await window.pywebview.api.transcribe_whisper(url, lang, model)
      }
      if (!res.ok) {
        if (card) card.dataset.status = 'erro'
        if (icon) icon.textContent = '✕'
        if (detalhe) detalhe.textContent = res.error || 'Erro desconhecido.'
        btn.disabled = false
        this.subtitleActive = false
      }
    } catch (e) {
      if (card) card.dataset.status = 'erro'
      if (icon) icon.textContent = '✕'
      if (detalhe) detalhe.textContent = 'Erro ao iniciar: ' + e.message
      btn.disabled = false
      this.subtitleActive = false
    }
  },

  async chooseVideoFile() {
    try {
      const r = await window.pywebview.api.choose_video_dialog()
      if (r.ok) {
        this.captionFilePath = r.path
        document.getElementById('captionFileName').textContent = r.nome
        document.getElementById('btnCaption').disabled = false
      }
    } catch (e) { this._falhou('escolher vídeo', e) }
  },

  async generateCaption() {
    if (!this.captionFilePath) { alert('Escolha um vídeo primeiro.'); return }
    if (this._ocupado()) {
      alert('Já existe um download ou transcrição em andamento. Espere terminar (ou cancele) antes de começar outro.')
      return
    }
    const model = document.querySelector('input[name="captionModel"]:checked').value
    const lang  = document.querySelector('input[name="captionLang"]:checked').value
    const btn = document.getElementById('btnCaption')

    this.captionActive = true
    const wrap = document.getElementById('captionProgressWrap')
    const card = document.getElementById('captionProgressCard')
    const icon = document.getElementById('captionProgIcon')
    const titulo = document.getElementById('captionProgTitulo')
    const meta = document.getElementById('captionProgMeta')
    const detalhe = document.getElementById('captionProgDetalhe')

    if (wrap) wrap.style.display = 'block'
    if (card) card.dataset.status = 'baixando'
    if (icon) icon.textContent = '✎'
    if (titulo) titulo.textContent = 'Preparando…'
    if (meta) meta.textContent = `⚙ Whisper (IA) · ${model}`
    if (detalhe) detalhe.textContent = ''
    const cancelBtnC = document.getElementById('captionCancelBtn')
    if (cancelBtnC) cancelBtnC.style.display = ''
    btn.disabled = true

    try {
      const res = await window.pywebview.api.transcribe_whisper_local(this.captionFilePath, lang, model)
      if (!res.ok) {
        if (card) card.dataset.status = 'erro'
        if (icon) icon.textContent = '✕'
        if (detalhe) detalhe.textContent = res.error || 'Erro desconhecido.'
        btn.disabled = false
        this.captionActive = false
      }
    } catch (e) {
      if (card) card.dataset.status = 'erro'
      if (icon) icon.textContent = '✕'
      if (detalhe) detalhe.textContent = 'Erro ao iniciar: ' + e.message
      btn.disabled = false
      this.captionActive = false
    }
  },
}

/* ── Aguardar pywebview estar pronto ──────── */
window.addEventListener('pywebviewready', () => App.init())

/* Fallback caso pywebview já esteja pronto */
if (window.pywebview) App.init()

/* ── Atalhos de teclado globais ─────────────────────────── */
document.addEventListener('keydown', async (e) => {
  // Ignora quando estiver digitando em campos de texto — antes, Ctrl+D/H/F/S
  // trocavam de aba no meio da digitação.
  const tag = document.activeElement?.tagName
  const digitando = tag === 'INPUT' || tag === 'TEXTAREA'

  // key.toLowerCase(): com CapsLock ligado, e.key vem 'D' e nenhum atalho funcionava
  const tecla = (e.key || '').toLowerCase()

  // Escape → cancela operação em andamento (funciona mesmo digitando)
  if (e.key === 'Escape' && (App.queueRunning || App.subtitleActive || App.captionActive)) {
    e.preventDefault()
    await App.cancelDownload()
    return
  }

  if (!e.ctrlKey || digitando) return

  // Ctrl+D → aba Download
  if (tecla === 'd') {
    e.preventDefault()
    App.tab('download')
    return
  }

  // Ctrl+H → aba Histórico
  if (tecla === 'h') {
    e.preventDefault()
    App.tab('history')
    return
  }

  // Ctrl+F ou Ctrl+S → aba Busca + foco no campo
  if (tecla === 'f' || tecla === 's') {
    e.preventDefault()
    App.tab('search')
    setTimeout(() => document.getElementById('searchInput')?.focus(), 50)
    return
  }

  // Ctrl+V fora de campos → cola a URL e inicia o download
  if (tecla === 'v') {
    e.preventDefault()
    try {
      const texto = (await navigator.clipboard.readText() || '').trim()
      if (!/^https?:\/\//i.test(texto)) {
        // Antes, links de sites suportados mas fora de uma lista curta eram
        // ignorados sem nenhuma mensagem — parecia app travado.
        alert('A área de transferência não contém um link.\n\nCopie o endereço do vídeo ou da música e tente de novo.')
        return
      }
      App.tab('download')
      const input = document.getElementById('urlInput')
      input.value = texto
      input.dispatchEvent(new Event('input'))
      App.download()
    } catch (_) {
      alert('Não foi possível ler a área de transferência.')
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
    const tipos = e.dataTransfer?.types || []
    const temArquivo = tipos.includes('Files')
    const temLink = tipos.includes('text/uri-list') || tipos.includes('text/plain') || temArquivo
    if (!temLink) return
    dragDepth++
    // O texto do overlay dizia sempre "Solte o link aqui", mesmo ao arrastar
    // um arquivo de vídeo do Explorer.
    const txt = overlay.querySelector('.drop-overlay-text')
    const sub = overlay.querySelector('.drop-overlay-sub')
    if (temArquivo && !tipos.includes('text/uri-list')) {
      if (txt) txt.textContent = 'Solte o vídeo aqui'
      if (sub) sub.textContent = 'A legenda será gerada na aba Criar Legenda'
    } else {
      if (txt) txt.textContent = 'Solte o link aqui'
      if (sub) sub.textContent = 'YouTube, SoundCloud, Vimeo e mais'
    }
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

/* ── Clique direito no campo de link: cola automaticamente ─── */
;(function () {
  function attachRightClickPaste(id) {
    const el = document.getElementById(id)
    if (!el || el._rightClickPasteBound) return
    el._rightClickPasteBound = true
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault()
      try {
        const texto = await navigator.clipboard.readText()
        if (texto && texto.trim()) {
          el.value = texto.trim()
          el.dispatchEvent(new Event('input'))
        }
      } catch (_) {
        // Permissão de clipboard negada — ignora silenciosamente
      }
    })
  }
  attachRightClickPaste('urlInput')
  attachRightClickPaste('subtitleUrl')
})()

/* ── Extras para v3 UI ─────────────────────────────── */

App.toggleInfoTip = function(e, id) {
  e.stopPropagation()
  const tip = document.getElementById(id)
  if (!tip) return
  const jaVisivel = tip.classList.contains('visible')
  document.querySelectorAll('.info-tip.visible').forEach(t => t.classList.remove('visible'))
  if (!jaVisivel) tip.classList.add('visible')
}

// Fecha qualquer balão aberto ao clicar fora dele
document.addEventListener('click', () => {
  document.querySelectorAll('.info-tip.visible').forEach(t => t.classList.remove('visible'))
})

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
    const hints = []
    if (isPlaylist) hints.push('☰ Este link faz parte de uma playlist — marque a caixa abaixo se quiser baixar todos os itens')
    return { tipo: null, bloqueados: [], isPlaylist, hint: hints.join(' \xB7 ') }
  }

  const hints = []
  let bloqueados = []
  let tipo = null

  if (isAudioOnly) {
    const siteName = hostname.split('.').slice(-2).join('.')
    const label = siteName.charAt(0).toUpperCase() + siteName.slice(1)
    hints.push('♪ ' + label + ' detectado — v\xEDdeo n\xE3o dispon\xEDvel')
    bloqueados = ['video']
    tipo = 'musica'
  }

  if (isPlaylist) {
    hints.push('☰ Este link faz parte de uma playlist — marque a caixa abaixo se quiser baixar todos os itens')
  }

  return { tipo, bloqueados, isPlaylist, hint: hints.join(' \xB7 ') }
}

App.applyUrlDetection = function(resultado) {
  const hintEl = document.getElementById('urlHint')
  const playlistChk = document.getElementById('chkPlaylist')

  document.querySelectorAll('input[name="tipo"]').forEach(r => {
    r.closest('label').style.opacity = ''
    r.closest('label').style.pointerEvents = ''
  })

  if (!resultado) {
    if (hintEl) hintEl.textContent = ''
    if (playlistChk) playlistChk.checked = false
    this.onPlaylistChange()
    this.onTipoChange()
    return
  }

  if (resultado.bloqueados && resultado.bloqueados.length) {
    resultado.bloqueados.forEach(val => {
      const radio = document.querySelector('input[name="tipo"][value="' + val + '"]')
      if (radio) {
        radio.closest('label').style.opacity = '0.35'
        radio.closest('label').style.pointerEvents = 'none'
        if (radio.checked) {
          const musica = document.querySelector('input[name="tipo"][value="musica"]')
          if (musica) musica.checked = true
        }
      }
    })
  }

  if (resultado.tipo) {
    const radio = document.querySelector('input[name="tipo"][value="' + resultado.tipo + '"]')
    if (radio) radio.checked = true
  }

  // NÃO marcar playlist automaticamente: todo link copiado de dentro de uma
  // playlist do YouTube tem "&list=", e marcar sozinho fazia o usuário baixar
  // centenas de vídeos sem querer. Só sugerimos pelo texto do hint.

  if (hintEl) hintEl.textContent = resultado.hint || ''

  this.onPlaylistChange()
  this.onTipoChange()
}

App.onPlaylistChange = function() {
  const on = document.getElementById('chkPlaylist')?.checked
  const trimCheck = document.getElementById('trimCheck')
  const trimRow = trimCheck ? trimCheck.closest('.opt-row') : null
  if (trimCheck) {
    trimCheck.disabled = !!on
    if (on) {
      trimCheck.checked = false
      this.toggleTrim()
    }
  }
  if (trimRow) trimRow.style.opacity = on ? '0.4' : ''
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

;(function () {
  try {
    if (localStorage.getItem('sidebarCollapsed') === '1') {
      document.querySelector('.app')?.classList.add('sidebar-collapsed')
    }
  } catch (_) {}
})()
