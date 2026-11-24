// =============================================================================
// F1 24 OFFICIAL BROADCAST HALO HUD - CANVAS 2D REPLICA (DPR 2x)
// Réplica 1:1 com curvas concêntricas, bordas fiéis e integração total F1 24
// =============================================================================

const $ = id => document.getElementById(id);
const canvas = $('haloCanvas');
const ctx = canvas.getContext('2d');

let locked = false;
let raf;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function hexToRgba(hex, alpha = 1) {
  if (typeof hex !== 'string') return `rgba(22,38,49,${alpha})`;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(22,38,49,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Geometria concêntrica mestre do arco do Halo (1200 x 480)
const ARCH_CX = 600;
const ARCH_CY = 910;
const ARCH_R = 720;

function archY(x, offset = 0) {
  const r = ARCH_R + offset;
  const dx = x - ARCH_CX;
  return ARCH_CY - Math.sqrt(Math.max(0, r * r - dx * dx));
}

function archAngle(x) {
  return Math.atan2(x - ARCH_CX, ARCH_CY - archY(x));
}

// Utilitário de retângulos arredondados sem vazamento de paths
function drawRoundRect(c, x, y, width, height, radius) {
  if (typeof c.roundRect === 'function') {
    c.beginPath();
    c.roundRect(x, y, width, height, radius);
    return;
  }
  c.beginPath();
  c.moveTo(x + radius, y);
  c.lineTo(x + width - radius, y);
  c.quadraticCurveTo(x + width, y, x + width, y + radius);
  c.lineTo(x + width, y + height - radius);
  c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  c.lineTo(x + radius, y + height);
  c.quadraticCurveTo(x, y + height, x, y + height - radius);
  c.lineTo(x, y + radius);
  c.quadraticCurveTo(x, y, x + radius, y);
  c.closePath();
}

// Escudo Ferrari em Canvas (topo reto, base afilada)
function drawFerrariShield(c, x, y, w, h) {
  c.save();
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w, y + h * 0.55);
  c.quadraticCurveTo(x + w * 0.85, y + h * 0.88, x + w * 0.5, y + h);
  c.quadraticCurveTo(x + w * 0.15, y + h * 0.88, x, y + h * 0.55);
  c.closePath();
  c.fillStyle = '#FFD600';
  c.fill();

  // Silhueta sutil do Cavallino no centro do escudo
  c.fillStyle = '#111111';
  c.beginPath();
  c.arc(x + w * 0.5, y + h * 0.52, w * 0.22, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// Seta curva verde de delta (igual ao broadcast F1)
function drawDeltaArrow(c, x, y, color) {
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1.8;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y + 2);
  c.quadraticCurveTo(x + 7, y - 2, x + 13, y - 3);
  c.stroke();

  c.beginPath();
  c.moveTo(x + 15, y - 3.5);
  c.lineTo(x + 9, y - 6.5);
  c.lineTo(x + 10.5, y + 0.5);
  c.closePath();
  c.fill();
  c.restore();
}

// Configurações do HUD
let currentCfg = {
  scale: 100,
  opacity: 30,
  accentColor: '#54D8E8',
  borderColor: '#AADAE8',
  textColor: '#F4F7FA',
  panelBg: '#162631',
  gearColor: '#54D8E8',
  ersColor: '#FFC857',
  throttleColor: '#69E6A6',
  brakeColor: '#FF5268',
  showHaloBar: false,
  showTyres: false
};

// Estado da telemetria inicializado com os valores exatos da referência F1 TV
let latestTelemetry = normalizeTelemetry({
  speed: 264,
  gear: 6,
  engineRPM: 11850,
  maxRPM: 13500,
  throttle: 1,
  brake: 0,
  drs: 1,
  drsAllowed: 1,
  ersStoreEnergy: 3120000
});

let connected = false;
let lastFrame = null;
let pending = null;
let ws;
let retry;
let disposed = false;

// =============================================================================
// RENDERIZADOR CANVAS 2D DE ALTA RESOLUÇÃO (DPR 2x: 2400 x 960)
// =============================================================================
// All wings, rows and labels share this baseline. Text is never rotated
// independently from its row, and the circular pod shares the chassis center.
function drawHUD(f, cfg) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(2, 2);
  const scale = clamp(Number(cfg.scale) || 100, 50, 110) / 100;
  ctx.translate(600, 240); ctx.scale(scale, scale); ctx.translate(-600, -240);
  document.body.classList.toggle('embedded', location.search.includes('embedded=1'));

  // Curva principal seguindo o arco natural do Halo e afunilamento suave nas pontas
  const top = x => 110 + 0.00060 * (x - 600) ** 2;
  const angle = x => Math.atan(0.00120 * (x - 600));
  const wingH = x => 140 - 22 * Math.pow(clamp((Math.abs(x - 600) - 180) / 275, 0, 1), 1.5);

  const opacity = clamp(cfg.opacity ?? 30, 0, 100) / 100;
  const accent = cfg.gearColor || cfg.accentColor || '#54D8E8';
  const borderBase = cfg.borderColor || cfg.accentColor || '#AADAE8';
  const white = cfg.textColor || '#F4F7FA', muted = '#91A2B5';

  // Chassi simétrico encaixado sobre o arco do Halo (sem vazar nas laterais)
  const chassis = new Path2D();
  chassis.moveTo(155, top(155));
  for (let x = 165; x <= 490; x += 10) chassis.lineTo(x, top(x));
  chassis.bezierCurveTo(535, 110, 530, 54, 570, 54);
  chassis.quadraticCurveTo(600, 50, 630, 54);
  chassis.bezierCurveTo(670, 54, 665, 110, 710, top(710));
  for (let x = 720; x <= 1045; x += 10) chassis.lineTo(x, top(x));
  chassis.quadraticCurveTo(1056, top(1045) + wingH(1045) * 0.55, 1054, top(1054) + wingH(1054));
  for (let x = 1044; x >= 690; x -= 10) chassis.lineTo(x, top(x) + wingH(x));
  chassis.bezierCurveTo(660, 275, 540, 275, 510, top(510) + wingH(510));
  for (let x = 500; x >= 156; x -= 10) chassis.lineTo(x, top(x) + wingH(x));
  chassis.quadraticCurveTo(144, top(155) + wingH(155) * 0.55, 155, top(155));
  chassis.closePath();

  ctx.fillStyle = hexToRgba(cfg.panelBg || '#162631', opacity);
  ctx.fill(chassis);
  ctx.strokeStyle = hexToRgba(borderBase, 0.72);
  ctx.lineWidth = 1.3;
  ctx.stroke(chassis);

  // Helpers proporcionais: linhas divisórias e textos sempre centralizados na faixa
  function curve(start, end, fracOrPx, color, width = 1, proportional = false) {
    ctx.beginPath();
    for (let x = start; x <= end; x += 2) {
      const y = top(x) + (proportional ? wingH(x) * fracOrPx : fracOrPx);
      if (x === start) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  function label(value, x, frac, size = 18, color = white, align = 'left', span = 105) {
    const x2 = align === 'right' ? x - span : x + span;
    const y1 = top(x) + wingH(x) * frac;
    const y2 = top(x2) + wingH(x2) * frac;
    const rot = align === 'right' ? Math.atan2(y1 - y2, x - x2) : Math.atan2(y2 - y1, x2 - x);
    ctx.save();
    ctx.translate(x, y1);
    ctx.rotate(rot);
    ctx.font = `700 ${size}px "Titillium Web", "Segoe UI", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(String(value), 0, 0);
    ctx.restore();
  }

  // Linhas divisórias brancas/estruturais 100% alinhadas e simétricas (38% e 70% da altura da asa)
  const divColor = hexToRgba(borderBase, 0.28);
  curve(165, 490, 0.38, divColor, 1.1, true);
  curve(165, 490, 0.70, divColor, 1.1, true);
  curve(710, 1035, 0.38, divColor, 1.1, true);
  curve(710, 1035, 0.70, divColor, 1.1, true);

  // Asa Esquerda (margens alinhadas: 192 à esquerda, 468 à direita)
  label('11  SAINZ', 192, 0.19, 19); label('+0.241', 468, 0.19, 18, white, 'right');
  label('12  RUSSELL', 192, 0.54, 19); label('+0.386', 468, 0.54, 18, white, 'right');
  label(`ERS ${Math.round(f.ers)}%`, 192, 0.85, 14, cfg.ersColor || '#FFC857');
  curve(278, 468, 0.85, hexToRgba(borderBase, 0.18), 6, true);
  if (f.ers > 0) curve(278, 278 + 190 * clamp(f.ers, 0, 100) / 100, 0.85, cfg.ersColor || '#FFC857', 6, true);

  // Centro: mostrador circular + RPM + velocidade + DRS
  const cx = 600, cy = 185, r = 70;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = hexToRgba(borderBase, 0.55); ctx.lineWidth = 1; ctx.stroke();
  const count = 36, active = Math.round(clamp((f.rpm - 4000) / Math.max(1, f.maxRpm - 4000), 0, 1) * count);
  for (let i = 0; i < count; i++) {
    const a = (-220 + i * 260 / (count - 1)) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58);
    ctx.lineTo(cx + Math.cos(a) * 65, cy + Math.sin(a) * 65);
    ctx.lineWidth = 4;
    ctx.strokeStyle = i >= active ? 'rgba(190,218,229,.18)' : i > 29 ? (cfg.brakeColor || '#FF5268') : i < 6 ? accent : (cfg.throttleColor || '#69E6A6');
    ctx.stroke();
  }
  ctx.font = '700 42px "Titillium Web", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = white; ctx.fillText(String(f.speed), cx, 181);
  ctx.font = '700 12px "Titillium Web", "Segoe UI", sans-serif'; ctx.fillStyle = muted; ctx.fillText('KM/H', cx, 216);
  drawRoundRect(ctx, 554, 66, 92, 28, 14); ctx.strokeStyle = f.drs === 'ON' ? (cfg.throttleColor || '#69E6A6') : muted; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.fillStyle = f.drs === 'ON' ? (cfg.throttleColor || '#69E6A6') : muted; ctx.font = '700 13px "Titillium Web", "Segoe UI", sans-serif'; ctx.fillText(`DRS ${f.drs}`, 600, 80);

  // Asa Direita (espelho simétrico: 732 à esquerda, 1008 à direita)
  const blocks = 18;
  for (let i = 0; i < blocks; i++) {
    const x = 732 + i * 10;
    ctx.save();
    ctx.translate(x, top(x) + wingH(x) * 0.19);
    ctx.rotate(angle(x));
    ctx.fillStyle = i < Math.round(f.throttle / 100 * blocks) ? (cfg.throttleColor || '#69E6A6') : 'rgba(190,218,229,.2)';
    drawRoundRect(ctx, -3, -7, 6, 14, 1);
    ctx.fill();
    ctx.restore();
  }
  label(`THROTTLE ${Math.round(f.throttle)}%`, 1008, 0.19, 12, white, 'right');
  curve(732, 912, 0.54, 'rgba(190,218,229,.2)', 5, true);
  if (f.brake > 0) curve(732, 732 + 180 * clamp(f.brake, 0, 100) / 100, 0.54, cfg.brakeColor || '#FF5268', 5, true);
  label(`BRAKE ${Math.round(f.brake)}%`, 1008, 0.54, 12, white, 'right');

  const gears = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'];
  gears.forEach((g, i) => {
    const x = 732 + i * 29;
    ctx.save();
    ctx.translate(x, top(x) + wingH(x) * 0.85);
    ctx.rotate(angle(x));
    if (g === f.gear) {
      drawRoundRect(ctx, -11, -12, 22, 24, 5);
      ctx.fillStyle = cfg.gearColor || accent;
      ctx.fill();
    }
    ctx.font = '700 17px "Titillium Web", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = g === f.gear ? '#0B121A' : white;
    ctx.fillText(g, 0, 0);
    ctx.restore();
  });

  if (cfg.showTyres && f.tyres) {
    ctx.font = '700 11px "Titillium Web", "Segoe UI", sans-serif';
    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    ctx.fillText(`FL ${f.tyres.fl}°  FR ${f.tyres.fr}°  RL ${f.tyres.rl}°  RR ${f.tyres.rr}°`, 600, 310);
  }
  ctx.restore();
}

// =============================================================================
// NORMALIZAÇÃO DE TELEMETRIA
// =============================================================================
export function normalizeTelemetry(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      speed: 0,
      gear: 'N',
      rpm: 0,
      maxRpm: 13500,
      throttle: 0,
      brake: 0,
      drs: 'OFF',
      ers: 0,
      tyres: null
    };
  }

  const d = (raw.data && typeof raw.data === 'object') ? raw.data : raw;

  const spd = Number(d.speed ?? d.m_speed ?? d.Speed ?? 0);
  const speed = Number.isFinite(spd) ? Math.max(0, Math.round(spd)) : 0;

  let g = d.gear ?? d.m_gear ?? d.Gear ?? 0;
  if (typeof g === 'number') {
    if (g === -1) g = 'R';
    else if (g === 0) g = 'N';
    else g = String(g);
  } else {
    g = String(g).toUpperCase();
  }
  const gear = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'].includes(g) ? g : 'N';

  const rpmVal = Number(d.engineRPM ?? d.engineRpm ?? d.m_engineRPM ?? d.rpm ?? 0);
  const rpm = Number.isFinite(rpmVal) ? Math.max(0, Math.round(rpmVal)) : 0;
  const maxRpmVal = Number(d.maxRPM ?? d.maxRpm ?? d.m_maxRPM ?? 13500);
  const maxRpm = Number.isFinite(maxRpmVal) && maxRpmVal > 0 ? maxRpmVal : 13500;

  const thrRaw = Number(d.throttle ?? d.m_throttle ?? d.Throttle ?? 0);
  const throttle = thrRaw <= 1.0 ? Math.round(thrRaw * 100) : clamp(Math.round(thrRaw), 0, 100);

  const brkRaw = Number(d.brake ?? d.m_brake ?? d.Brake ?? 0);
  const brake = brkRaw <= 1.0 ? Math.round(brkRaw * 100) : clamp(Math.round(brkRaw), 0, 100);

  const drsActive = Boolean(d.drs ?? d.m_drs ?? d.DRS ?? 0);
  const drsAllowed = Boolean(d.drsAllowed ?? d.m_drsAllowed ?? 0);
  const drs = drsActive ? 'ON' : (drsAllowed ? 'READY' : 'OFF');

  let ers = 0;
  const ersEnergy = d.ersStoreEnergy ?? d.m_ersStoreEnergy;
  if (ersEnergy != null) {
    ers = clamp(Math.round((Number(ersEnergy) / 4000000) * 100), 0, 100);
  } else if (d.ers != null) {
    ers = clamp(Math.round(Number(d.ers)), 0, 100);
  }

  let tyres = null;
  const st = d.tyresSurfaceTemperature ?? d.m_tyresSurfaceTemperature;
  if (Array.isArray(st) && st.length >= 4) {
    tyres = {
      fl: Math.round(st[0]),
      fr: Math.round(st[1]),
      rl: Math.round(st[2]),
      rr: Math.round(st[3])
    };
  }

  return { speed, gear, rpm, maxRpm, throttle, brake, drs, ers, tyres };
}

// =============================================================================
// CONFIGURAÇÕES E CICLO DE TELEMETRIA WEBSOCKET
// =============================================================================
export function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  currentCfg = { ...currentCfg, ...cfg };
  drawHUD(latestTelemetry, currentCfg);
}

function connect() {
  if (disposed) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.hostname ? `${location.hostname}:8765` : '127.0.0.1:8765';
  const url = `${proto}//${host}/ws`;

  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected = true;
  };

  ws.onmessage = ev => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'telemetry') {
        lastFrame = performance.now();
        pending = msg;
      } else if (msg.type === 'config_update') {
        applyConfig(msg.config);
      }
    } catch {}
  };

  ws.onclose = () => {
    connected = false;
    scheduleReconnect();
  };

  ws.onerror = () => {
    try { ws.close(); } catch {}
  };
}

function scheduleReconnect() {
  if (disposed) return;
  clearTimeout(retry);
  retry = setTimeout(connect, 1000);
}

function tick() {
  if (disposed) return;
  if (pending) {
    latestTelemetry = normalizeTelemetry(pending);
    pending = null;
  }
  drawHUD(latestTelemetry, currentCfg);
  raf = requestAnimationFrame(tick);
}
tick();

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

// Comunicação com o Studio (postMessage)
window.addEventListener('message', e => {
  if (e.data?.type === 'halo-preview-config') {
    applyConfig(e.data.config);
  }
  if (e.data?.type === 'telemetry') {
    lastFrame = performance.now();
    pending = e.data;
  }
});

window.addEventListener('beforeunload', () => {
  disposed = true;
  clearTimeout(retry);
  cancelAnimationFrame(raf);
  ws?.close();
});

const apiBase = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';
fetch(apiBase + '/api/config')
  .then(r => {
    if (!r.ok) throw Error(r.status);
    return r.json();
  })
  .then(applyConfig)
  .catch(() => {});

connect();
