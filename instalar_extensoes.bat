@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Instalador de Extensoes - F1 24 Custom HUD

echo ========================================================
echo     INSTALADOR DE EXTENSOES RECOMENDADAS DO VS CODE
echo               F1 24 Custom HUD (by augrocky)
echo ========================================================
echo.

:: 1. Localiza o executavel CLI do VS Code (code ou code.cmd)
set "CODE_CMD="
where code >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "CODE_CMD=code"
) else if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
) else if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
) else if exist "%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd"
)

if "%CODE_CMD%"=="" (
    echo [AVISO] O VS Code nao foi detectado no sistema.
    echo Se voce utiliza o VS Code, certifique-se de te-lo instalado.
    echo Deseja instalar o VS Code agora via Windows Package Manager (winget)? (S/N)
    set /p INST_VS="Opcao: "
    if /i "!INST_VS!"=="S" (
        echo Instalando Visual Studio Code...
        winget install Microsoft.VisualStudioCode --silent --accept-package-agreements --accept-source-agreements
        set "CODE_CMD=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
    ) else (
        echo Pulando instalacao de extensoes do VS Code.
        goto :FINAL
    )
)

echo Executavel do VS Code detectado: "%CODE_CMD%"
echo Instalando extensoes essenciais para desenvolvimento e execucao da HUD...
echo.

set "EXTS=ms-python.python ms-python.vscode-pylance bradlc.vscode-tailwindcss formulahendry.auto-rename-tag ritwickdey.liveserver esbenp.prettier-vscode"

for %%E in (%EXTS%) do (
    echo [INSTALANDO] %%E...
    call "%CODE_CMD%" --install-extension %%E --force >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo    [OK] %%E instalada com sucesso.
    ) else (
        echo    [AVISO] Nao foi possivel instalar %%E automaticamente.
    )
)

:FINAL
echo.
echo ========================================================
echo Extensoes configuradas! 
echo Ao abrir o projeto no VS Code, o ambiente (.venv) sera selecionado automaticamente.
echo ========================================================
echo.
pause

