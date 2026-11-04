' Inicializador Silencioso de 1 Clique para o F1 24 Custom HUD (Zero Janela Preta)
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir
pythonExe = currentDir & "\.venv\Scripts\pythonw.exe"
If Not fso.FileExists(pythonExe) Then
    pythonExe = "pythonw.exe"
End If
WshShell.Run """" & pythonExe & """ run_overlay.py", 0, False

