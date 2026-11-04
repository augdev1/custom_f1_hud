@echo off
title F1 24 Custom HUD - Reiniciar Sistema
cd /d "%~dp0"

echo ========================================================
echo       REINICIANDO F1 24 CUSTOM HUD & BACKEND
echo ========================================================
echo.

echo [1/3] Encerrando processos antigos da HUD e servidor...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*backend.server*' -or $_.CommandLine -like '*run_overlay*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/3] Iniciando servidor de telemetria backend...
start /min "" ".venv\Scripts\python.exe" -m backend.server
timeout /t 2 /nobreak >nul

echo [3/3] Abrindo overlay transparente sobre o F1 24...
start "" ".venv\Scripts\python.exe" run_overlay.py

echo.
echo ========================================================
echo HUD Reiniciada com Sucesso! Telemetria ativa na porta 20777
echo ========================================================
timeout /t 3
exit
