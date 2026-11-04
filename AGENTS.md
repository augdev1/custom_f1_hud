# Regras Globais do Projeto F1 24 Custom HUD

Este repositório possui regras estritas de integração e renderização entre o backend de telemetria UDP/WebSocket e as interfaces visuais da HUD:

1. **Protocolo de Telemetria:** Consulte as regras completas em [.agents/rules/f1-telemetry-and-hud-protocol.md](file:///d:/AUG/f1-custom-hud/.agents/rules/f1-telemetry-and-hud-protocol.md).
2. **Contrato de Mensagens:** Todo payload de telemetria emitido via WebSocket pelo `backend/server.py` deve conter `{"type": "telemetry", "data": frame, **frame}` para manter compatibilidade universal.
3. **Normalização de Entradas:** Frontends (`overlay.html` e `index.html`) devem sempre normalizar acelerador e freio (detectar `0.0-1.0` vs `0-100`) e tolerar formatos camelCase e snake_case para RPM, marcha e temperaturas.
4. **Transparência Sem Borda Branca:** A janela flutuante no Windows (`run_overlay.py`) utiliza Chroma Key Win32 e DWM frame extension. O `overlay.html` nunca deve conter margens externas no `body`, mantendo fundo `#000000` para recorte perfeito contra o jogo.
5. **Superposição Contínua em Jogos:** O `run_overlay.py` deve aplicar `WS_EX_TOPMOST` e manter um thread watchdog (4Hz) com `SetWindowPos(hwnd, HWND_TOPMOST, ..., SWP_NOACTIVATE)` para garantir que jogos em Janela Sem Bordas (DirectFlip DWM) nunca sobreponham a HUD.
