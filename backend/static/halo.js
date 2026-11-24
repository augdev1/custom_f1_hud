import {normalizeTelemetry, connectionState, clamp} from './halo-model.js';

const $ = id => document.getElementById(id);
const embedded = new URLSearchParams(location.search).has('embedded');
document.body.classList.toggle('embedded', embedded);

const ns = 'http://www.w3.org/2000/svg';

// Arco de Tacômetro (LEDs na crista superior do Pod Central: -145° a -35°)
const TOTAL_LEDS = 24;
const START_ANGLE = -145 * Math.PI / 180;
const END_ANGLE = -35 * Math.PI / 180;

const segments = Array.from({length: TOTAL_LEDS}, (_, i) => {
  const angle = START_ANGLE + (i * (END_ANGLE - START_ANGLE) / (TOTAL_LEDS - 1));
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', (Math.cos(angle) * 58).toFixed(2));
  line.setAttribute('y1', (Math.sin(angle) * 58).toFixed(2));
  line.setAttribute('x2', (Math.cos(angle) * 66).toFixed(2));
  line.setAttribute('y2', (Math.sin(angle) * 66).toFixed(2));
  line.setAttribute('class', 'rpm-led' + (i >= 20 ? ' redline' : ''));
  $('rpmSegments').append(line);
  return line;
});

// Régua de Marchas da Asa Direita
const gears = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'].map((gear, i) => {
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'gear-cell' + (gear === 'R' ? ' reverse' : ''));
  g.setAttribute('transform', `translate(${i * 20.5} 0)`);
  
  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', 0);
  rect.setAttribute('y', 0);
  rect.setAttribute('width', 19);
  rect.setAttribute('height', 25);
  rect.setAttribute('rx', 3);

  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', 9.5);
  t.setAttribute('y', 17.5);
  t.textContent = gear;

  g.append(rect, t);
  $('gearStrip').append(g);
  return {gear, g};
});

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
    // Resetar medidores para estado seguro em standby
    $('throttleBar').setAttribute('y', 86);
    $('throttleBar').setAttribute('height', 0);
    $('brakeBar').setAttribute('y', 86);
    $('brakeBar').setAttribute('height', 0);
    $('drsBadge').setAttribute('class', 'drs-pill');
    $('drsText').textContent = 'DRS';
    $('speedVal').textContent = '0';
    $('mphVal').textContent = '0 MPH';
    segments.forEach(el => el.classList.remove('active'));
  }
}

function render(raw) {
  const f = normalizeTelemetry(raw);

  // Velocidade e Unidade Secundária
  $('speedVal').textContent = f.speed;
  $('mphVal').textContent = `${Math.round(f.speed * 0.621371)} MPH`;
  $('rpmNumText').textContent = `${Math.round(f.rpm)} RPM`;

  // Barra de ERS (Largura máx 138)
  const ersWidth = (138 * f.ers / 100).toFixed(1);
  $('ersBar').setAttribute('width', ersWidth);
  $('ersPctText').textContent = `${Math.round(f.ers)}%`;

  // Barras Verticais de Freio e Acelerador (Altura máx 74, base em y=86)
  const bHeight = clamp(74 * f.brake / 100, 0, 74);
  $('brakeBar').setAttribute('y', (86 - bHeight).toFixed(1));
  $('brakeBar').setAttribute('height', bHeight.toFixed(1));

  const tHeight = clamp(74 * f.throttle / 100, 0, 74);
  $('throttleBar').setAttribute('y', (86 - tHeight).toFixed(1));
  $('throttleBar').setAttribute('height', tHeight.toFixed(1));

  // Tacômetro de RPM (LEDs no arco)
  const activeCount = Math.round(clamp((f.rpm - 4000) / (f.maxRpm - 4000), 0, 1) * segments.length);
  segments.forEach((el, i) => el.classList.toggle('active', i < activeCount));

  // Régua de Marchas
  gears.forEach(({gear, g}) => g.classList.toggle('active', gear === f.gear));

  // Badge Central de DRS
  const drsClass = f.drs === 'ON' ? 'drs-pill on' : f.drs === 'READY' ? 'drs-pill ready' : 'drs-pill';
  $('drsBadge').setAttribute('class', drsClass);
  $('drsText').textContent = f.drs === 'READY' ? 'DRS RDY' : f.drs === 'ON' ? 'DRS ON' : 'DRS';

  // Temperaturas dos Pneus
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

// Controles da janela flutuante
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

// Carregar configuração persistida
const apiBase = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';
fetch(apiBase + '/api/config')
  .then(r => {
    if (!r.ok) throw Error(r.status);
    return r.json();
  })
  .then(applyConfig)
  .catch(() => {});

connect();
