# F1 24 Custom HUD - Protocolo de Telemetria e Regras de Renderização

Este documento estabelece as regras obrigatórias de arquitetura, contrato de dados e renderização visual para a HUD do F1 24.
**Qualquer alteração futura no código DEVE respeitar rigorosamente estas regras para evitar regressões.**

---

## 1. Regra de Ouro da Conexão & Telemetria (Zero-Drop Contract)

### 1.1 Contrato de Broadcast do Servidor (`backend/server.py`)
Ao transmitir dados via WebSocket (`/ws/telemetry`), o servidor **DEVE** empacotar a telemetria no formato dual:
```python
payload = {
    "type": "telemetry",
    "data": frame,
    **frame  # Garante retrocompatibilidade com clientes que lêem diretamente na raiz
}
```
E para configurações:
```python
{"type": "config_update", "config": current_hud_config, "data": current_hud_config}
```

### 1.2 Regra de Recepção nos Frontends (`overlay.html` e `index.html`)
Os clientes Web/WebSocket **NUNCA** devem assumir um formato rígido único. O listener `ws.onmessage` deve ser sempre resiliente:
```javascript
const raw = JSON.parse(evt.data);

// 1. Configurações
if (raw.type === 'config_update') {
  const cfg = raw.config || raw.data || raw;
  if (cfg && cfg.accentColor) applyAccentColor(cfg.accentColor);
  return;
}

// 2. Telemetria (desembrulha data ou usa raiz)
const data = (raw.type === 'telemetry' && raw.data) ? raw.data : raw;
if (data && (data.speed !== undefined || data.engineRPM !== undefined || data.engine_rpm !== undefined)) {
  renderTelemetry(data);
}
```

### 1.3 Normalização Obrigatória de Campos de Telemetria
- **Acelerador & Freio (`throttle` / `brake`):** O F1 24 envia floats entre `0.0` e `1.0`. Simuladores sandbox podem enviar `0` a `100`. Os renderizadores **DEVEM** auto-normalizar:
  ```javascript
  let thr = data.throttle || 0;
  if (thr > 0 && thr <= 1.0) thr = thr * 100;
  ```
- **RPM do Motor:** Aceitar tanto `engineRPM` (padrão F1) quanto `engine_rpm`.
- **Bateria ERS:** Aceitar tanto Joules (`ersStoreEnergy`, max 4.000.000) quanto porcentagem direta (`ers_store`, 0-100).
- **Temperatura dos Pneus:** Mapeamento oficial dos 4 cantos do F1: `[0=RL, 1=RR, 2=FL, 3=FR]`.

---

## 2. Regra de Transparência da HUD Flutuante (Zero White Border)

### 2.1 Prevenção de Bordas Brancas no Windows (`run_overlay.py`)
No Windows, formulários WinForms do `pywebview` possuem fundo branco padrão que vaza caso a transparência nativa não seja inicializada corretamente. Para eliminar 100% de qualquer borda branca:
1. `run_overlay.py` deve criar a janela com `background_color="#000000"` e `transparent=True`.
2. Um worker de inicialização deve obter o `hwnd` e aplicar:
   - `dwmapi.DwmExtendFrameIntoClientArea(hwnd, margins(-1, -1, -1, -1))` (Composição DWM por pixel).
   - `user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ... | WS_EX_LAYERED | WS_EX_TOOLWINDOW)`.
   - `user32.SetLayeredWindowAttributes(hwnd, 0x00000000, 0, LWA_COLORKEY)` (Chroma Key: Preto puro `#000000` é 100% invisível para a área de trabalho e para o jogo).

### 2.2 Estrutura do HTML (`overlay.html`)
- `html, body` **DEVEM** ter `margin: 0; padding: 0; background: #000000 !important; overflow: hidden;`.
- **NUNCA** adicionar `p-1` ou margens ao redor de `body`, pois criam faixas entre a janela e o chassis.
- `#hudRoot` deve ter `w-full h-full` com cantos arredondados e preenchimento escuro com tom de azul/cinza (`rgba(14, 18, 28, 0.96)`), garantindo que apenas a parte externa ao chassis seja recortada pelo Chroma Key.

### 2.3 Superposição Garantida sobre Jogos DirectX (`run_overlay.py`)
Jogos como o F1 24 em modo Janela Sem Bordas utilizam modelos de apresentação DirectFlip no DWM. Para a HUD nunca ficar oculta atrás do jogo:
1. `WS_EX_TOPMOST` (`0x00000008`) deve constar permanentemente em `GWL_EXSTYLE`.
2. Ao ativar o Modo Corrida (Travar/F8), adicionar `WS_EX_TRANSPARENT | WS_EX_NOACTIVATE` para cliques passarem direto ao volante/jogo sem roubar foco.
3. Um thread watchdog em 4Hz (250ms) deve executar continuamente `user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW)` para reafirmar a prioridade de Z-order contra o DirectFlip.
