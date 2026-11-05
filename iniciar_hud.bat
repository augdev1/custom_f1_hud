@echo off
cd /d "%~dp0"

:: 0. Auto-instalacao / Auto-recuperacao se o ambiente .venv nao existir na maquina clonada
if not exist ".venv\Scripts\python.exe" (
    echo ========================================================
    echo      PRIMEIRA EXECUCAO DETECTADA - CONFIGURANDO HUD
    echo ========================================================
    echo.
    echo [1/3] Criando ambiente virtual Python (.venv)...
    python -m venv .venv 2>nul || py -m venv .venv 2>nul
    if not exist ".venv\Scripts\python.exe" (
        echo ERRO: Python 3 nao encontrado! Instale o Python pelo python.org
        echo e marque a opcao 'Add python.exe to PATH'.
        pause
        exit /b 1
    )
    echo [2/3] Instalando dependencias (FastAPI, PyWebView, PythonNet)...
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    echo [3/3] Gerando atalho na Area de Trabalho...
    powershell -ExecutionPolicy Bypass -File scripts\create_desktop_shortcut.ps1 >nul 2>&1
    echo.
    echo Configuracao concluida com sucesso!
    echo ========================================================
)

:: 1. Inicia o servidor backend nativo (UDP 20777 + WebSocket 8000) caso nao esteja rodando
curl -s http://127.0.0.1:8000/health >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    start "" /b ".venv\Scripts\python.exe" -m backend.server
    ping 127.0.0.1 -n 2 >nul
)

:: 2. Abre a janela de overlay transparente e click-through
start "" ".venv\Scripts\pythonw.exe" run_overlay.py
exit
