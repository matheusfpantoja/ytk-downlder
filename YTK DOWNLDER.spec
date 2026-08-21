# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_all

# ── Checagem de segurança: sem isso, o instalador sai sem FFmpeg e
#    praticamente nada no app funciona pro usuário final ──────────────
for _f in ('bin/ffmpeg.exe', 'bin/ffprobe.exe'):
    if not os.path.exists(_f):
        raise SystemExit(
            f"ERRO: '{_f}' não encontrado.\n"
            "Baixe o FFmpeg (gyan.dev essentials build), extraia e coloque "
            "ffmpeg.exe e ffprobe.exe na pasta bin/ na raiz do projeto antes "
            "de gerar o instalador."
        )

datas = [('ui', 'ui'), ('icon.ico', '.')]
binaries = [
    ('bin/ffmpeg.exe', 'bin'),
    ('bin/ffprobe.exe', 'bin'),
]
hiddenimports = ['_cffi_backend']

# Pacotes que guardam arquivos internos (assets do Whisper, .dll do curl_cffi,
# tabelas do tiktoken, runtime do numba) que o PyInstaller não detecta sozinho.
# Funcionam no ambiente de dev e quebram silenciosamente só no .exe do usuário.
for _pkg in ('whisper', 'curl_cffi', 'tiktoken', 'numba', 'llvmlite'):
    try:
        _d, _b, _h = collect_all(_pkg)
        datas += _d
        binaries += _b
        hiddenimports += _h
    except Exception as _e:
        print(f"AVISO: não foi possível coletar '{_pkg}': {_e}")

# Bibliotecas pesadas que nada no app usa — sem excluir, entram de carona
# via dependências do torch e incham o instalador em centenas de MB.
excludes = [
    'tkinter', 'matplotlib', 'scipy', 'pandas', 'sklearn', 'cv2',
    'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'wx',
    'IPython', 'jupyter', 'notebook', 'pytest',
    'torchvision', 'torchaudio', 'tensorflow',
    'yt_dlp',
]

# yt-dlp precisa ficar de FORA do arquivo compactado (PYZ) para o recurso
# de "Atualizar motor de download" funcionar. Se ele for compilado junto
# do resto do app, o carregador interno do PyInstaller sempre teria
# prioridade sobre qualquer atualização baixada depois — não importa o
# que a gente colocar no sys.path. Copiando como arquivos soltos, o
# Python resolve o import normalmente, e dá pra sobrepor com uma versão
# mais nova depois.
import yt_dlp as _ytdlp_probe
_ytdlp_src = os.path.dirname(_ytdlp_probe.__file__)
yt_dlp_tree = Tree(_ytdlp_src, prefix='yt_dlp', excludes=['*.pyc', '__pycache__'])

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='YTK DOWNLDER',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    # UPX corrompe DLLs nativas do PyTorch e dispara falso positivo de
    # antivírus. O ganho de tamanho não compensa um .exe que não abre.
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    icon='icon.ico',
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    yt_dlp_tree,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='YTK DOWNLDER',
)