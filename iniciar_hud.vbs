' Inicializador Silencioso de 1 Clique para o F1 24 Custom HUD (Zero Janela Preta e Sem Docker)
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir
WshShell.Run """" & currentDir & "\iniciar_hud.bat""", 0, False

