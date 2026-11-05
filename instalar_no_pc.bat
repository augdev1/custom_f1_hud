@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Instalador e Configurador F1 24 Custom HUD

echo ========================================================
echo       INSTALACAO E ATIVACAO DO F1 24 CUSTOM HUD
echo                (Desenvolvido por augrocky)
echo ========================================================
echo.

:: 1. Verificacao e instalacao do Python 3
echo [1/5] Verificando instalacao do Python no sistema...
set "PY_CMD="
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PY_CMD=python"
) else (
    py --version >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set "PY_CMD=py"
    )
)

if "%PY_CMD%"=="" (
    echo [AVISO] Python 3 nao foi detectado no PATH do Windows!
    echo Tentando instalar Python 3.12 automaticamente via Windows Package Manager (winget)...
    where winget >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        echo Python instalado. Atualizando variaveis de ambiente...
        set "PY_CMD=python"
    ) else (
        echo ERRO: Python 3 nao encontrado e winget indisponivel!
        echo Por favor, baixe e instale o Python 3.10+ em: https://www.python.org/downloads/
        echo IMPORTANTE: Marque a caixa "Add python.exe to PATH" durante a instalacao.
        pause
        exit /b 1
    )
)

echo    [OK] Python detectado: %PY_CMD%
echo.

:: 2. Criacao do Ambiente Virtual (.venv)
echo [2/5] Criando ambiente virtual isolado (.venv)...
if not exist ".venv\Scripts\python.exe" (
    %PY_CMD% -m venv .venv
    if not exist ".venv\Scripts\python.exe" (
        echo ERRO ao criar ambiente virtual. Verifique suas permissoes de pasta.
        pause
        exit /b 1
    )
    echo    [OK] Ambiente virtual criado em .venv\
) else (
    echo    [OK] Ambiente virtual existente detectado.
)
echo.

:: 3. Instalacao das Dependencias (FastAPI, PyWebView, Uvicorn, PythonNet)
echo [3/5] Instalando dependencias essenciais do projeto...
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if %ERRORLEVEL% NEQ 0 (
    echo ERRO ao instalar dependencias do requirements.txt!
    pause
    exit /b 1
)
echo    [OK] Todas as dependencias foram instaladas com sucesso.
echo.

:: 4. Extensoes do Visual Studio Code (opcional se VS Code estiver instalado)
echo [4/5] Configurando extensoes recomendadas do VS Code...
where code >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo    VS Code CLI detectado. Instalando extensoes uteis...
    call "%~dp0instalar_extensoes.bat"
) else (
    echo    VS Code nao encontrado no PATH ou nao instalado. Pulando instalacao de extensoes de IDE.
)
echo.

:: 5. Geracao de Atalho na Area de Trabalho
echo [5/5] Gerando atalho de 1 clique na Area de Trabalho...
powershell -ExecutionPolicy Bypass -File scripts\create_desktop_shortcut.ps1
echo.

echo ========================================================
echo        INSTALACAO CONCLUIDA COM SUCESSO!
echo ========================================================
echo.
echo Tudo pronto para jogo!
echo.
echo Como jogar:
echo  1. Abra o atalho 'F1 24 Custom HUD' criado na sua Area de Trabalho.
echo     (ou execute o arquivo 'iniciar_hud.bat' nesta pasta).
echo.
echo  2. No jogo F1 24, configure a telemetria UDP:
echo     - Opcoes > Configuracoes de Telemetria
echo     - Telemetria UDP: Ligado
echo     - Formato UDP: 2024
echo     - Endereco IP UDP: 127.0.0.1
echo     - Porta UDP: 20777
echo     - Taxa de Envio: 60 Hz
echo.
echo  3. Tecla F8: Trava/Destrava a HUD flutuante para posicionar na tela.
echo ========================================================
echo.
pause
