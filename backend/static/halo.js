import {normalizeTelemetry, connectionState, clamp} from './halo-model.js';

const $ = id => document.getElementById(id);
const embedded = new URLSearchParams(location.search).has('embedded');
document.body.classList.toggle('embedded', embedded);

const canvas = $('haloCanvas');
const ctx = canvas.getContext('2d');

// Helper para desenhar retângulos arredondados
function roundRect(context, x, y, width, height, radius) {
  if (width < 2 * radius) radius = width / 2;
  if (height < 2 * radius) radius = height / 2;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

// Configuração padrão
let currentCfg = {
  scale: 100,
  opacity: 85,
  accentColor: '#00F5D4',
  panelBg: '#080c10',
  showTyres: false
};

// Estado da telemetria
let latestTelemetry = normalizeTelemetry({ speed: 264, gear: 6, engineRPM: 11800, maxRPM: 13500, throttle: 1, brake: 0, drs: 1, drsAllowed: 1, ersStoreEnergy: 3120000 });
let connected = false;
let lastFrame = null;
let pending = null;
let locked = false;
let ws;
let retry;
let disposed = false;

// ==============================================
// RENDERIZAÇÃO COMPLETA EM CANVAS 2D (DPR 2x)
// ==============================================
function drawHUD(f, cfg) {
  // Limpar canvas
  ctx.clearRect(0, 0, 2400, 960);

  ctx.save();
  // Aplicar escala DPR 2x
  ctx.scale(2, 2);

  // Aplicar escala do usuário configurável (centro em 600, 230)
  const userScale = clamp(cfg.scale || 100, 50, 150) / 100;
  if (userScale !== 1) {
    ctx.translate(600, 230);
    ctx.scale(userScale, userScale);
    ctx.translate(-600, -230);
  }

  // ----------------------------------------------------
  // 1. CHASSI DO HALO (SILHUETA SUAVE EM ARCO INVERTIDO)
  // ----------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(120, 310);
  ctx.bezierCurveTo(240, 260, 380, 215, 518, 192);
  ctx.bezierCurveTo(538, 150, 560, 114, 600, 114);
  ctx.bezierCurveTo(640, 114, 662, 150, 682, 192);
  ctx.bezierCurveTo(820, 215, 960, 260, 1080, 310);
  ctx.bezierCurveTo(1095, 335, 1080, 375, 1055, 385);
  ctx.bezierCurveTo(940, 340, 810, 290, 682, 268);
  ctx.arc(600, 230, 82, 0.48, Math.PI - 0.48, false);
  ctx.bezierCurveTo(390, 290, 260, 340, 145, 385);
  ctx.bezierCurveTo(120, 375, 105, 335, 120, 310);
  ctx.closePath();

  // Preenchimento de vidro fumê translúcido
  ctx.fillStyle = 'rgba(8, 12, 16, 0.82)';
  ctx.fill();

  // Borda neon superior contínua com glow
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#00F0FF';
  const edgeGrad = ctx.createLinearGradient(120, 310, 1080, 310);
  edgeGrad.addColorStop(0, '#00F5D4');
  edgeGrad.addColorStop(0.35, '#00F0FF');
  edgeGrad.addColorStop(0.5, '#76FF03');
  edgeGrad.addColorStop(0.65, '#00F0FF');
  edgeGrad.addColorStop(1, '#00F5D4');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.restore();

  // Linha divisória interna curva na asa esquerda
  ctx.beginPath();
  ctx.moveTo(165, 338);
  ctx.quadraticCurveTo(340, 280, 518, 230);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // ----------------------------------------------------
  // 2. POD CENTRAL (VELOCÍMETRO + TACÔMETRO + DRS)
  // ----------------------------------------------------
  // Fundo circular escuro com gradiente radial
  const podGrad = ctx.createRadialGradient(600, 230, 10, 600, 230, 82);
  podGrad.addColorStop(0, '#0a1218');
  podGrad.addColorStop(1, '#04070a');
  ctx.beginPath();
  ctx.arc(600, 230, 82, 0, Math.PI * 2);
  ctx.fillStyle = podGrad;
  ctx.fill();

  // Anel externo com brilho ciano
  ctx.save();
  ctx.shadowBlur = 16;
  ctx.shadowColor = '#00F0FF';
  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();

  // Tacômetro de RPM (LEDs Radiais em Arco de -150° a -30°)
  const TOTAL_LEDS = 24;
  const START_ANGLE = -150 * Math.PI / 180;
  const END_ANGLE = -30 * Math.PI / 180;
  const activeLeds = Math.round(clamp((f.rpm - 4000) / (f.maxRpm - 4000), 0, 1) * TOTAL_LEDS);

  for (let i = 0; i < TOTAL_LEDS; i++) {
    const angle = START_ANGLE + (i * (END_ANGLE - START_ANGLE) / (TOTAL_LEDS - 1));
    const r1 = 70;
    const r2 = 80;
    const x1 = 600 + Math.cos(angle) * r1;
    const y1 = 230 + Math.sin(angle) * r1;
    const x2 = 600 + Math.cos(angle) * r2;
    const y2 = 230 + Math.sin(angle) * r2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 4.4;
    ctx.lineCap = 'round';

    if (i < activeLeds) {
      ctx.save();
      if (i >= 20) {
        ctx.strokeStyle = '#FF2A4D';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#FF2A4D';
      } else if (i < 6) {
        ctx.strokeStyle = '#00F0FF';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00F0FF';
      } else {
        ctx.strokeStyle = '#76FF03';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#76FF03';
      }
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();
    }
  }

  // Pílula DRS Encaixada no Topo do Círculo
  ctx.save();
  const drsOn = f.drs === 'ON';
  const drsReady = f.drs === 'READY' || drsOn;
  if (drsOn) {
    ctx.fillStyle = '#76FF03';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#76FF03';
    roundRect(ctx, 552, 114, 96, 28, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = '900 italic 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#03080E';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', 600, 133);
  } else if (drsReady) {
    ctx.fillStyle = 'rgba(4, 20, 10, 0.96)';
    roundRect(ctx, 552, 114, 96, 28, 14);
    ctx.fill();
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#76FF03';
    ctx.strokeStyle = '#76FF03';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = '900 italic 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#76FF03';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', 600, 133);
  } else {
    ctx.fillStyle = 'rgba(4, 12, 8, 0.9)';
    roundRect(ctx, 552, 114, 96, 28, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(139, 155, 176, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '900 italic 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#8B9BB0';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', 600, 133);
  }
  ctx.restore();

  // Textos Internos do Velocímetro
  ctx.font = '850 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = '#8B9BB0';
  ctx.textAlign = 'center';
  ctx.fillText('RPM', 600, 180);

  // Velocidade Digital Gigante (Sem 0 MPH)
  ctx.save();
  ctx.font = '900 italic 56px "Titillium Web", "Chakra Petch", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 10;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
  ctx.fillText(String(f.speed), 600, 238);
  ctx.restore();

  ctx.font = '850 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = '#8B9BB0';
  ctx.textAlign = 'center';
  ctx.fillText('KM/H', 600, 268);

  // ----------------------------------------------------
  // 3. ASA ESQUERDA (INCLINADA ACOMPANHANDO A CURVA)
  // ----------------------------------------------------
  ctx.save();
  ctx.translate(518, 230);
  ctx.rotate(-0.30); // ~ -17 graus

  // Piloto 1 (11 SAINZ)
  ctx.fillStyle = '#FFEB3B';
  ctx.fillRect(-330, -32, 10, 14);

  ctx.font = '900 italic 18px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('11  SAINZ', -310, -20);

  ctx.font = '900 italic 14px "Titillium Web", sans-serif';
  ctx.fillStyle = '#76FF03';
  ctx.textAlign = 'right';
  ctx.fillText('+0.241s ▶', -45, -20);

  // Piloto 2 (12 RUSSELL)
  ctx.fillStyle = '#00F5D4';
  ctx.beginPath();
  ctx.arc(-325, 6, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '900 italic 18px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('12  RUSSELL', -310, 12);

  ctx.font = '900 italic 14px "Titillium Web", sans-serif';
  ctx.fillStyle = '#76FF03';
  ctx.textAlign = 'right';
  ctx.fillText('+0.241s ▶', -45, 12);

  // Barra de Bateria ERS
  ctx.font = '850 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = '#8B9BB0';
  ctx.textAlign = 'left';
  ctx.fillText('ERS', -330, 36);

  ctx.fillStyle = 'rgba(139, 155, 176, 0.22)';
  roundRect(ctx, -295, 29, 200, 7, 3.5);
  ctx.fill();

  const ersWidth = Math.max(0, 200 * f.ers / 100);
  if (ersWidth > 0) {
    ctx.save();
    const eGrad = ctx.createLinearGradient(-295, 0, -95, 0);
    eGrad.addColorStop(0, '#0088FF');
    eGrad.addColorStop(1, '#00F5D4');
    ctx.fillStyle = eGrad;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#00F5D4';
    roundRect(ctx, -295, 29, ersWidth, 7, 3.5);
    ctx.fill();
    ctx.restore();
  }

  ctx.font = '900 italic 12px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(f.ers)}%`, -45, 36);

  ctx.restore();

  // ----------------------------------------------------
  // 4. ASA DIREITA (INCLINADA ACOMPANHANDO A CURVA)
  // ----------------------------------------------------
  ctx.save();
  ctx.translate(682, 230);
  ctx.rotate(0.30); // ~ +17 graus

  // Barra de Throttle (Acelerador 0-100% em 16 blocos)
  const TOTAL_THR_BLOCKS = 16;
  const activeThr = Math.round((f.throttle / 100) * TOTAL_THR_BLOCKS);

  for (let i = 0; i < TOTAL_THR_BLOCKS; i++) {
    const bx = 45 + i * 12;
    const by = -28;
    const bw = 9;
    const bh = 10;

    if (i < activeThr) {
      ctx.save();
      ctx.fillStyle = '#76FF03';
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#76FF03';
      roundRect(ctx, bx, by, bw, bh, 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      roundRect(ctx, bx, by, bw, bh, 2);
      ctx.fill();
    }
  }

  ctx.font = '900 italic 12px "Titillium Web", sans-serif';
  ctx.fillStyle = '#76FF03';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(f.throttle)}%  THROTTLE`, 245, -20);

  // Barra de Freio (Brake)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  roundRect(ctx, 45, -12, 190, 4.5, 2);
  ctx.fill();

  const brkWidth = Math.max(0, 190 * f.brake / 100);
  if (brkWidth > 0) {
    ctx.save();
    ctx.fillStyle = '#FF2A4D';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#FF2A4D';
    roundRect(ctx, 45, -12, brkWidth, 4.5, 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.font = '900 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FF2A4D';
  ctx.textAlign = 'left';
  ctx.fillText('BRAKE', 245, -8);

  // Régua de Marchas: N 1 2 3 4 5 6 7 8 (Sem R e sem pular nenhum número)
  const gears = ['N', '1', '2', '3', '4', '5', '6', '7', '8'];
  gears.forEach((gear, idx) => {
    const gx = 45 + idx * 32;
    const gy = 16;
    const isActive = (gear === f.gear) || (gear === 'N' && f.gear === 'R');

    if (isActive) {
      ctx.save();
      ctx.fillStyle = '#00F5D4';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#00F5D4';
      roundRect(ctx, gx - 12, gy, 26, 28, 4);
      ctx.fill();
      ctx.restore();

      ctx.font = '900 italic 19px "Titillium Web", sans-serif';
      ctx.fillStyle = '#03080E';
      ctx.textAlign = 'center';
      ctx.fillText(gear, gx + 1, gy + 21);
    } else {
      ctx.font = '900 italic 19px "Titillium Web", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(gear, gx + 1, gy + 21);
    }
  });

  ctx.restore();

  // ----------------------------------------------------
  // 5. TEMPERATURAS DOS PNEUS (SE HABILITADO)
  // ----------------------------------------------------
  if (cfg.showTyres && f.tyres) {
    ctx.font = '10px "Titillium Web", sans-serif';
    ctx.fillStyle = '#8B9BB0';
    ctx.textAlign = 'center';
    ctx.fillText(`FL ${f.tyres.fl}°   FR ${f.tyres.fr}°   RL ${f.tyres.rl}°   RR ${f.tyres.rr}°`, 600, 465);
  }

  ctx.restore();
}

// ==============================================
// LOOP DE EXECUÇÃO E CONEXÃO WEBSOCKET
// ==============================================
export function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  Object.assign(currentCfg, cfg);
  drawHUD(latestTelemetry, currentCfg);
}

function connect() {
  if (disposed) return;
  const wsHost = (location.host && location.protocol !== 'file:') ? location.host : '127.0.0.1:8765';
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${wsHost}/ws/telemetry`);

  ws.onopen = () => {
    connected = true;
    lastFrame = null;
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
      }
    } catch (error) {
      console.warn('Pacote HUD inválido', error);
    }
  };

  ws.onclose = () => {
    connected = false;
    pending = null;
    if (!disposed) retry = setTimeout(connect, 1500);
  };

  ws.onerror = () => ws.close();
}

let raf;
function tick() {
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
  if (e.origin === location.origin || e.origin === 'null' || !e.origin) {
    if (e.data?.type === 'halo-preview-config') {
      applyConfig(e.data.config);
    }
    if (e.data?.type === 'telemetry') {
      lastFrame = performance.now();
      pending = e.data;
    }
  }
});

window.addEventListener('beforeunload', () => {
  disposed = true;
  clearTimeout(retry);
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
