// =============================================================================
// F1 24 OFFICIAL BROADCAST HALO HUD - CANVAS 2D REPLICA (DPR 2x)
// Réplica 1:1 de telemetria baseada na geometria e proporções oficiais F1 TV
// =============================================================================

const $ = id => document.getElementById(id);
const canvas = $('haloCanvas');
const ctx = canvas.getContext('2d');

let locked = false;
let raf;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
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

// Configurações do HUD
let currentCfg = {
  scale: 100,
  opacity: 85,
  accentColor: '#00F5D4',
  panelBg: '#080c10',
  gearColor: '#00F5D4',
  ersColor: '#00D2BE',
  throttleColor: '#76FF03',
  brakeColor: '#FF2A4D',
  showHaloBar: true,
  showTyres: false
};

// Estado da telemetria inicializado com os valores idênticos ao quadro da F1 TV
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
// Proporções exatas extraídas do broadcast oficial da F1
// =============================================================================
function drawHUD(f, cfg) {
  // Limpar canvas de 2400x960
  ctx.clearRect(0, 0, 2400, 960);

  ctx.save();
  // Escala DPR 2x (Coordenadas virtuais: 1200 x 480)
  ctx.scale(2, 2);

  // Escala opcional do usuário (centro em 600, 196)
  const userScale = clamp(cfg.scale || 100, 50, 150) / 100;
  if (userScale !== 1) {
    ctx.translate(600, 196);
    ctx.scale(userScale, userScale);
    ctx.translate(-600, -196);
  }

  // ---------------------------------------------------------------------------
  // 0. ARCO DE FIBRA DE CARBONO DO HALO (BASE VISUAL REALISTA)
  // ---------------------------------------------------------------------------
  const isEmbedded = window.location.search.includes('embedded=1');
  if (isEmbedded) {
    document.body.classList.add('embedded');
  }
  if (!isEmbedded && cfg.showHaloBar) {
    ctx.save();
    ctx.beginPath();
    // Borda externa do arco do Halo
    ctx.moveTo(110, 360);
    ctx.bezierCurveTo(240, 280, 410, 215, 600, 215);
    ctx.bezierCurveTo(790, 215, 960, 280, 1090, 360);
    // Borda interna do arco do Halo
    ctx.bezierCurveTo(940, 320, 770, 275, 600, 275);
    ctx.bezierCurveTo(430, 275, 260, 320, 110, 360);
    ctx.closePath();

    // Gradiente e textura de carbono metálico escuro
    const haloGrad = ctx.createLinearGradient(600, 215, 600, 360);
    haloGrad.addColorStop(0, '#1c2229');
    haloGrad.addColorStop(0.3, '#2a3440');
    haloGrad.addColorStop(0.7, '#14181e');
    haloGrad.addColorStop(1, '#0c0f13');
    ctx.fillStyle = haloGrad;
    ctx.fill();

    // Brilho especular sutil na borda superior do Halo
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(110, 360);
    ctx.bezierCurveTo(240, 280, 410, 215, 600, 215);
    ctx.bezierCurveTo(790, 215, 960, 280, 1090, 360);
    ctx.stroke();
    ctx.restore();
  }

  // Opacidade configurável do chassi de vidro
  const glassOpacity = clamp(cfg.opacity != null ? cfg.opacity : 85, 0, 100) / 100;

  // ---------------------------------------------------------------------------
  // 1. CHASSI DO HALO (SILHUETA SUAVE ASA DE GAIVOTA / GULL-WING)
  // ---------------------------------------------------------------------------
  ctx.beginPath();
  // Ponta da asa esquerda
  ctx.moveTo(120, 285);
  // Borda superior da asa esquerda subindo suavemente
  ctx.bezierCurveTo(126, 230, 160, 185, 220, 160);
  ctx.bezierCurveTo(340, 125, 460, 115, 542, 108);
  // Cúpula superior do DRS (Hump central elevado)
  ctx.bezierCurveTo(565, 52, 635, 52, 658, 108);
  // Borda superior da asa direita descendo suavemente
  ctx.bezierCurveTo(740, 115, 860, 125, 980, 160);
  ctx.bezierCurveTo(1040, 185, 1074, 230, 1080, 285);
  // Ponta curva da asa direita
  ctx.bezierCurveTo(1085, 315, 1072, 345, 1045, 355);
  // Borda inferior da asa direita subindo em arco
  ctx.bezierCurveTo(940, 305, 820, 255, 678, 230);
  // Curva sob o pod central do velocímetro
  ctx.bezierCurveTo(645, 258, 555, 258, 522, 230);
  // Borda inferior da asa esquerda descendo em arco
  ctx.bezierCurveTo(380, 255, 260, 305, 155, 355);
  // Ponta curva da asa esquerda
  ctx.bezierCurveTo(128, 345, 115, 315, 120, 285);
  ctx.closePath();

  // Fundo em vidro fumê translúcido com gradiente vertical escuro
  const bgGrad = ctx.createLinearGradient(600, 52, 600, 355);
  bgGrad.addColorStop(0, `rgba(12, 22, 32, ${0.82 * glassOpacity})`);
  bgGrad.addColorStop(1, `rgba(4, 8, 12, ${0.94 * glassOpacity})`);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Contorno neon superior contínuo com glow brilhante
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = cfg.accentColor || '#00F0FF';
  const edgeGrad = ctx.createLinearGradient(120, 285, 1080, 285);
  edgeGrad.addColorStop(0, '#00F5D4');
  edgeGrad.addColorStop(0.35, '#00F0FF');
  edgeGrad.addColorStop(0.5, '#76FF03');
  edgeGrad.addColorStop(0.65, '#00F0FF');
  edgeGrad.addColorStop(1, '#00F5D4');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();

  // ---------------------------------------------------------------------------
  // 2. POD CENTRAL (VELOCÍMETRO + TACÔMETRO + DRS)
  // ---------------------------------------------------------------------------
  // Fundo circular do velocímetro (cx=600, cy=192, r=76)
  ctx.save();
  const podGrad = ctx.createRadialGradient(600, 192, 10, 600, 192, 76);
  podGrad.addColorStop(0, '#0f1722');
  podGrad.addColorStop(0.85, '#070b10');
  podGrad.addColorStop(1, '#020406');
  ctx.beginPath();
  ctx.arc(600, 192, 76, 0, Math.PI * 2);
  ctx.fillStyle = podGrad;
  ctx.fill();

  // Borda metálica sutil do mostrador
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  // Tacômetro de RPM (LEDs Radiais em Arco: de 150° a 30° passando pelo topo)
  const TOTAL_LEDS = 24;
  const START_DEG = 150;
  const END_DEG = 390; // 360 + 30
  const activeLeds = Math.round(clamp((f.rpm - 4000) / (f.maxRpm - 4000), 0, 1) * TOTAL_LEDS);

  for (let i = 0; i < TOTAL_LEDS; i++) {
    const deg = START_DEG + (i * (END_DEG - START_DEG) / (TOTAL_LEDS - 1));
    const rad = (deg * Math.PI) / 180;
    const r1 = 62;
    const r2 = 73;
    const x1 = 600 + Math.cos(rad) * r1;
    const y1 = 192 + Math.sin(rad) * r1;
    const x2 = 600 + Math.cos(rad) * r2;
    const y2 = 192 + Math.sin(rad) * r2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';

    if (i < activeLeds) {
      if (i >= 18) {
        // Redline: Vermelho Telemetria
        ctx.strokeStyle = '#FF1744';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#FF1744';
      } else if (i < 5) {
        // Início: Ciano Néon
        ctx.strokeStyle = '#00F0FF';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00F0FF';
      } else {
        // Médio: Verde Limão / Amarelo
        ctx.strokeStyle = '#76FF03';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#76FF03';
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pílula DRS Encaixada no Topo (x=552, y=58, w=96, h=26, r=13)
  ctx.save();
  const drsOn = f.drs === 'ON';
  const drsReady = f.drs === 'READY' || drsOn;
  if (drsOn) {
    ctx.fillStyle = '#76FF03';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#76FF03';
    drawRoundRect(ctx, 552, 58, 96, 26, 13);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = '900 italic 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#03080E';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', 600, 76);
  } else if (drsReady) {
    ctx.fillStyle = 'rgba(4, 20, 10, 0.96)';
    drawRoundRect(ctx, 552, 58, 96, 26, 13);
    ctx.fill();
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#76FF03';
    ctx.strokeStyle = '#76FF03';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = '900 italic 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#76FF03';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', 600, 76);
  } else {
    ctx.fillStyle = 'rgba(4, 12, 8, 0.9)';
    drawRoundRect(ctx, 552, 58, 96, 26, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(139, 155, 176, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '900 italic 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#8B9BB0';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', 600, 76);
  }
  ctx.restore();

  // Textos Internos do Mostrador
  ctx.font = '850 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = '#8B9BB0';
  ctx.textAlign = 'center';
  ctx.fillText('RPM', 600, 150);

  // Velocidade Digital (264)
  ctx.save();
  ctx.font = '900 italic 54px "Titillium Web", "Chakra Petch", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
  ctx.fillText(String(f.speed), 600, 200);
  ctx.restore();

  // KM/H (sem MPH)
  ctx.font = '850 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = '#8B9BB0';
  ctx.textAlign = 'center';
  ctx.fillText('KM/H', 600, 224);

  // ---------------------------------------------------------------------------
  // 3. ASA ESQUERDA: PILOTOS + DELTAS + ERS (Ângulo suave ~14°)
  // ---------------------------------------------------------------------------
  ctx.save();
  ctx.translate(535, 180);
  ctx.rotate(-0.24); // ~ -13.8 graus acompanhando perfeitamente a asa do Halo

  // Piloto 1 (11 SAINZ)
  // Escudo Ferrari Amarelo
  ctx.fillStyle = '#FFEB3B';
  drawRoundRect(ctx, -340, -34, 12, 16, 2);
  ctx.fill();

  ctx.font = '900 italic 18px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('11  SAINZ', -318, -21);

  // Delta com seta curva
  ctx.font = '900 italic 14px "Titillium Web", sans-serif';
  ctx.fillStyle = '#76FF03';
  ctx.textAlign = 'right';
  ctx.fillText('+0.241s ➔', -48, -21);

  // Linha sutil separadora entre Sainz e Russell
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-340, -4);
  ctx.lineTo(-48, -4);
  ctx.stroke();

  // Piloto 2 (12 RUSSELL)
  // Ícone Mercedes Ciano com 3 raios
  ctx.save();
  ctx.strokeStyle = '#00F5D4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-334, 14, 6, 0, Math.PI * 2);
  ctx.stroke();
  for (let s = 0; s < 3; s++) {
    const sAng = (s * 120 - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(-334, 14);
    ctx.lineTo(-334 + Math.cos(sAng) * 6, 14 + Math.sin(sAng) * 6);
    ctx.stroke();
  }
  ctx.restore();

  ctx.font = '900 italic 18px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('12  RUSSELL', -318, 19);

  // Delta com seta curva
  ctx.font = '900 italic 14px "Titillium Web", sans-serif';
  ctx.fillStyle = '#76FF03';
  ctx.textAlign = 'right';
  ctx.fillText('+0.241s ➔', -48, 19);

  // Bateria ERS Integrada na Curva Inferior
  ctx.font = '900 italic 12px "Titillium Web", sans-serif';
  ctx.fillStyle = cfg.ersColor || '#00F5D4';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(f.ers)}%`, -340, 44);

  // Linha/arco de ERS
  ctx.save();
  ctx.fillStyle = 'rgba(139, 155, 176, 0.2)';
  drawRoundRect(ctx, -300, 38, 252, 4, 2);
  ctx.fill();

  const ersWidth = Math.max(0, 252 * f.ers / 100);
  if (ersWidth > 0) {
    const eGrad = ctx.createLinearGradient(-300, 0, -48, 0);
    eGrad.addColorStop(0, '#0088FF');
    eGrad.addColorStop(1, cfg.ersColor || '#00F5D4');
    ctx.fillStyle = eGrad;
    ctx.shadowBlur = 8;
    ctx.shadowColor = cfg.ersColor || '#00F5D4';
    drawRoundRect(ctx, -300, 38, ersWidth, 4, 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();

  // ---------------------------------------------------------------------------
  // 4. ASA DIREITA: THROTTLE + BRAKE + MARCHAS (Ângulo suave ~14°)
  // ---------------------------------------------------------------------------
  ctx.save();
  ctx.translate(665, 180);
  ctx.rotate(0.24); // ~ +13.8 graus acompanhando perfeitamente a asa do Halo

  // Barra de Throttle (18 blocos segmentados em cápsulas verdes/limão)
  const TOTAL_THR_BLOCKS = 18;
  const activeThr = Math.round((f.throttle / 100) * TOTAL_THR_BLOCKS);

  for (let i = 0; i < TOTAL_THR_BLOCKS; i++) {
    const bx = 42 + i * 11;
    const by = -28;
    const bw = 8;
    const bh = 8;

    if (i < activeThr) {
      ctx.save();
      const thrRatio = i / (TOTAL_THR_BLOCKS - 1);
      const thrColor = thrRatio > 0.7 ? '#CCFF00' : thrRatio > 0.3 ? '#76FF03' : '#00F5D4';
      ctx.fillStyle = thrColor;
      ctx.shadowBlur = 8;
      ctx.shadowColor = thrColor;
      drawRoundRect(ctx, bx, by, bw, bh, 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      drawRoundRect(ctx, bx, by, bw, bh, 2);
      ctx.fill();
    }
  }

  // Rótulos de Throttle e Porcentagem
  ctx.font = '900 italic 14px "Titillium Web", sans-serif';
  ctx.fillStyle = '#76FF03';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(f.throttle)}%`, 246, -21);

  ctx.font = '900 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = cfg.throttleColor || '#76FF03';
  ctx.textAlign = 'left';
  ctx.fillText('THROTTLE', 292, -26);

  // Barra e Rótulo de Freio
  const brkWidth = (f.brake / 100) * 190;
  if (brkWidth > 0) {
    ctx.save();
    ctx.fillStyle = cfg.brakeColor || '#FF2A4D';
    ctx.shadowBlur = 8;
    ctx.shadowColor = cfg.brakeColor || '#FF2A4D';
    drawRoundRect(ctx, 42, -15, brkWidth, 4, 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.font = '900 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = cfg.brakeColor || '#FF2A4D';
  ctx.textAlign = 'left';
  ctx.fillText('BRAKE', 292, -14);

  // Régua de Marchas: N 1 2 3 4 5 6 7 8 (Sem o R e sem pular o 6)
  const gears = ['N', '1', '2', '3', '4', '5', '6', '7', '8'];
  gears.forEach((gear, idx) => {
    const gx = 46 + idx * 28;
    const gy = 18;
    const isActive = (gear === f.gear) || (gear === 'N' && f.gear === 'R');

    if (isActive) {
      // Destaque Ciano Brilhante na Marcha Ativa
      ctx.save();
      ctx.fillStyle = cfg.gearColor || '#00F5D4';
      ctx.shadowBlur = 16;
      ctx.shadowColor = cfg.gearColor || '#00F5D4';
      drawRoundRect(ctx, gx - 12, gy - 16, 24, 24, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Número escuro sobre o fundo ciano aceso
      ctx.font = '900 italic 17px "Titillium Web", sans-serif';
      ctx.fillStyle = '#031218';
      ctx.textAlign = 'center';
      ctx.fillText(gear, gx, gy + 2);
      ctx.restore();
    } else {
      ctx.font = '800 italic 16px "Titillium Web", sans-serif';
      ctx.fillStyle = '#B0BEC5';
      ctx.textAlign = 'center';
      ctx.fillText(gear, gx, gy + 2);
    }
  });

  // Traço de acento vermelho no final da régua de marchas (como na referência)
  ctx.save();
  ctx.strokeStyle = '#FF2A4D';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(300, 3);
  ctx.lineTo(308, 21);
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // ---------------------------------------------------------------------------
  // 5. TEMPERATURAS DOS PNEUS (SE HABILITADO)
  // ---------------------------------------------------------------------------
  if (cfg.showTyres && f.tyres) {
    ctx.font = '10px "Titillium Web", sans-serif';
    ctx.fillStyle = '#8B9BB0';
    ctx.textAlign = 'center';
    ctx.fillText(`FL ${f.tyres.fl}°   FR ${f.tyres.fr}°   RL ${f.tyres.rl}°   RR ${f.tyres.rr}°`, 600, 460);
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

  // Velocidade (km/h)
  const spd = Number(d.speed ?? d.m_speed ?? d.Speed ?? 0);
  const speed = Number.isFinite(spd) ? Math.max(0, Math.round(spd)) : 0;

  // Marcha (normalizar para 'R', 'N', '1'..'8')
  let g = d.gear ?? d.m_gear ?? d.Gear ?? 0;
  if (typeof g === 'number') {
    if (g === -1) g = 'R';
    else if (g === 0) g = 'N';
    else g = String(g);
  } else {
    g = String(g).toUpperCase();
  }
  const gear = ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8'].includes(g) ? g : 'N';

  // RPM e Max RPM
  const rpmVal = Number(d.engineRPM ?? d.engineRpm ?? d.m_engineRPM ?? d.rpm ?? 0);
  const rpm = Number.isFinite(rpmVal) ? Math.max(0, Math.round(rpmVal)) : 0;
  const maxRpmVal = Number(d.maxRPM ?? d.maxRpm ?? d.m_maxRPM ?? 13500);
  const maxRpm = Number.isFinite(maxRpmVal) && maxRpmVal > 0 ? maxRpmVal : 13500;

  // Acelerador (0 - 100%)
  const thrRaw = Number(d.throttle ?? d.m_throttle ?? d.Throttle ?? 0);
  const throttle = thrRaw <= 1.0 ? Math.round(thrRaw * 100) : clamp(Math.round(thrRaw), 0, 100);

  // Freio (0 - 100%)
  const brkRaw = Number(d.brake ?? d.m_brake ?? d.Brake ?? 0);
  const brake = brkRaw <= 1.0 ? Math.round(brkRaw * 100) : clamp(Math.round(brkRaw), 0, 100);

  // DRS ('OFF', 'READY', 'ON')
  const drsActive = Boolean(d.drs ?? d.m_drs ?? d.DRS ?? 0);
  const drsAllowed = Boolean(d.drsAllowed ?? d.m_drsAllowed ?? 0);
  const drs = drsActive ? 'ON' : (drsAllowed ? 'READY' : 'OFF');

  // ERS (0 - 100%)
  let ers = 0;
  const ersEnergy = d.ersStoreEnergy ?? d.m_ersStoreEnergy;
  if (ersEnergy != null) {
    ers = clamp(Math.round((Number(ersEnergy) / 4000000) * 100), 0, 100);
  } else if (d.ers != null) {
    ers = clamp(Math.round(Number(d.ers)), 0, 100);
  }

  // Pneus (opcional)
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

// Loop de animação contínuo (60-120 fps)
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

// Carregar configuração persistida inicial
const apiBase = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';
fetch(apiBase + '/api/config')
  .then(r => {
    if (!r.ok) throw Error(r.status);
    return r.json();
  })
  .then(applyConfig)
  .catch(() => {});

connect();
