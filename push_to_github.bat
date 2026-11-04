@echo off
title Push F1 24 Custom HUD para GitHub
cd /d "%~dp0"
echo ========================================================
echo   ENVIANDO PROJETO PARA GITHUB
echo   Repositorio: https://github.com/augdev1/custom_f1_hud.git
echo ========================================================
echo.
git push -u origin main
echo.
echo ========================================================
echo Processo concluido!
echo ========================================================
pause
