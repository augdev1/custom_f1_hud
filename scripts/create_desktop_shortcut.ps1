# Script de criacao de atalho de 1 clique na Area de Trabalho para F1 24 Custom HUD
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path -Path $DesktopPath -ChildPath "F1 24 Custom HUD.lnk"

$BaseDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VenvPythonw = Join-Path $BaseDir ".venv\Scripts\pythonw.exe"
if (-not (Test-Path $VenvPythonw)) {
    $VenvPythonw = "pythonw.exe"
}
$WorkingDir = $BaseDir
$ScriptFile = Join-Path $BaseDir "run_overlay.py"
$ScriptArgs = "`"$ScriptFile`""

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $VenvPythonw
$Shortcut.Arguments = $ScriptArgs
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.Description = "F1 24 Custom HUD - Painel de Telemetria Flutuante"
$Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,14"
$Shortcut.Save()

Write-Host "Atalho criado com sucesso em: $ShortcutPath"

