@echo off
cd /d "%~dp0"
title F1 24 Custom HUD Studio (Navegador)

:: Garante ambiente virtual
if not exist ".venv\Scripts\python.exe" (
    call "%~dp0instalar_no_pc.bat"
)

:: Garante servidor backend ativo
curl -s http://127.0.0.1:8000/health >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    start "" /b ".venv\Scripts\python.exe" -m backend.server
    ping 127.0.0.1 -n 2 >nul
)

:: Abre o navegador padrao no Studio
start http://localhost:8000/
exit
