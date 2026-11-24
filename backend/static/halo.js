import {normalizeTelemetry, connectionState, clamp} from './halo-model.js';

const $ = id => document.getElementById(id);
const embedded = new URLSearchParams(location.search).has('embedded');
document.body.classList.toggle('embedded', embedded);

const ns = 'http://www.w3.org/2000/svg';

// ==========================================
// 1. TACÔMETRO DE RPM (ARCO DE -140° A -40°)
// ==========================================
const TOTAL_LEDS = 24;
const START_ANGLE = -150 * Math.PI / 180;
const END_ANGLE = -30 * Math.PI / 180;

const segments = Array.from({length: TOTAL_LEDS}, (_, i) => {
  const angle = START_ANGLE + (i * (END_ANGLE - START_ANGLE) / (TOTAL_LEDS - 1));
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', (Math.cos(angle) * 65).toFixed(2));
  line.setAttribute('y1', (Math.sin(angle) * 65).toFixed(2));
  line.setAttribute('x2', (Math.cos(angle) * 74).toFixed(2));
  line.setAttribute('y2', (Math.sin(angle) * 74).toFixed(2));

  const type = i < 6 ? ' cyan' : i >= 20 ? ' redline' : '';
  line.setAttribute('class', 'rpm-led' + type);
  $('rpmSegments').append(line);
  return line;
});

// Comprimentos de traçado para animação fluida 60 FPS
let throttleTotalLen = 350;
let brakeTotalLen = 330;
let ersTotalLen = 290;

try {
  const tEl = $('throttleBar');
  if (tEl && tEl.getTotalLength) throttleTotalLen = tEl.getTotalLength() || 350;
  const bEl = $('brakeBar');
  if (bEl && bEl.getTotalLength) brakeTotalLen = bEl.getTotalLength() || 330;
  const eEl = $('ersBar');
  if (eEl && eEl.getTotalLength) ersTotalLen = eEl.getTotalLength() || 290;
} catch {}

const gearKeys = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'];

let connected = false;
let lastFrame = null;
let pending = null;
let locked = false;
let ws;
let retry;
let disposed = false;

const labels = {
  OFFLINE: 'BACKEND DESCONECTADO',
  WAITING: 'AGUARDANDO TELEMETRIA UDP',
  STALE: 'SEM SINAL · TELEMETRIA INTERROMPIDA',
  LIVE: 'TELEMETRIA AO VIVO'
};

function updateStatus() {
  const state = connectionState(connected, lastFrame, performance.now());
  document.body.dataset.connection = state;
  for (const name of ['live', 'stale', 'offline']) {
    document.body.classList.toggle(name, state.toLowerCase() === name);
  }
  $('connection').textContent = labels[state];

  if (state !== 'LIVE') {
    // Estado de espera
    $('speedVal').textContent = '0';
    if ($('throttlePctVal')) $('throttlePctVal').textContent = '0%';
    $('drsBadge').setAttribute('class', 'drs-pill off');
    if ($('throttleBar')) $('throttleBar').style.strokeDasharray = `0 ${throttleTotalLen}`;
    if ($('brakeBar')) $('brakeBar').style.strokeDasharray = `0 ${brakeTotalLen}`;
    segments.forEach(el => el.classList.remove('active'));
  }
}

function render(raw) {
  const f = normalizeTelemetry(raw);

  // 1. Velocidade Principal (KM/H)
  $('speedVal').textContent = f.speed;

  // 2. Tacômetro de RPM (LEDs Radiais em Arco)
  const activeCount = Math.round(clamp((f.rpm - 4000) / (f.maxRpm - 4000), 0, 1) * segments.length);
  segments.forEach((el, i) => el.classList.toggle('active', i < activeCount));

  // 3. DRS Badge Encaixado no Topo do Círculo
  const drsClass = f.drs === 'ON' ? 'drs-pill on' : f.drs === 'READY' ? 'drs-pill ready' : 'drs-pill off';
  $('drsBadge').setAttribute('class', drsClass);

  // 4. Acelerador Curvo (Throttle)
  const tLen = (throttleTotalLen * f.throttle / 100).toFixed(1);
  if ($('throttleBar')) {
    $('throttleBar').style.strokeDasharray = `${tLen} ${throttleTotalLen}`;
  }
  if ($('throttlePctVal')) {
    $('throttlePctVal').textContent = `${Math.round(f.throttle)}%`;
  }

  // 5. Freio Curvo (Brake)
  const bLen = (brakeTotalLen * f.brake / 100).toFixed(1);
  if ($('brakeBar')) {
    $('brakeBar').style.strokeDasharray = `${bLen} ${brakeTotalLen}`;
  }

  // 6. Régua Curva de Marchas
  gearKeys.forEach(g => {
    const el = $('g_' + g);
    if (el) el.classList.toggle('active', g === f.gear);
  });

  // 7. Bateria ERS Integrada na Curva
  const eLen = (ersTotalLen * f.ers / 100).toFixed(1);
  if ($('ersBar')) {
    $('ersBar').style.strokeDasharray = `${eLen} ${ersTotalLen}`;
  }
  if ($('ersPctText')) {
    $('ersPctText').textContent = `${Math.round(f.ers)}%`;
  }

  // 8. Temperaturas dos Pneus
  if (f.tyres) {
    $('tyreText').textContent = `FL ${f.tyres.fl}°   FR ${f.tyres.fr}°   RL ${f.tyres.rl}°   RR ${f.tyres.rr}°`;
  }
}

export function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  const style = document.documentElement.style;

  const colorMap = {
    accentColor: '--accent',
    gearColor: '--gear-active',
    panelBg: '--panel',
    ersColor: '--ers',
    throttleColor: '--throttle',
    brakeColor: '--brake'
  };

  for (const [key, variable] of Object.entries(colorMap)) {
    if (/^#[0-9a-f]{6}$/i.test(cfg[key] || '')) {
      style.setProperty(variable, cfg[key]);
    }
  }

  if (cfg.opacity != null) {
    style.setProperty('--panel-opacity', clamp(cfg.opacity, 0, 100) / 100);
  }

  if (cfg.scale != null) {
    const scale = clamp(cfg.scale, 50, 150) / 100;
    $('halo').style.transform = `scale(${scale})`;
    $('halo').style.transformOrigin = '50% 50%';
  }

  document.body.classList.toggle('show-tyres', cfg.showTyres === true);
}

function connect() {
  if (disposed) return;
  const wsHost = (location.host && location.protocol !== 'file:') ? location.host : '127.0.0.1:8765';
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${wsHost}/ws/telemetry`);

  ws.onopen = () => {
    connected = true;
    lastFrame = null;
    updateStatus();
  };

  ws.onmessage = event => {
    try {
      const raw = JSON.parse(event.data);
      if (raw.type === 'config_update') {
        applyConfig(raw.config || raw.data || raw);
        return;
      }
      const data = raw.type === 'telemetry' ? (raw.data || raw) : raw;
      if (data.speed !== undefined || data.engineRPM !== undefined || data.engine_rpm !== undefined) {
        lastFrame = performance.now();
        pending = raw;
        updateStatus();
      }
    } catch (error) {
      console.warn('Pacote HUD inválido', error);
    }
  };

  ws.onclose = () => {
    connected = false;
    pending = null;
    updateStatus();
    if (!disposed) retry = setTimeout(connect, 1500);
  };

  ws.onerror = () => ws.close();
}

let raf;
function tick() {
  if (pending) {
    render(pending);
    pending = null;
  }
  raf = requestAnimationFrame(tick);
}
tick();

const statusTimer = setInterval(updateStatus, 250);

// Controles da janela
window.toggleLock = async () => {
  const next = !locked;
  const api = window.pywebview?.api;
  if (api) {
    try {
      if (!await api.set_clickthrough(next)) return;
    } catch {
      return;
    }
  }
  locked = next;
  document.body.classList.toggle('locked', locked);
  $('lockButton').textContent = locked ? 'Destravar · F8' : 'Travar · F8';
};

$('lockButton').onclick = window.toggleLock;
$('centerButton').onclick = () => window.pywebview?.api.center_hud();
$('closeButton').onclick = () => window.pywebview?.api.close_hud();

document.addEventListener('keydown', e => {
  if (e.key === 'F8' && !window.pywebview) {
    e.preventDefault();
    window.toggleLock();
  }
});

// Comunicação com o F1 Studio (iframe postMessage)
window.addEventListener('message', e => {
  if (e.origin === location.origin || e.origin === 'null' || !e.origin) {
    if (e.data?.type === 'halo-preview-config') {
      applyConfig(e.data.config);
    }
    if (e.data?.type === 'telemetry') {
      lastFrame = performance.now();
      pending = e.data;
      updateStatus();
    }
  }
});

window.addEventListener('beforeunload', () => {
  disposed = true;
  clearTimeout(retry);
  clearInterval(statusTimer);
  cancelAnimationFrame(raf);
  ws?.close();
});

// Carregar configuração inicial
const apiBase = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';
fetch(apiBase + '/api/config')
  .then(r => {
    if (!r.ok) throw Error(r.status);
    return r.json();
  })
  .then(applyConfig)
  .catch(() => {});

connect();
