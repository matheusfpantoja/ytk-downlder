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

datas = [('ui', 'ui')]
binaries = [
    ('bin/ffmpeg.exe', 'bin'),
    ('bin/ffprobe.exe', 'bin'),
]
hiddenimports = ['_cffi_backend']

# whisper e curl_cffi carregam arquivos internos (modelo/tokenizer do Whisper,
# biblioteca nativa do curl_cffi) que o PyInstaller não detecta sozinho —
# funcionam no ambiente de dev (Python "de verdade" instalado), mas quebram
# silenciosamente no .exe empacotado sem isso.
for _pkg in ('whisper', 'curl_cffi'):
    _pkg_datas, _pkg_binaries, _pkg_hiddenimports = collect_all(_pkg)
    datas += _pkg_datas
    binaries += _pkg_binaries
    hiddenimports += _pkg_hiddenimports

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
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
    upx=True,
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
    strip=False,
    upx=True,
    upx_exclude=[],
    name='YTK DOWNLDER',
)
