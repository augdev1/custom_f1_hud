import {normalizeTelemetry, connectionState, clamp} from './halo-model.js';

const $ = id => document.getElementById(id);
const embedded = new URLSearchParams(location.search).has('embedded');
document.body.classList.toggle('embedded', embedded);

const ns = 'http://www.w3.org/2000/svg';

// ==========================================
// 1. ARCO DE TACÔMETRO (LEDS SUPERIORES DO POD)
// ==========================================
const TOTAL_LEDS = 24;
const START_ANGLE = -155 * Math.PI / 180;
const END_ANGLE = -25 * Math.PI / 180;

const segments = Array.from({length: TOTAL_LEDS}, (_, i) => {
  const angle = START_ANGLE + (i * (END_ANGLE - START_ANGLE) / (TOTAL_LEDS - 1));
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', (Math.cos(angle) * 62).toFixed(2));
  line.setAttribute('y1', (Math.sin(angle) * 62).toFixed(2));
  line.setAttribute('x2', (Math.cos(angle) * 72).toFixed(2));
  line.setAttribute('y2', (Math.sin(angle) * 72).toFixed(2));
  
  const type = i < 6 ? ' cyan' : i >= 20 ? ' redline' : '';
  line.setAttribute('class', 'rpm-led' + type);
  $('rpmSegments').append(line);
  return line;
});

// ==========================================
// 2. RÉGUA DE MARCHAS (ASA DIREITA)
// ==========================================
const gearList = ['N', '1', '2', '3', '4', '5', '6', '7', '8'];
const gears = gearList.map((gear, i) => {
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'gear-cell');
  // Leve curvatura acompanhando a inclinação do Halo
  const x = i * 23;
  const y = i * 3.5;
  g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);

  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', -11);
  rect.setAttribute('y', -14);
  rect.setAttribute('width', 22);
  rect.setAttribute('height', 28);
  rect.setAttribute('rx', 4);

  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', 0);
  t.setAttribute('y', 6);
  t.textContent = gear;

  g.append(rect, t);
  $('gearStrip').append(g);
  return {gear, g};
});

// ==========================================
// 3. SEGMENTOS CURVOS DE ACELERADOR (THROTTLE)
// ==========================================
const TOTAL_THROTTLE_BARS = 18;
// Pontos de controle da curva de aceleração: P0=(0,0), P1=(60,5), P2=(120,22), P3=(175,48)
function getBezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
  };
}

const throttleSegments = Array.from({length: TOTAL_THROTTLE_BARS}, (_, i) => {
  const t1 = i / TOTAL_THROTTLE_BARS;
  const t2 = (i + 0.75) / TOTAL_THROTTLE_BARS;
  const pt1 = getBezierPoint(t1, {x:0, y:0}, {x:60, y:5}, {x:120, y:22}, {x:175, y:48});
  const pt2 = getBezierPoint(t2, {x:0, y:0}, {x:60, y:5}, {x:120, y:22}, {x:175, y:48});

  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', pt1.x.toFixed(1));
  line.setAttribute('y1', pt1.y.toFixed(1));
  line.setAttribute('x2', pt2.x.toFixed(1));
  line.setAttribute('y2', pt2.y.toFixed(1));
  line.setAttribute('class', 'throttle-segment');
  line.style.opacity = '0.15';
  $('throttleBars').append(line);
  return line;
});

// Comprimento da trilha de freio para interpolação contínua
let brakeTotalLen = 170;
try {
  const bPath = $('brakeBar');
  if (bPath && bPath.getTotalLength) {
    brakeTotalLen = bPath.getTotalLength() || 170;
  }
} catch {}

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
    // Estado de repouso / espera
    $('speedVal').textContent = '0';
    $('mphVal').textContent = '0 MPH';
    $('throttlePctText').textContent = '0%';
    $('drsBadge').setAttribute('class', 'drs-pill off');
    throttleSegments.forEach(el => el.style.opacity = '0.15');
    if ($('brakeBar')) $('brakeBar').style.strokeDasharray = `0 ${brakeTotalLen}`;
    segments.forEach(el => el.classList.remove('active'));
  }
}

function render(raw) {
  const f = normalizeTelemetry(raw);

  // 1. Velocidade Principal (KM/H) e Secundária (MPH)
  $('speedVal').textContent = f.speed;
  $('mphVal').textContent = `${Math.round(f.speed * 0.621371)} MPH`;

  // 2. Tacômetro de RPM (LEDs Radiais em Arco)
  const activeCount = Math.round(clamp((f.rpm - 4000) / (f.maxRpm - 4000), 0, 1) * segments.length);
  segments.forEach((el, i) => el.classList.toggle('active', i < activeCount));

  // 3. DRS Badge Central Superior
  const drsClass = f.drs === 'ON' ? 'drs-pill on' : f.drs === 'READY' ? 'drs-pill ready' : 'drs-pill off';
  $('drsBadge').setAttribute('class', drsClass);

  // 4. Acelerador (Throttle) Segmentado
  const activeThrottle = Math.round((f.throttle / 100) * TOTAL_THROTTLE_BARS);
  throttleSegments.forEach((el, i) => {
    el.style.opacity = i < activeThrottle ? '1' : '0.15';
  });
  $('throttlePctText').textContent = `${Math.round(f.throttle)}%`;

  // 5. Freio (Brake) Contínuo
  const bLen = (brakeTotalLen * f.brake / 100).toFixed(1);
  if ($('brakeBar')) {
    $('brakeBar').style.strokeDasharray = `${bLen} ${brakeTotalLen}`;
  }

  // 6. Régua de Marchas
  gears.forEach(({gear, g}) => {
    const isActive = (gear === f.gear) || (gear === 'N' && f.gear === 'R');
    g.classList.toggle('active', isActive);
  });

  // 7. Bateria ERS Integrada
  const ersW = (130 * f.ers / 100).toFixed(1);
  $('ersBar').setAttribute('width', ersW);
  $('ersPctText').textContent = `${Math.round(f.ers)}%`;

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
