@echo off
echo.
echo  ========================================
echo   YT Downloader v3 — Instalacao
echo  ========================================
echo.

echo [1/4] Verificando Python...
python --version 2>NUL
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Python nao encontrado!
    echo Baixe em: https://python.org/downloads
    echo IMPORTANTE: Marque "Add Python to PATH"!
    pause & exit /b 1
)

echo [2/4] Instalando bibliotecas Python...
pip install --upgrade pywebview yt-dlp mutagen Pillow requests

echo [3/4] Verificando FFmpeg...
ffmpeg -version 2>NUL
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo AVISO: FFmpeg nao encontrado.
    echo Instale com: winget install FFmpeg
    echo Depois feche e reabra o terminal.
    echo.
)

echo [4/4] Verificando WebView2 (necessario para a interface)...
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" 2>NUL
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo AVISO: Microsoft Edge WebView2 nao encontrado.
    echo Baixe em: https://developer.microsoft.com/microsoft-edge/webview2
    echo ^(Windows 11 e Windows 10 atualizados ja tem o WebView2 instalado^)
    echo.
)

echo.
echo  ========================================
echo   Instalacao concluida!
echo   Para abrir o app:
echo   python app.py
echo  ========================================
echo.
pause
