' Inicializador Silencioso de 1 Clique para o F1 24 Custom HUD (Zero Janela Preta e Sem Docker)
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

pythonwExe = currentDir & "\.venv\Scripts\pythonw.exe"
If Not fso.FileExists(pythonwExe) Then
    pythonwExe = "pythonw.exe"
End If

' 1. Garante que o servidor backend de telemetria UDP 20777 esteja rodando nativamente no Windows
isUp = False
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.open "GET", "http://127.0.0.1:8000/health", False
http.setTimeouts 400, 400, 400, 400
http.send ""
If Err.Number = 0 Then
    If http.status = 200 Then isUp = True
End If
Err.Clear
On Error GoTo 0

If Not isUp Then
    WshShell.Run """" & pythonwExe & """ -m backend.server", 0, False
    WScript.Sleep 1200
End If

' 2. Inicia a HUD flutuante
WshShell.Run """" & pythonwExe & """ run_overlay.py", 0, False

