const $ = id => document.getElementById(id);

const defaults = {
  panelBg:'#162631', borderColor:'#AADAE8', textColor:'#F4F7FA', opacity:30, scale:100,
  gearColor:'#54D8E8', accentColor:'#AADAE8', primaryColor:'#54D8E8',
  secondaryColor:'#162631', ersColor:'#FFC857', throttleColor:'#69E6A6',
  brakeColor:'#FF5268', showTyres:false, showHaloBar:false, theme:'halo-glass-edition'
};

const presets = {
  mercedes: { panelBg: '#060E14', borderColor: '#00F5D4', textColor: '#F4F7FA', gearColor: '#00F5D4', accentColor: '#00F5D4', ersColor: '#00D2BE', throttleColor: '#00F5D4', brakeColor: '#FF2A4D' },
  ferrari: { panelBg: '#180A0A', borderColor: '#EF4444', textColor: '#F4F7FA', gearColor: '#EF4444', accentColor: '#EF4444', ersColor: '#FFD700', throttleColor: '#00E676', brakeColor: '#FF1744' },
  redbull: { panelBg: '#080E1E', borderColor: '#FFD700', textColor: '#F4F7FA', gearColor: '#FFD700', accentColor: '#FFD700', ersColor: '#00F0FF', throttleColor: '#00E676', brakeColor: '#FF1744' },
  mclaren: { panelBg: '#181008', borderColor: '#FF8700', textColor: '#F4F7FA', gearColor: '#FF8700', accentColor: '#FF8700', ersColor: '#00F0FF', throttleColor: '#00E676', brakeColor: '#FF1744' },
  aston: { panelBg: '#061614', borderColor: '#00A88F', textColor: '#F4F7FA', gearColor: '#006F62', accentColor: '#00A88F', ersColor: '#00F0FF', throttleColor: '#00E676', brakeColor: '#FF1744' },
  cyberpunk: { panelBg: '#16081A', borderColor: '#FF007F', textColor: '#F4F7FA', gearColor: '#FF007F', accentColor: '#FF007F', ersColor: '#00F0FF', throttleColor: '#00E676', brakeColor: '#FF007F' }
};

const fields = ['panelBg', 'borderColor', 'textColor', 'opacity', 'scale', 'gearColor', 'ersColor', 'throttleColor', 'brakeColor', 'showTyres'];
let cfg = { ...defaults };
let simulating = false;
let syncTimer = null;

const apiBase = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';

async function api(path, body) {
  const response = await fetch(apiBase + path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}

function read() {
  for (const id of fields) {
    const el = $(id);
    if (!el) continue;
    cfg[id] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
  }
  cfg.accentColor = cfg.borderColor || cfg.gearColor;
  cfg.primaryColor = cfg.gearColor;
  cfg.secondaryColor = cfg.panelBg;
  return cfg;
}

function preview() {
  read();
  if ($('opacityValue')) $('opacityValue').value = `${cfg.opacity}%`;
  if ($('scaleValue')) $('scaleValue').value = `${cfg.scale}%`;
  const targetOrigin = (location.origin && location.origin !== 'null') ? location.origin : '*';
  try {
    const iframe = $('preview');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'halo-preview-config', config: cfg }, targetOrigin);
    }
  } catch {}
}

function syncLive() {
  preview();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await api('/api/config', read());
      $('saveStatus').textContent = 'Sincronizado em tempo real com a HUD.';
    } catch (e) {
      $('saveStatus').textContent = `Falha ao sincronizar: ${e.message}`;
    }
  }, 70);
}

function populate() {
  for (const id of fields) {
    const el = $(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!cfg[id];
    else el.value = cfg[id];
  }
  preview();
}

// Event Listeners for Customizer Inputs
fields.forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', syncLive);
});

$('preview').addEventListener('load', preview);

$('save').onclick = async () => {
  try {
    await api('/api/config', read());
    $('saveStatus').textContent = 'Configuração salva com sucesso na HUD e no disco.';
  } catch (e) {
    $('saveStatus').textContent = `Falha ao salvar: ${e.message}`;
  }
};

$('reset').onclick = () => {
  cfg = { ...cfg, ...defaults };
  populate();
  syncLive();
  $('saveStatus').textContent = 'Padrão restaurado. Sincronizado com a HUD.';
};

// Preset Buttons (Mercedes, Ferrari, Red Bull, etc.)
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.onclick = () => {
    const pName = btn.dataset.preset;
    if (presets[pName]) {
      Object.assign(cfg, presets[pName]);
      populate();
      syncLive();
      $('saveStatus').textContent = `Preset ${btn.textContent} aplicado e sincronizado na HUD!`;
    }
  };
});

// Interactive Manual Harness Controls
let harnessGear = '7';
function sendManualHarness() {
  const spd = Number($('harnessSpeed').value);
  const thr = Number($('harnessThrottle').value);
  const brk = Number($('harnessBrake').value);
  $('harnessSpeedVal').value = `${spd} km/h`;
  $('harnessThrottleVal').value = `${thr}%`;
  $('harnessBrakeVal').value = `${brk}%`;

  const rpm = Math.round(4000 + (spd / 350) * 8500);
  const frame = {
    type: 'telemetry',
    data: {
      speed: spd,
      gear: harnessGear === 'R' ? -1 : harnessGear === 'N' ? 0 : Number(harnessGear),
      throttle: thr / 100,
      brake: brk / 100,
      engineRPM: rpm,
      maxRPM: 13500,
      ersStoreEnergy: 3400000,
      drs: spd > 250 ? 1 : 0,
      tyresSurfaceTemperature: [90, 91, 92, 92]
    }
  };

  const targetOrigin = (location.origin && location.origin !== 'null') ? location.origin : '*';
  try {
    $('preview').contentWindow.postMessage(frame, targetOrigin);
  } catch {}
}

const speedInput = $('harnessSpeed');
if (speedInput) speedInput.addEventListener('input', sendManualHarness);
const thrInput = $('harnessThrottle');
if (thrInput) thrInput.addEventListener('input', sendManualHarness);
const brkInput = $('harnessBrake');
if (brkInput) brkInput.addEventListener('input', sendManualHarness);

document.querySelectorAll('.gear-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.gear-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    harnessGear = btn.dataset.gear === '-1' ? 'R' : btn.dataset.gear === '0' ? 'N' : btn.dataset.gear;
    sendManualHarness();
  };
});

// Background Toggle (Cockpit / Contrast Checker)
$('background').onclick = () => {
  const check = document.querySelector('.preview').classList.toggle('checker');
  $('background').textContent = check ? 'Fundo: contraste' : 'Fundo: cockpit';
};

// Auto Simulator Toggle (Codemasters Realistic 60Hz Lap Simulation)
$('simulate').onclick = async () => {
  const button = $('simulate');
  button.disabled = true;
  try {
    if (!simulating) {
      const h = await api('/health');
      if (h.game_connected) {
        $('source').textContent = 'TELEMETRIA DO JOGO ATIVA · SIMULADOR SUSPENSO';
        return;
      }
    }
    await api(`/api/simulator/${simulating ? 'stop' : 'start'}`, {});
    simulating = !simulating;
    button.textContent = simulating ? 'Parar simulação' : 'Testar aceleração';
    $('source').textContent = simulating ? 'SIMULAÇÃO UDP ATIVA / 60 Hz' : 'AGUARDANDO TELEMETRIA';
  } catch (e) {
    $('source').textContent = `Falha no simulador: ${e.message}`;
  } finally {
    button.disabled = false;
  }
};

// Health and Diagnostics Polling
async function checkHealth() {
  try {
    const h = await api('/health');
    const isLive = Boolean(h.game_connected);
    const healthEl = $('health');
    if (healthEl) {
      if (isLive) {
        healthEl.innerHTML = '<span class="pulse-live"></span>TELEMETRIA RECEBIDA (60Hz)';
        healthEl.style.color = '#10B981';
      } else {
        healthEl.innerHTML = '<span class="pulse-live" style="background:#56c8ff;box-shadow:0 0 8px #56c8ff"></span>BACKEND ONLINE';
        healthEl.style.color = '#56c8ff';
      }
    }

    const packetsText = h.packets_received != null ? h.packets_received.toLocaleString('pt-BR') : '0';
    const senderText = h.last_sender ? ` · ${h.last_sender}` : '';
    $('packetInfo').textContent = `${packetsText} pacotes · ${h.active_clients || 0} cliente(s)${senderText}`;
    
    if (!simulating) {
      $('source').textContent = isLive ? `TELEMETRIA F1 24 ATIVA (${h.last_sender || 'UDP'})` : 'AGUARDANDO TELEMETRIA';
    }
  } catch {
    const healthEl = $('health');
    if (healthEl) {
      healthEl.innerHTML = '<span class="pulse-offline"></span>BACKEND OFFLINE';
      healthEl.style.color = '#ff4055';
    }
  }
}

// Initial Configuration Load
api('/api/config')
  .then(data => {
    cfg = { ...defaults, ...data };
    populate();
  })
  .catch(() => populate());

checkHealth();
const healthInterval = setInterval(checkHealth, 1500);

window.addEventListener('beforeunload', () => {
  clearInterval(healthInterval);
  clearTimeout(syncTimer);
  if (simulating) navigator.sendBeacon('/api/simulator/stop');
});
