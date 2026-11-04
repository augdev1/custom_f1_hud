' Inicializador Silencioso de 1 Clique para o F1 24 Custom HUD (Zero Janela Preta)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "d:\AUG\f1-custom-hud"
WshShell.Run """d:\AUG\f1-custom-hud\.venv\Scripts\pythonw.exe"" run_overlay.py", 0, False

