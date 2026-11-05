@echo off
cd /d "%~dp0"
title Instalador F1 24 Custom HUD
echo ========================================================
echo       INSTALACAO E ATIVACAO DO F1 24 CUSTOM HUD
echo ========================================================
echo.
echo [1/3] Criando ambiente virtual Python (.venv)...
python -m venv .venv 2>nul || py -m venv .venv 2>nul
if not exist ".venv\Scripts\python.exe" (
    echo ERRO: Python 3 nao encontrado!
    echo Instale o Python 3.10+ pelo site https://www.python.org/downloads/
    echo Certifique-se de marcar a opcao "Add python.exe to PATH" durante a instalacao.
    pause
    exit /b 1
)

echo [2/3] Instalando dependencias (FastAPI, PyWebView, PythonNet)...
".venv\Scripts\python.exe" -m pip install -r requirements.txt

echo [3/3] Criando atalho na Area de Trabalho...
powershell -ExecutionPolicy Bypass -File scripts\create_desktop_shortcut.ps1

echo.
echo ========================================================
echo Instalacao concluida com sucesso!
echo O atalho 'F1 24 Custom HUD' foi criado na sua Area de Trabalho.
echo ========================================================
echo.
pause

