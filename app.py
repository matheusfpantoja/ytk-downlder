# teste de integração
"""
YouTube Downloader v3.0 — PyWebView
Backend Python puro + Interface Web moderna
"""

# DEVE ser as primeiras linhas executadas — impede janelas infinitas no .exe (PyInstaller)
import multiprocessing
multiprocessing.freeze_support()

import webview
import yt_dlp
from yt_dlp.utils import DownloadCancelled, download_range_func
import threading
import json
import os
import re
import shutil
import subprocess
import sys
import ssl
import tempfile
import urllib.request
import urllib.parse
from datetime import datetime

try:
    from plyer import notification as _plyer_notification
except Exception:
    _plyer_notification = None

try:
    import whisper as _whisper
    WHISPER_OK = True
except ImportError:
    _whisper = None
    WHISPER_OK = False


def _notify(title, message):
    """Envia notificação do SO; falha silenciosamente."""
    if _plyer_notification is None:
        return
    try:
        _plyer_notification.notify(
            title=title,
            message=message,
            app_name="YTK DOWNLDER",
            timeout=5,
        )
    except Exception:
        pass

# ─── Caminhos ─────────────────────────────────────────────────

import winreg

def _get_install_download_path():
    """Lê a pasta de download escolhida pelo instalador (registro do Windows)."""
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\YTK DOWNLDER")
        value, _ = winreg.QueryValueEx(key, "DownloadPath")
        winreg.CloseKey(key)
        if value and os.path.isdir(os.path.dirname(value)):
            return value
    except Exception:
        pass
    return os.path.join(os.path.expanduser("~"), "Músicas-YT")

def _pasta_utilizavel(p):
    """Testa se dá pra realmente criar/usar a pasta (drive removido, sem permissão etc)."""
    try:
        os.makedirs(p, exist_ok=True)
        return os.path.isdir(p)
    except Exception:
        return False


_pasta_escolhida = _get_install_download_path()
if _pasta_utilizavel(_pasta_escolhida):
    PASTA_PADRAO = _pasta_escolhida
    PASTA_INDISPONIVEL = None
else:
    # A pasta gravada pelo instalador não existe mais (HD externo desconectado,
    # drive removido, sem permissão). Nunca deixe isso derrubar o app antes da
    # janela abrir — cai pro fallback e avisa o usuário depois, na interface.
    PASTA_INDISPONIVEL = _pasta_escolhida
    _fallback = os.path.join(os.path.expanduser("~"), "Músicas-YT")
    PASTA_PADRAO = _fallback if _pasta_utilizavel(_fallback) else tempfile.gettempdir()

HISTORICO_PATH = os.path.join(PASTA_PADRAO, ".historico.json")
CONFIG_PATH    = os.path.join(PASTA_PADRAO, ".config.json")


def _load_config():
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _write_config(cfg):
    try:
        os.makedirs(PASTA_PADRAO, exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def resource_path(rel):
    """Resolve caminhos tanto em dev quanto dentro do .exe (PyInstaller)."""
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, rel)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), rel)


def get_ffmpeg_path():
    """Procura primeiro um ffmpeg empacotado junto do app; senão, cai no PATH do sistema."""
    bundled = resource_path(os.path.join("bin", "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"))
    if os.path.exists(bundled):
        return bundled
    return shutil.which("ffmpeg")  # pode retornar None


# Reduz risco de erro 429 (Too Many Requests) do YouTube, especialmente
# em downloads de legenda, que fazem uma requisição HTTP extra.
YTDLP_SLEEP_OPTS = {
    "sleep_interval": 1,
    "max_sleep_interval": 3,
    "sleep_interval_subtitles": 2,
}

# Alguns códigos de idioma do Whisper não batem com os exigidos pelo
# serviço de tradução (ex: chinês). Mapeia as exceções conhecidas.
LANG_MAP_TRANSLATE = {
    "zh": "zh-CN",
}

def _map_lang_translate(code):
    return LANG_MAP_TRANSLATE.get(code, code)


def _norm_url(url):
    """Normaliza a URL para comparação de duplicados.

    O usuário cola youtu.be/ID, watch?v=ID&list=..., com utm_source etc — e o
    histórico grava a URL canônica devolvida pelo yt-dlp. Sem normalizar, o
    "pular duplicados" quase nunca casava em download único.
    """
    if not url:
        return ""
    u = url.strip().lower()
    m = re.search(r'(?:v=|youtu\.be/|/shorts/|/embed/)([a-z0-9_-]{11})', u)
    if m:
        return "yt:" + m.group(1)
    u = u.split("?")[0].split("#")[0]
    return u.rstrip("/")


# ─── Histórico ────────────────────────────────────────────────

class Historico:
    def __init__(self):
        try:
            os.makedirs(PASTA_PADRAO, exist_ok=True)
        except Exception:
            pass
        self.itens = self._load()

    def _load(self):
        try:
            if os.path.exists(HISTORICO_PATH):
                with open(HISTORICO_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception:
            pass
        return []

    def save(self):
        try:
            with open(HISTORICO_PATH, "w", encoding="utf-8") as f:
                json.dump(self.itens, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def add(self, titulo, url, formato, qualidade, arquivo):
        self.itens.insert(0, {
            "titulo": titulo, "url": url,
            "formato": formato, "qualidade": qualidade,
            "arquivo": arquivo,
            "data": datetime.now().strftime("%d/%m/%Y %H:%M"),
        })
        self.itens = self.itens[:500]
        self.save()

    def has(self, url, formato=None):
        """Duplicado = mesma URL E mesmo formato. Quem baixou o MP3 e agora quer
        o MP4 do mesmo link não está baixando duas vezes a mesma coisa."""
        alvo = _norm_url(url)
        fmt = (formato or "").lower()
        for i in self.itens:
            if _norm_url(i.get("url", "")) != alvo:
                continue
            if not fmt or (i.get("formato") or "").lower() == fmt:
                return True
        return False

    def clear(self):
        self.itens = []
        self.save()


# ─── API exposta ao JavaScript ────────────────────────────────

class Api:
    """
    Todos os métodos públicos desta classe ficam acessíveis
    no JavaScript via: await window.pywebview.api.nome_metodo(args)
    """

    def __init__(self):
        self.historico     = Historico()
        self.baixando      = False
        self._cancelar     = False
        # Restaura a última pasta escolhida pelo usuário (persistida no .config.json).
        # Sem isso, a escolha se perde toda vez que o app fecha.
        _cfg = _load_config()
        _salva = _cfg.get("pasta")
        self.pasta_destino = _salva if (_salva and os.path.isdir(_salva)) else PASTA_PADRAO
        self._win          = None
        self.ffmpeg_path   = None
        self._playlist_status = ""
        self._pulou = False
        self._ui_ready = False
        self._logs_pendentes = []
        try:
            os.makedirs(self.pasta_destino, exist_ok=True)
        except Exception:
            self.pasta_destino = PASTA_PADRAO

    def set_window(self, w):
        self._win = w
        self.ffmpeg_path = get_ffmpeg_path()
        if not self.ffmpeg_path:
            self._emit("log", {"msg": "⚠️ FFmpeg não encontrado nesta máquina. Sem ele, downloads de música e vídeo vão falhar."})
        threading.Thread(target=self._verificar_ytdlp, daemon=True).start()

    def _verificar_ytdlp(self):
        # No .exe empacotado não dá pra rodar pip (abriria janelas infinitas),
        # mas um yt-dlp congelado quebra os downloads do YouTube em poucas semanas.
        # Então, no .exe, ao menos avisamos que existe versão mais nova.
        if getattr(sys, "frozen", False):
            self._checar_versao_ytdlp()
            return
        self._emit("log", {"msg": "Verificando atualizações do yt-dlp..."})
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
                capture_output=True, text=True, timeout=60
            )
            if "Successfully installed" in result.stdout:
                self._emit("log", {"msg": "yt-dlp atualizado com sucesso."})
            else:
                self._emit("log", {"msg": "yt-dlp já está na versão mais recente."})
        except Exception as e:
            self._emit("log", {"msg": f"Aviso: não foi possível verificar atualizações do yt-dlp ({e})"})

    def _checar_versao_ytdlp(self):
        """Compara a versão embutida com a última publicada. Só avisa, não atualiza."""
        try:
            from yt_dlp.version import __version__ as versao_local
        except Exception:
            return
        try:
            req = urllib.request.Request(
                "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
                headers={"User-Agent": "YTK-DOWNLDER"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                versao_remota = json.loads(resp.read()).get("tag_name", "")
        except Exception:
            return
        self._emit("log", {"msg": f"yt-dlp embutido: {versao_local} | mais recente: {versao_remota or '?'}"})
        if versao_remota and versao_remota.strip() != versao_local.strip():
            self._emit("warn", {"msg":
                "<strong>Existe uma versão mais nova do motor de download (yt-dlp).</strong> "
                f"Esta cópia usa a versão {versao_local}. Se downloads do YouTube começarem a falhar, "
                "instale a versão mais recente do YTK DOWNLDER."
            })

    # ── Comunicação Python → JS ──────────────────────────────

    def _emit(self, event, data=None):
        """Dispara evento para o JavaScript.

        Antes de a página carregar não existe App no JS: qualquer evento emitido
        nesse momento se perde. Logs emitidos cedo (aviso de FFmpeg, checagem do
        yt-dlp) ficam guardados e são entregues quando a UI avisa que está pronta.
        """
        if event == "log" and not self._ui_ready:
            self._logs_pendentes.append((data or {}).get("msg", ""))
            return
        if not self._win:
            return
        try:
            payload = json.dumps(data or {})
            self._win.evaluate_js(f'App.handle("{event}", {payload})')
        except Exception:
            pass

    # ── Inicialização ────────────────────────────────────────

    def get_initial_data(self):
        """Chamado pelo JS quando a página carrega."""
        cfg = _load_config()
        self._ui_ready = True
        logs = list(self._logs_pendentes)
        self._logs_pendentes = []
        return {
            "pasta":              self._short(self.pasta_destino),
            "pasta_full":         self.pasta_destino,
            "tema":               cfg.get("tema", "light"),
            "historico":          self.historico.itens[:100],
            "ffmpeg_ok":          bool(self.ffmpeg_path),
            "pasta_indisponivel": PASTA_INDISPONIVEL,
            "logs_iniciais":      logs,
        }

    def open_url(self, url):
        """Abre um link no navegador padrão do sistema (usado pelos avisos da UI)."""
        try:
            import webbrowser
            webbrowser.open(url)
            return True
        except Exception:
            return False

    def save_config(self, cfg):
        existing = _load_config()
        existing.update(cfg)
        _write_config(existing)
        return True

    # ── Pasta destino ────────────────────────────────────────

    def choose_folder(self):
        result = self._win.create_file_dialog(
            webview.FOLDER_DIALOG,
            directory=self.pasta_destino,
        )
        if result:
            self.pasta_destino = result[0]
            # Persiste a escolha — senão ela se perde ao fechar o app.
            cfg = _load_config()
            cfg["pasta"] = self.pasta_destino
            _write_config(cfg)
            return {
                "ok":        True,
                "pasta":     self._short(self.pasta_destino),
                "pasta_full": self.pasta_destino,
            }
        return {"ok": False}

    def open_folder(self, caminho=""):
        target = caminho if (caminho and os.path.isdir(caminho)) else self.pasta_destino
        if sys.platform == "win32":
            os.startfile(target)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", target])
        else:
            subprocess.Popen(["xdg-open", target])
        return True

    def open_txt_dialog(self):
        result = self._win.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=("Arquivo de texto (*.txt)",),
        )
        if result:
            return {"ok": True, "path": result[0],
                    "nome": os.path.basename(result[0])}
        return {"ok": False}

    # ── Download ─────────────────────────────────────────────

    def get_subtitles(self, url, lang='pt', formato='srt'):
        """Baixa vídeo + legenda nativa do vídeo (yt-dlp). Retorna {"ok": bool, "error": str|None}."""
        import threading
        def _run():
            try:
                if not self.ffmpeg_path:
                    raise Exception("FFmpeg não está instalado nesta máquina. Veja o log para o link de instalação.")
                self._emit('log', {'msg': f'💬 Baixando vídeo + legenda nativa ({lang})…'})
                pasta = str(self.pasta_destino)
                opts = {
                    'outtmpl': os.path.join(pasta, 'Vídeos', '%(uploader)s', '%(title)s.%(ext)s'),
                    'writesubtitles': True,
                    'writeautomaticsub': True,
                    'subtitleslangs': [lang],
                    'subtitlesformat': formato,
                    'skip_download': False,
                    'noplaylist': True,
                    'merge_output_format': 'mp4',
                    'ffmpeg_location': os.path.dirname(self.ffmpeg_path),
                    'progress_hooks': [self._hook],
                    'quiet': True,
                    'no_warnings': True,
                    **YTDLP_SLEEP_OPTS,
                }
                self._cancelar = False
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    titulo = info.get('title', url)
                arquivo = ''
                if info.get('requested_downloads'):
                    arquivo = info['requested_downloads'][0].get('filepath', '')
                if not arquivo:
                    arquivo = os.path.join(pasta, 'Vídeos', info.get('uploader', 'Unknown'), f"{titulo}.mp4")
                # yt-dlp baixa o vídeo mesmo quando não existe legenda no idioma
                # pedido. Sem checar isso, o app dizia "legenda baixada" sem .srt algum.
                tem_legenda = bool(info.get('requested_subtitles'))
                self.historico.add(titulo, url, 'SRT' if tem_legenda else 'MP4', lang.upper(), arquivo)
                if tem_legenda:
                    self._emit('download_complete', {'ok': True})
                    self._emit('log', {'msg': f'✅ Legenda baixada: {titulo}'})
                else:
                    self._emit('download_complete', {
                        'ok': False,
                        'error': f'Este vídeo não tem legenda disponível em "{lang.upper()}". '
                                 'O vídeo foi baixado normalmente. Para gerar a legenda mesmo assim, '
                                 'use o modo "Whisper (IA)".'
                    })
                    self._emit('log', {'msg': f'⚠️ Sem legenda em {lang.upper()}: {titulo}'})
                self._emit('history_update', {'item': self.historico.itens[0]})
            except DownloadCancelled:
                self._emit('download_complete', {'ok': False, 'error': 'Cancelado pelo usuário.'})
                self._emit('log', {'msg': '⏹ Operação cancelada.'})
            except Exception as e:
                if not self._cancelar:
                    erro_msg = self._friendly_error(e)
                    self._emit('download_complete', {'ok': False, 'error': erro_msg})
                    self._emit('log', {'msg': f'❌ Erro na legenda ({lang}): {erro_msg}'})
        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return {'ok': True}

    def _translate_texts(self, texts, source, target):
        """Traduz em lotes (poucas requisições). Depois de cada tradução, verifica
        se o resultado voltou IDÊNTICO ao original quando isso é suspeito (frase
        com 2+ palavras que deveria ter mudado de idioma) — o serviço gratuito às
        vezes 'falha silenciosamente', devolvendo sucesso sem realmente traduzir,
        sem lançar nenhum erro. Quando detecta esse padrão, tenta de novo o trecho
        individualmente (com pequenas pausas) antes de desistir e registrar no log."""
        import time
        from deep_translator import GoogleTranslator
        translator = GoogleTranslator(source=source, target=target)
        SEP = '\n'
        MAX_CHARS = 3000

        def _suspeito(original, traduzido):
            if not traduzido or not traduzido.strip():
                return True
            o, t = original.strip(), traduzido.strip()
            if o.lower() != t.lower():
                return False
            # Frases com 2+ palavras que voltaram idênticas são suspeitas de falha silenciosa.
            # Textos curtos (nomes próprios, números, "OK.") podem legitimamente não mudar.
            return len(o.split()) >= 2

        def _traduzir_lote(lote):
            joined = SEP.join(lote)
            try:
                result = translator.translate(joined) or ''
                partes = result.split(SEP)
                if len(partes) != len(lote):
                    return None
                return partes
            except Exception:
                return None

        def _traduzir_um(texto, tentativas=2):
            if not texto.strip():
                return texto, False
            for _ in range(tentativas):
                try:
                    out = translator.translate(texto)
                    if out and not _suspeito(texto, out):
                        return out, False
                except Exception:
                    pass
                time.sleep(0.25)
            return texto, True  # esgotou tentativas — mantém original, marca como falha real

        translated = []
        falhas = 0
        i = 0
        n = len(texts)
        while i < n:
            lote = []
            lote_len = 0
            while i < n and (lote_len + len(texts[i]) + 1) <= MAX_CHARS:
                lote.append(texts[i])
                lote_len += len(texts[i]) + 1
                i += 1
            if not lote:
                lote = [texts[i]]
                i += 1
            partes = _traduzir_lote(lote)
            if partes is None:
                partes = [None] * len(lote)
            for original, candidato in zip(lote, partes):
                if candidato is not None and not _suspeito(original, candidato):
                    translated.append(candidato)
                else:
                    out, falhou = _traduzir_um(original)
                    translated.append(out)
                    if falhou:
                        falhas += 1
            time.sleep(0.2)
        if falhas:
            self._emit('log', {'msg': f'⚠️ {falhas} de {len(texts)} trechos não puderam ser traduzidos mesmo após novas tentativas e permaneceram no idioma original.'})
        return translated

    def _chunk_words(self, segments, max_chars=80, max_duration=6.0, pause_gap=0.6):
        """Recorta os segmentos brutos do Whisper (que podem ser longos) em blocos
        menores de legenda, baseado em limite de caracteres, duração máxima e pausas
        naturais entre palavras — evita blocos gigantes que 'entregam' falas futuras."""
        cues = []
        current_words = []
        current_start = None
        last_end = None
        for seg in segments:
            words = seg.get('words') or []
            if not words:
                texto = seg.get('text', '').strip()
                if texto:
                    words = [{'word': texto, 'start': seg['start'], 'end': seg['end']}]
                else:
                    continue
            for w in words:
                word_text = (w.get('word') or '').strip()
                if not word_text:
                    continue
                w_start = w['start']
                w_end = w['end']
                if current_start is None:
                    current_start = w_start
                gap = (w_start - last_end) if last_end is not None else 0
                projected = (' '.join(x['word'].strip() for x in current_words) + ' ' + word_text).strip()
                duracao = w_end - current_start
                if current_words and (gap > pause_gap or len(projected) > max_chars or duracao > max_duration):
                    cue_text = ' '.join(x['word'].strip() for x in current_words).strip()
                    cues.append({'start': current_start, 'end': last_end, 'text': cue_text})
                    current_words = []
                    current_start = w_start
                current_words.append(w)
                last_end = w_end
        if current_words:
            cue_text = ' '.join(x['word'].strip() for x in current_words).strip()
            cues.append({'start': current_start, 'end': last_end, 'text': cue_text})
        return cues

    def transcribe_whisper(self, url, lang='pt', model_name='base'):
        """Baixa vídeo, transcreve com Whisper (detectando o idioma automaticamente)
        e traduz para o idioma escolhido, se necessário. Retorna {"ok": bool, "error": str|None}."""
        import threading, tempfile, shutil
        def _run():
            if not WHISPER_OK:
                self._emit('download_complete', {'ok': False, 'error': 'openai-whisper não está instalado. Rode: pip install openai-whisper'})
                self._emit('log', {'msg': '❌ Whisper não instalado (pip install openai-whisper)'})
                return
            tmp_dir = tempfile.mkdtemp(prefix='ytk_whisper_')
            try:
                if not self.ffmpeg_path:
                    raise Exception("FFmpeg não está instalado nesta máquina. Veja o log para o link de instalação.")
                self._cancelar = False
                self._emit('log', {'msg': f'🤖 Baixando vídeo para transcrição Whisper ({model_name})…'})
                pasta = str(self.pasta_destino)
                outtmpl = os.path.join(tmp_dir, '%(title)s.%(ext)s')
                opts_video = {
                    'outtmpl': outtmpl,
                    # Limite de 1080p: sem teto, um vídeo em 4K viraria vários GB
                    # de download só para transcrever o áudio.
                    'format': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/mp4',
                    'noplaylist': True,
                    'merge_output_format': 'mp4',
                    'ffmpeg_location': os.path.dirname(self.ffmpeg_path),
                    'progress_hooks': [self._hook],
                    'quiet': True,
                    'no_warnings': True,
                    **YTDLP_SLEEP_OPTS,
                }
                with yt_dlp.YoutubeDL(opts_video) as ydl:
                    info = ydl.extract_info(url, download=True)
                    titulo = info.get('title', url)
                # Pegar o caminho direto do yt-dlp é mais confiável que listar a
                # pasta e torcer para o primeiro .mp4 ser o certo.
                video_path = ''
                if info.get('requested_downloads'):
                    video_path = info['requested_downloads'][0].get('filepath', '')
                if not video_path or not os.path.exists(video_path):
                    video_files = [f for f in os.listdir(tmp_dir) if f.endswith('.mp4')]
                    if not video_files:
                        raise FileNotFoundError('Arquivo de vídeo não encontrado após download.')
                    video_path = os.path.join(tmp_dir, video_files[0])
                video_files = [os.path.basename(video_path)]

                if self._cancelar:
                    raise DownloadCancelled('Cancelado pelo usuário.')

                self._emit('status', {'msg': f'Transcrevendo com Whisper ({model_name})…'})
                self._emit('log', {'msg': f'🤖 Transcrevendo com Whisper ({model_name})…'})
                model = _whisper.load_model(model_name)
                # Sempre detecta o idioma falado automaticamente (language=None)
                # word_timestamps=True permite recortar a legenda em blocos menores e sincronizados
                result = model.transcribe(video_path, language=None, word_timestamps=True)
                detected_lang = result.get('language', 'en')

                if self._cancelar:
                    raise DownloadCancelled('Cancelado pelo usuário.')

                cues = self._chunk_words(result['segments'])
                texts = [c['text'] for c in cues]

                if lang != detected_lang:
                    self._emit('log', {'msg': f'🌐 Idioma detectado no vídeo: {detected_lang} — traduzindo legenda para {lang}…'})
                    self._emit('status', {'msg': f'Traduzindo legenda de {detected_lang} para {lang}…'})
                    src = _map_lang_translate(detected_lang)
                    tgt = _map_lang_translate(lang)
                    try:
                        texts = self._translate_texts(texts, src, tgt)
                    except Exception as e:
                        self._emit('log', {'msg': f'⚠️ Falha ao traduzir ({e}) — legenda ficará no idioma original ({detected_lang}).'})

                def _srt_time(seconds):
                    h = int(seconds // 3600)
                    m = int((seconds % 3600) // 60)
                    s = int(seconds % 60)
                    ms = int((seconds - int(seconds)) * 1000)
                    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'
                srt_lines = []
                for i, cue in enumerate(cues):
                    texto = texts[i] if i < len(texts) else cue['text']
                    srt_lines.append(str(i + 1))
                    srt_lines.append(f'{_srt_time(cue["start"])} --> {_srt_time(cue["end"])}')
                    srt_lines.append(texto.strip())
                    srt_lines.append('')
                srt_content = '\n'.join(srt_lines)

                artista_pasta = os.path.join(pasta, 'Vídeos', info.get('uploader', 'Unknown'))
                os.makedirs(artista_pasta, exist_ok=True)
                nome_base = os.path.splitext(video_files[0])[0]
                destino_video = os.path.join(artista_pasta, video_files[0])
                srt_path = os.path.join(artista_pasta, nome_base + '.srt')
                shutil.move(video_path, destino_video)
                with open(srt_path, 'w', encoding='utf-8') as f:
                    f.write(srt_content)

                self.historico.add(titulo, url, 'SRT (Whisper)', f'{model_name} → {lang}', destino_video)
                self._emit('download_complete', {'ok': True})
                self._emit('log', {'msg': f'✅ Transcrição concluída: {titulo}'})
                self._emit('history_update', {'item': self.historico.itens[0]})
            except DownloadCancelled:
                self._emit('download_complete', {'ok': False, 'error': 'Cancelado pelo usuário.'})
                self._emit('log', {'msg': '⏹ Operação cancelada.'})
            except Exception as e:
                if not self._cancelar:
                    erro_msg = self._friendly_error(e)
                    self._emit('download_complete', {'ok': False, 'error': erro_msg})
                    self._emit('log', {'msg': f'❌ Erro na transcrição Whisper: {erro_msg}'})
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)
        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return {'ok': True}

    def choose_video_dialog(self):
        """Abre diálogo nativo para escolher um vídeo já salvo no computador."""
        result = self._win.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=('Arquivos de vídeo (*.mp4;*.mkv;*.avi;*.mov;*.webm;*.flv;*.wmv;*.m4v)', 'Todos os arquivos (*.*)'),
        )
        if result:
            path = result[0]
            return {"ok": True, "path": path, "nome": os.path.basename(path)}
        return {"ok": False}

    def transcribe_whisper_local(self, path, lang='pt', model_name='base'):
        """Gera legenda (.srt) para um vídeo já existente no computador, sem
        baixar nada — reaproveita o mesmo pipeline Whisper usado para vídeos
        da internet. O arquivo original NÃO é movido nem alterado; o .srt é
        salvo ao lado dele, com o mesmo nome."""
        import threading
        def _run():
            if not WHISPER_OK:
                self._emit('download_complete', {'ok': False, 'error': 'openai-whisper não está instalado. Rode: pip install openai-whisper'})
                self._emit('log', {'msg': '❌ Whisper não instalado (pip install openai-whisper)'})
                return
            try:
                if not os.path.exists(path):
                    raise FileNotFoundError('Arquivo não encontrado: ' + path)
                self._cancelar = False
                titulo = os.path.splitext(os.path.basename(path))[0]
                self._emit('status', {'msg': f'Carregando modelo Whisper ({model_name})…'})
                self._emit('log', {'msg': f'📝 Gerando legenda local para: {titulo}'})
                model = _whisper.load_model(model_name)
                result = model.transcribe(path, language=None, word_timestamps=True)
                detected_lang = result.get('language', 'en')

                if self._cancelar:
                    raise DownloadCancelled('Cancelado pelo usuário.')

                cues = self._chunk_words(result['segments'])
                texts = [c['text'] for c in cues]

                if lang != detected_lang:
                    self._emit('log', {'msg': f'🌐 Idioma detectado no vídeo: {detected_lang} — traduzindo legenda para {lang}…'})
                    self._emit('status', {'msg': f'Traduzindo legenda de {detected_lang} para {lang}…'})
                    src = _map_lang_translate(detected_lang)
                    tgt = _map_lang_translate(lang)
                    try:
                        texts = self._translate_texts(texts, src, tgt)
                    except Exception as e:
                        self._emit('log', {'msg': f'⚠️ Falha ao traduzir ({e}) — legenda ficará no idioma original ({detected_lang}).'})

                def _srt_time(seconds):
                    h = int(seconds // 3600)
                    m = int((seconds % 3600) // 60)
                    s = int(seconds % 60)
                    ms = int((seconds - int(seconds)) * 1000)
                    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'
                srt_lines = []
                for i, cue in enumerate(cues):
                    texto = texts[i] if i < len(texts) else cue['text']
                    srt_lines.append(str(i + 1))
                    srt_lines.append(f'{_srt_time(cue["start"])} --> {_srt_time(cue["end"])}')
                    srt_lines.append(texto.strip())
                    srt_lines.append('')
                srt_content = '\n'.join(srt_lines)

                srt_path = os.path.splitext(path)[0] + '.srt'
                with open(srt_path, 'w', encoding='utf-8') as f:
                    f.write(srt_content)

                self.historico.add(titulo, path, 'SRT (Whisper local)', f'{model_name} → {lang}', path)
                self._emit('download_complete', {'ok': True})
                self._emit('log', {'msg': f'✅ Legenda local concluída: {titulo}'})
                self._emit('history_update', {'item': self.historico.itens[0]})
            except DownloadCancelled:
                self._emit('download_complete', {'ok': False, 'error': 'Cancelado pelo usuário.'})
                self._emit('log', {'msg': '⏹ Operação cancelada.'})
            except Exception as e:
                if not self._cancelar:
                    erro_msg = self._friendly_error(e)
                    self._emit('download_complete', {'ok': False, 'error': erro_msg})
                    self._emit('log', {'msg': f'❌ Erro na legenda local: {erro_msg}'})
        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return {'ok': True}

    def cancel_download(self):
        """Cancela a operação em andamento, seja da fila ou das abas de legenda.

        Antes isso dependia de self.baixando, que só a aba Download setava —
        por isso não havia como cancelar uma transcrição Whisper.
        Todas as rotas zeram self._cancelar ao começar, então marcar aqui é seguro.
        """
        self._cancelar = True
        self._emit("log", {"msg": "⏹ Cancelamento solicitado…"})
        return {"ok": True}

    def _friendly_error(self, e):
        """Traduz mensagens técnicas de erro do yt-dlp em algo que o usuário
        consiga entender e agir a respeito."""
        msg = str(e)
        if '403' in msg and 'forbidden' in msg.lower():
            return "Muitas requisições para o mesmo vídeo. Tente atualizar a página (ou aguardar um pouco) e iniciar o download novamente."
        return msg

    def start_download(self, params):
        url = (params.get("url") or "").strip()
        if not url:
            return {"ok": False, "error": "Cole um link para baixar."}
        self.baixando  = True
        self._cancelar = False
        threading.Thread(
            target=self._download_thread, args=(url, params), daemon=True
        ).start()
        return {"ok": True}

    def _download_thread(self, url, params):
        notificar = params.get("notificar", True)
        titulo_download = ""
        self._pulou = False
        try:
            if url.startswith("TXT:"):
                path = url[4:]
                with open(path, "r", encoding="utf-8") as f:
                    links = [l.strip() for l in f if l.strip() and not l.startswith("#")]
                self._emit("log", {"msg": f"📋 {len(links)} links encontrados"})
                sucesso, falha = 0, 0
                for i, link in enumerate(links):
                    self._emit("status", {"msg": f"Baixando {i+1} de {len(links)}…"})
                    self._emit("progress", {"pct": 0, "titulo": link[:52], "detalhe": f"Item {i+1} de {len(links)}"})
                    try:
                        self._baixar_unico(link, params)
                        sucesso += 1
                    except DownloadCancelled:
                        # Cancelar deve parar a lista inteira, não só o item atual.
                        raise
                    except Exception as e:
                        # Um link privado/removido no meio da lista não pode
                        # abortar todos os outros.
                        falha += 1
                        self._emit("log", {"msg": f"  ⚠ Falhou ({link[:40]}…): {self._friendly_error(e)}"})
                resumo = f"✅ Lista concluída: {sucesso} baixados"
                if falha:
                    resumo += f", {falha} com erro"
                self._emit("log", {"msg": resumo})
                self._pulou = False
            else:
                titulo_download = self._baixar_unico(url, params) or ""

            if self._pulou:
                # Nada foi baixado: não pode mostrar "concluído" ou o usuário
                # vai procurar um arquivo que não existe.
                self._emit("download_complete", {"ok": True, "skipped": True})
                self._emit("log",    {"msg": "⏭ Nada a baixar — já estava no histórico."})
                self._emit("status", {"msg": "⏭ Já baixado"})
                return
            self._emit("download_complete", {"ok": True})
            self._emit("log",    {"msg": "✅ Tudo pronto!"})
            self._emit("status", {"msg": "✅ Concluído!"})
            if notificar:
                msg = titulo_download if titulo_download else "Seu arquivo foi salvo com sucesso."
                _notify("Download concluído", msg)

        except DownloadCancelled:
            self._emit("download_complete", {"ok": False, "error": "Cancelado pelo usuário."})
            self._emit("log",    {"msg": "⏹ Download cancelado."})
            self._emit("status", {"msg": "⏹ Cancelado"})
        except Exception as e:
            erro_msg = self._friendly_error(e)
            self._emit("download_complete", {"ok": False, "error": erro_msg})
            self._emit("log",    {"msg": f"❌ Erro: {erro_msg}"})
            self._emit("status", {"msg": "❌ Erro no download"})
            if notificar:
                _notify("Erro no download", erro_msg[:100])
        finally:
            self.baixando = False

    def _baixar_unico(self, url, params):
        if not self.ffmpeg_path:
            raise Exception("FFmpeg não está instalado nesta máquina. Veja o log para o link de instalação.")

        is_playlist = params.get("playlist", False)

        fmt_alvo = "mp4" if params.get("tipo") == "video" else params.get("formato", "mp3")

        if not is_playlist and params.get("pular_duplicados") and self.historico.has(url, fmt_alvo):
            self._emit("log", {"msg": f"⏭ Já baixado: {url[:45]}…"})
            self._pulou = True
            return ""

        opts = self._build_opts(params)

        if is_playlist:
            list_opts = dict(opts)
            list_opts["extract_flat"] = True
            with yt_dlp.YoutubeDL(list_opts) as ydl_list:
                info = ydl_list.extract_info(url, download=False)

            entries = [e for e in (info.get("entries") or []) if e]
            total = len(entries)
            self._emit("log", {"msg": f"📋 Playlist: {info.get('title','?')} ({total} itens)"})

            sucesso, falha, pulados = 0, 0, 0
            for i, entry in enumerate(entries):
                eurl = entry.get("url") or entry.get("webpage_url") or ""
                if eurl and not eurl.startswith("http"):
                    eurl = f"https://www.youtube.com/watch?v={eurl}"
                if not eurl:
                    continue
                # Remove "list=" da URL do item — sem isso, o yt-dlp pode
                # entender a URL de UMA música como "baixe a playlist inteira
                # de novo", já que o parâmetro da playlist original continua
                # colado na URL de cada item.
                eurl = re.sub(r'([&?])list=[^&]*', '', eurl).rstrip('&?')

                if params.get("pular_duplicados") and self.historico.has(eurl, fmt_alvo):
                    pulados += 1
                    self._emit("log", {"msg": f"  ⏭ Já baixado: {(entry.get('title') or eurl)[:45]}…"})
                    continue

                self._playlist_status = f"Item {i+1} de {total}"
                self._emit("status", {"msg": f"Baixando {i+1} de {total}…"})
                titulo_preview = entry.get("title") or ""
                if titulo_preview:
                    self._emit("progress", {"pct": 0, "titulo": titulo_preview[:52], "detalhe": ""})

                item_opts = self._build_opts(params)
                item_opts["noplaylist"] = True
                try:
                    with yt_dlp.YoutubeDL(item_opts) as ydl2:
                        self._pos_download(ydl2.extract_info(eurl, download=True), params)
                    sucesso += 1
                except DownloadCancelled:
                    # Cancelamento deve interromper a playlist inteira, não só o item atual.
                    # Relança para propagar até o tratamento em _download_thread.
                    raise
                except Exception as e:
                    falha += 1
                    self._emit("log", {"msg": f"  ⚠ {self._friendly_error(e)}"})

            self._playlist_status = ""
            resumo = f"✅ Playlist concluída: {sucesso} baixadas"
            if pulados: resumo += f", {pulados} puladas"
            if falha:   resumo += f", {falha} com erro"
            self._emit("log", {"msg": resumo})
            return info.get("title", "")

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            titulo_preview = (info or {}).get("title", "")
            if titulo_preview:
                self._emit("progress", {"pct": 0, "titulo": titulo_preview[:52], "detalhe": ""})
            info = ydl.process_ie_result(info, download=True)
            self._pos_download(info, params)
            return info.get("title", "") if info else ""

    def _build_opts(self, params):
        tipo        = params.get("tipo", "musica")
        is_playlist = params.get("playlist", False)
        fmt         = params.get("formato", "mp3")
        qualidade   = params.get("qualidade", "192")
        organizar   = params.get("organizar", True)
        metadados   = params.get("metadados", True)

        # Separa Vídeos e Músicas já na raiz da pasta escolhida pelo usuário,
        # antes de organizar por artista/canal — evita misturar os dois tipos
        # na mesma pasta de artista.
        # %(channel)s é nulo fora do YouTube — no SoundCloud/Bandcamp/Mixcloud
        # isso criava pastas literalmente chamadas "NA". A cadeia de fallback
        # tenta channel, depois uploader, depois artist, e por fim "Desconhecido".
        base_pasta = "Vídeos" if tipo == "video" else "Músicas"
        artista = "%(channel,uploader,artist|Desconhecido)s"
        tmpl = (f"{base_pasta}/{artista}/%(title)s.%(ext)s" if organizar
                else f"{base_pasta}/%(title)s.%(ext)s")
        output = os.path.join(self.pasta_destino, tmpl)

        opts = {
            "outtmpl":        output,
            "progress_hooks": [self._hook],
            "noplaylist":     not is_playlist,
            "quiet":          True,
            "no_warnings":    True,
            # Títulos muito longos estouram o limite de 260 caracteres do Windows
            # e geram um erro incompreensível para o usuário.
            "trim_file_name": 120,
            "windowsfilenames": True,
            **YTDLP_SLEEP_OPTS,
        }

        if self.ffmpeg_path:
            opts["ffmpeg_location"] = os.path.dirname(self.ffmpeg_path)

        if tipo == "video":
            res = params.get("resolucao", "720").replace("p", "")
            opts["format"] = f"bestvideo[height<={res}]+bestaudio/best[height<={res}]"
            opts["merge_output_format"] = "mp4"
        else:
            opts["format"] = "bestaudio/best"
            opts["postprocessors"] = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": fmt,
                "preferredquality": qualidade,
            }]
            if metadados:
                opts["postprocessors"].append({"key": "FFmpegMetadata", "add_metadata": True})
                opts["writethumbnail"] = True
                opts["postprocessors"].append({"key": "EmbedThumbnail"})

        # O recorte por postprocessor_args só tinha efeito quando algum
        # pós-processador FFmpeg rodava — em vídeo baixado em formato único,
        # ele era silenciosamente ignorado. download_ranges é o mecanismo
        # oficial do yt-dlp e funciona nos dois casos.
        if params.get("recorte") and not is_playlist:
            ini = self._t2s_num(params.get("recorte_inicio"))
            fim = self._t2s_num(params.get("recorte_fim"))
            if ini is not None or fim is not None:
                opts["download_ranges"] = download_range_func(
                    None, [(ini if ini is not None else 0.0,
                            fim if fim is not None else float("inf"))]
                )
                opts["force_keyframes_at_cuts"] = True

        return opts

    def _hook(self, d):
        if self._cancelar:
            raise DownloadCancelled("Download cancelado pelo usuário.")
        if d["status"] == "downloading":
            total   = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            baixado = d.get("downloaded_bytes", 0)
            vel     = d.get("speed") or 0
            eta     = d.get("eta") or 0
            pct     = baixado / total if total else 0

            parts = []
            if self._playlist_status:
                parts.append(self._playlist_status)
            if total:    parts.append(f"{int(pct*100)}%")
            if vel:      parts.append(f"{vel/1048576:.1f} MB/s")
            if eta:      parts.append(f"{eta}s restantes")

            titulo = d.get("info_dict", {}).get("title", "")
            self._emit("progress", {
                "pct":     round(pct, 3),
                "detalhe": "  •  ".join(parts),
                "titulo":  titulo[:52] if titulo else "",
            })
        elif d["status"] == "finished":
            self._emit("progress", {"pct": 0.98, "detalhe": "Convertendo…", "titulo": ""})

    def _pos_download(self, info, params):
        if not info:
            return
        titulo    = info.get("title", "Desconhecido")
        url       = info.get("webpage_url", info.get("original_url", ""))
        tipo      = params.get("tipo", "musica")
        fmt       = params.get("formato", "mp3") if tipo != "video" else "mp4"
        qual      = params.get("qualidade", "192") + " kbps" if tipo != "video" else params.get("resolucao", "720p")
        arquivo   = ""
        if info.get("requested_downloads"):
            arquivo = info["requested_downloads"][0].get("filepath", "")
        self.historico.add(titulo, url, fmt, qual, arquivo)
        self._emit("log",            {"msg": f"✅ {titulo}"})
        self._emit("history_update", {"item": self.historico.itens[0]})

    def _t2s(self, t):
        p = t.split(":")
        try:
            if len(p) == 2: return str(int(p[0]) * 60 + int(p[1]))
            if len(p) == 3: return str(int(p[0]) * 3600 + int(p[1]) * 60 + int(p[2]))
        except ValueError:
            pass
        return t

    def _t2s_num(self, t):
        """Converte 'mm:ss' ou 'hh:mm:ss' em segundos (float). None se inválido."""
        if not t or not str(t).strip():
            return None
        partes = str(t).strip().split(":")
        try:
            partes = [int(p) for p in partes]
        except ValueError:
            return None
        if len(partes) == 2:
            return float(partes[0] * 60 + partes[1])
        if len(partes) == 3:
            return float(partes[0] * 3600 + partes[1] * 60 + partes[2])
        if len(partes) == 1:
            return float(partes[0])
        return None

    # ── Busca ────────────────────────────────────────────────

    def search_youtube(self, query, source="youtube"):
        if not query.strip():
            return []
        if source == "mixcloud":
            return self._search_mixcloud(query)
        prefix = "scsearch8" if source == "soundcloud" else "ytsearch8"
        try:
            with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True}) as ydl:
                r = ydl.extract_info(f"{prefix}:{query}", download=False)
                results = []
                for e in (r.get("entries") or []):
                    if not e:
                        continue
                    url = e.get("url") or e.get("webpage_url") or ""
                    # Extração "flat" do YouTube retorna só o ID do vídeo em "url"
                    # (ex: "dQw4w9WgXcQ"), não a URL completa — sem isso o
                    # download falha porque o yt-dlp não reconhece o link.
                    if source == "youtube" and url and not url.startswith("http"):
                        url = f"https://www.youtube.com/watch?v={url}"
                    results.append({
                        "titulo":  (e.get("title") or "")[:60],
                        "canal":   e.get("channel") or e.get("uploader") or "",
                        "duracao": self._fmt_dur(e.get("duration")),
                        "url":     url,
                        "thumb":   e.get("thumbnail") or "",
                    })
                return results
        except Exception as e:
            # Antes, qualquer erro virava "Nenhum resultado" — indistinguível de
            # uma busca legítima sem resultados, e impossível de diagnosticar.
            self._emit("log", {"msg": f"❌ Erro na busca ({source}): {e}"})
            return []

    def _search_mixcloud(self, query):
        try:
            import requests
            params = {"q": query, "type": "cloudcast", "limit": "8"}
            # requests traz o certifi junto, o que resolve o problema de
            # certificados no Windows SEM desligar a verificação SSL
            # (a versão anterior usava CERT_NONE, o que deixava a conexão
            # vulnerável a interceptação).
            resp = requests.get(
                "https://api.mixcloud.com/search/",
                params=params,
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for e in data.get("data") or []:
                key = e.get("key", "")
                results.append({
                    "titulo":  (e.get("name") or "")[:60],
                    "canal":   (e.get("user") or {}).get("name") or "",
                    "duracao": self._fmt_dur(e.get("audio_length")),
                    "url":     f"https://www.mixcloud.com{key}" if key else "",
                    "thumb":   (e.get("pictures") or {}).get("medium") or "",
                })
            return results
        except Exception as e:
            self._emit("log", {"msg": f"❌ Erro na busca (mixcloud): {e}"})
            return []

    def _fmt_dur(self, s):
        if not s: return ""
        s = int(s)
        return f"{s//60}:{s%60:02d}"

    # ── Histórico ────────────────────────────────────────────

    def get_history(self):
        return self.historico.itens

    def clear_history(self):
        self.historico.clear()
        return True

    # ── Utils ────────────────────────────────────────────────

    def _short(self, p):
        return ("…" + p[-28:]) if len(p) > 31 else p


# ─── Iniciar ──────────────────────────────────────────────────

def _bind_drop_events(window):
    """Permite capturar o caminho REAL de um arquivo arrastado do Explorer —
    isso é impossível via JavaScript puro (bloqueio de segurança do navegador),
    então o pywebview expõe um jeito de capturar isso do lado do Python."""
    try:
        from webview.dom import DOMEventHandler
    except ImportError:
        return  # versão do pywebview sem suporte a isso; drag&drop de arquivo local não funcionará

    VIDEO_EXT = ('.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v')

    def _on_drop(e):
        try:
            files = e.get('dataTransfer', {}).get('files', [])
            for f in files:
                path = f.get('pywebviewFullPath')
                if path and path.lower().endswith(VIDEO_EXT):
                    nome = os.path.basename(path)
                    window.evaluate_js(
                        'App.handle("caption_file_dropped", ' +
                        json.dumps({"path": path, "nome": nome}) + ')'
                    )
                    return
        except Exception:
            pass

    window.dom.document.events.drop += DOMEventHandler(_on_drop, True, True)


if __name__ == "__main__":
    api = Api()

    # Calcula a posição pra abrir centralizada na tela — não dá pra confiar
    # no "padrão" do pywebview aqui, há um bug conhecido em algumas versões
    # onde a janela some no canto em vez de centralizar sozinha.
    WIN_W, WIN_H = 1000, 720
    try:
        screen = webview.screens[0]
        pos_x = max(0, (screen.width - WIN_W) // 2)
        pos_y = max(0, (screen.height - WIN_H) // 2)
    except Exception:
        pos_x = pos_y = None  # fallback: deixa o pywebview decidir

    window = webview.create_window(
        title            = "YTK DOWNLDER",
        url              = resource_path(os.path.join("ui", "index.html")),
        js_api           = api,
        width            = WIN_W,
        height           = WIN_H,
        min_size         = (800, 580),
        background_color = "#08080f",
        text_select      = False,
        x                = pos_x,
        y                = pos_y,
    )

    api.set_window(window)
    webview.start(_bind_drop_events, window)
