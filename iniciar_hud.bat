@echo off
title F1 24 Custom HUD Overlay Launcher
cd /d "%~dp0"

echo ========================================================
echo         INICIANDO F1 24 CUSTOM HUD OVERLAY
echo ========================================================
echo.

:: 1. Inicia o servidor backend caso nao esteja rodando
curl -s http://127.0.0.1:8000/health >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [1/2] Iniciando servidor de telemetria backend...
    start /min "" ".venv\Scripts\python.exe" -m backend.server
    timeout /t 2 /nobreak >nul
) else (
    echo [1/2] Servidor de telemetria ja esta ativo.
)

:: 2. Abre a janela de overlay transparente e click-through
echo [2/2] Abrindo overlay transparente por cima do F1 24...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run_overlay*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul
start "" ".venv\Scripts\python.exe" run_overlay.py

echo.
echo ========================================================
echo HUD pronto! Agora abra o F1 24 em Modo "Janela Sem Bordas"
echo ========================================================
timeout /t 3
exit
