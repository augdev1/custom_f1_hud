@echo off
cd /d "%~dp0"

:: 1. Inicia o servidor backend nativo (UDP 20777 + WebSocket 8000) caso nao esteja rodando
curl -s http://127.0.0.1:8000/health >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    start "" /b ".venv\Scripts\python.exe" -m backend.server
    ping 127.0.0.1 -n 2 >nul
)

:: 2. Abre a janela de overlay transparente e click-through
start "" ".venv\Scripts\pythonw.exe" run_overlay.py
exit
