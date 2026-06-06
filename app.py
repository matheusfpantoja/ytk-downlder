"""
YouTube Downloader v3.0 — PyWebView
Backend Python puro + Interface Web moderna
"""

import webview
import yt_dlp
import threading
import json
import os
import subprocess
import sys
from datetime import datetime

try:
    from plyer import notification as _plyer_notification
except Exception:
    _plyer_notification = None


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

PASTA_PADRAO  = os.path.join(os.path.expanduser("~"), "Músicas-YT")
HISTORICO_PATH = os.path.join(PASTA_PADRAO, ".historico.json")
CONFIG_PATH    = os.path.join(PASTA_PADRAO, ".config.json")


def resource_path(rel):
    """Resolve caminhos tanto em dev quanto dentro do .exe (PyInstaller)."""
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, rel)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), rel)


# ─── Histórico ────────────────────────────────────────────────

class Historico:
    def __init__(self):
        os.makedirs(PASTA_PADRAO, exist_ok=True)
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
        with open(HISTORICO_PATH, "w", encoding="utf-8") as f:
            json.dump(self.itens, f, ensure_ascii=False, indent=2)

    def add(self, titulo, url, formato, qualidade, arquivo):
        self.itens.insert(0, {
            "titulo": titulo, "url": url,
            "formato": formato, "qualidade": qualidade,
            "arquivo": arquivo,
            "data": datetime.now().strftime("%d/%m/%Y %H:%M"),
        })
        self.itens = self.itens[:500]
        self.save()

    def has(self, url):
        return any(i["url"] == url for i in self.itens)

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
        self.pasta_destino = PASTA_PADRAO
        self._win          = None
        os.makedirs(self.pasta_destino, exist_ok=True)

    def set_window(self, w):
        self._win = w
        threading.Thread(target=self._verificar_ytdlp, daemon=True).start()

    def _verificar_ytdlp(self):
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

    # ── Comunicação Python → JS ──────────────────────────────

    def _emit(self, event, data=None):
        """Dispara evento para o JavaScript."""
        if self._win:
            payload = json.dumps(data or {})
            self._win.evaluate_js(f'App.handle("{event}", {payload})')

    # ── Inicialização ────────────────────────────────────────

    def get_initial_data(self):
        """Chamado pelo JS quando a página carrega."""
        cfg = {}
        try:
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH) as f:
                    cfg = json.load(f)
        except Exception:
            pass
        return {
            "pasta":      self._short(self.pasta_destino),
            "pasta_full": self.pasta_destino,
            "tema":       cfg.get("tema", "dark"),
            "historico":  self.historico.itens[:100],
        }

    def save_config(self, cfg):
        os.makedirs(PASTA_PADRAO, exist_ok=True)
        existing = {}
        try:
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH) as f:
                    existing = json.load(f)
        except Exception:
            pass
        existing.update(cfg)
        with open(CONFIG_PATH, "w") as f:
            json.dump(existing, f)
        return True

    # ── Pasta destino ────────────────────────────────────────

    def choose_folder(self):
        result = self._win.create_file_dialog(
            webview.FOLDER_DIALOG,
            directory=self.pasta_destino,
        )
        if result:
            self.pasta_destino = result[0]
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

    def cancel_download(self):
        """Cancela o download em andamento (chamado pelo JS via Escape)."""
        if self.baixando:
            self._cancelar = True
            return {"ok": True}
        return {"ok": False}

    def start_download(self, params):
        if self.baixando:
            return {"ok": False, "error": "Já há um download em andamento."}
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
        try:
            if url.startswith("TXT:"):
                path = url[4:]
                with open(path, "r", encoding="utf-8") as f:
                    links = [l.strip() for l in f if l.strip() and not l.startswith("#")]
                self._emit("log", {"msg": f"📋 {len(links)} links encontrados"})
                for i, link in enumerate(links):
                    self._emit("status", {"msg": f"Baixando {i+1} de {len(links)}…"})
                    self._baixar_unico(link, params)
            else:
                titulo_download = self._baixar_unico(url, params) or ""

            self._emit("download_complete", {"ok": True})
            self._emit("log",    {"msg": "✅ Tudo pronto!"})
            self._emit("status", {"msg": "✅ Concluído!"})
            if notificar:
                msg = titulo_download if titulo_download else "Seu arquivo foi salvo com sucesso."
                _notify("Download concluído", msg)

        except Exception as e:
            self._emit("download_complete", {"ok": False, "error": str(e)})
            self._emit("log",    {"msg": f"❌ Erro: {e}"})
            self._emit("status", {"msg": "❌ Erro no download"})
            if notificar:
                _notify("Erro no download", str(e)[:100])
        finally:
            self.baixando = False

    def _baixar_unico(self, url, params):
        tipo = params.get("tipo", "musica")

        if params.get("pular_duplicados") and self.historico.has(url):
            self._emit("log", {"msg": f"⏭ Já baixado: {url[:45]}…"})
            return ""

        opts = self._build_opts(params)

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)

            if "entries" in info and tipo == "playlist":
                entries = [e for e in info.get("entries", []) if e]
                total = len(entries)
                self._emit("log", {"msg": f"📋 Playlist: {info.get('title','?')} ({total} itens)"})
                for i, entry in enumerate(entries):
                    self._emit("status", {"msg": f"Baixando {i+1} de {total}…"})
                    eurl = entry.get("webpage_url") or entry.get("url", "")
                    if eurl:
                        try:
                            with yt_dlp.YoutubeDL(self._build_opts(params)) as ydl2:
                                self._pos_download(ydl2.extract_info(eurl, download=True), params)
                        except Exception as e:
                            self._emit("log", {"msg": f"  ⚠ {e}"})
                return info.get("title", "")

            info = ydl.extract_info(url, download=True)
            self._pos_download(info, params)
            return info.get("title", "") if info else ""

    def _build_opts(self, params):
        tipo      = params.get("tipo", "musica")
        fmt       = params.get("formato", "mp3")
        qualidade = params.get("qualidade", "192")
        organizar = params.get("organizar", True)
        metadados = params.get("metadados", True)

        tmpl   = "%(channel)s/%(title)s.%(ext)s" if organizar else "%(title)s.%(ext)s"
        output = os.path.join(self.pasta_destino, tmpl)

        opts = {
            "outtmpl":        output,
            "progress_hooks": [self._hook],
            "noplaylist":     tipo != "playlist",
            "quiet":          True,
            "no_warnings":    True,
        }

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

        if params.get("recorte"):
            pp = []
            if params.get("recorte_inicio"):
                pp.extend(["-ss", self._t2s(params["recorte_inicio"])])
            if params.get("recorte_fim"):
                pp.extend(["-to", self._t2s(params["recorte_fim"])])
            if pp:
                opts.setdefault("postprocessor_args", {})["ffmpeg"] = pp

        return opts

    def _hook(self, d):
        if self._cancelar:
            raise Exception("Download cancelado pelo usuário.")
        if d["status"] == "downloading":
            total   = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            baixado = d.get("downloaded_bytes", 0)
            vel     = d.get("speed") or 0
            eta     = d.get("eta") or 0
            pct     = baixado / total if total else 0

            parts = []
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

    # ── Busca ────────────────────────────────────────────────

    def search_youtube(self, query, source="youtube"):
        if not query.strip():
            return []
        prefix = "scsearch8" if source == "soundcloud" else "ytsearch8"
        try:
            with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "extract_flat": True}) as ydl:
                r = ydl.extract_info(f"{prefix}:{query}", download=False)
                return [{
                    "titulo":  (e.get("title") or "")[:60],
                    "canal":   e.get("channel") or e.get("uploader") or "",
                    "duracao": self._fmt_dur(e.get("duration")),
                    "url":     e.get("url") or e.get("webpage_url") or "",
                    "thumb":   e.get("thumbnail") or "",
                } for e in (r.get("entries") or []) if e]
        except Exception:
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

if __name__ == "__main__":
    api = Api()

    window = webview.create_window(
        title            = "YT Downloader",
        url              = resource_path(os.path.join("ui", "index.html")),
        js_api           = api,
        width            = 1000,
        height           = 720,
        min_size         = (800, 580),
        background_color = "#08080f",
        text_select      = False,
    )

    api.set_window(window)
    webview.start()
