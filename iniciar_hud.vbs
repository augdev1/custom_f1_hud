' Inicializador Silencioso de 1 Clique para o F1 24 Custom HUD
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

pythonwExe = currentDir & "\.venv\Scripts\pythonw.exe"
If Not fso.FileExists(pythonwExe) Then pythonwExe = "pythonw.exe"

WshShell.Run """" & pythonwExe & """ """ & currentDir & "\run_overlay.py""", 0, False

