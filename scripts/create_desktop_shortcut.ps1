# Script de criacao de atalho de 1 clique na Area de Trabalho para F1 24 Custom HUD
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path -Path $DesktopPath -ChildPath "F1 24 Custom HUD.lnk"

$BaseDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$VbsLauncher = Join-Path $BaseDir "iniciar_hud.vbs"
$WorkingDir = $BaseDir.Path

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$VbsLauncher`""
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.Description = "Iniciar F1 24 Custom HUD Overlay (1 Clique sem janela preta)"
$Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,14"
$Shortcut.Save()

Write-Host "Atalho criado com sucesso em: $ShortcutPath"

