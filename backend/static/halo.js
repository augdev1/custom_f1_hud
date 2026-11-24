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
  opacity: 85,
  accentColor: '#00F5D4',
  panelBg: '#080c10',
  gearColor: '#00F5D4',
  ersColor: '#00D2BE',
  throttleColor: '#66FF00',
  brakeColor: '#FF2A4D',
  showHaloBar: true,
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
function drawHUD(f, cfg) {
  ctx.clearRect(0, 0, 2400, 960);

  ctx.save();
  ctx.scale(2, 2);

  const userScale = clamp(cfg.scale || 100, 50, 150) / 100;
  if (userScale !== 1) {
    ctx.translate(600, 185);
    ctx.scale(userScale, userScale);
    ctx.translate(-600, -185);
  }

  const isEmbedded = window.location.search.includes('embedded=1');
  if (isEmbedded) {
    document.body.classList.add('embedded');
  }

  // ---------------------------------------------------------------------------
  // 0. ARCO DE FIBRA DE CARBONO DO HALO (BASE VISUAL NO MODO STANDALONE)
  // ---------------------------------------------------------------------------
  if (!isEmbedded && cfg.showHaloBar) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(95, archY(95, 22));
    for (let x = 110; x <= 1105; x += 25) {
      ctx.lineTo(x, archY(x, 22));
    }
    for (let x = 1105; x >= 95; x -= 25) {
      ctx.lineTo(x, archY(x, -44));
    }
    ctx.closePath();

    const haloGrad = ctx.createLinearGradient(600, 155, 600, 420);
    haloGrad.addColorStop(0, '#2a323b');
    haloGrad.addColorStop(0.22, '#171c22');
    haloGrad.addColorStop(0.6, '#0d1015');
    haloGrad.addColorStop(1, '#050709');
    ctx.fillStyle = haloGrad;
    ctx.fill();

    // Realce especular sutil no topo do carbono
    ctx.beginPath();
    ctx.moveTo(95, archY(95, 20));
    for (let x = 110; x <= 1105; x += 25) {
      ctx.lineTo(x, archY(x, 20));
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  const glassOpacity = clamp(cfg.opacity != null ? cfg.opacity : 85, 0, 100) / 100;
  const accent = cfg.accentColor || '#00F0FF';

  // ---------------------------------------------------------------------------
  // 1. CHASSI PRINCIPAL DO HALO HUD (BORDAS FIÉIS À REFERÊNCIA)
  // ---------------------------------------------------------------------------
  ctx.beginPath();
  // Ponta inferior esquerda apoiada no arco do Halo
  ctx.moveTo(125, archY(125, 0));
  // Lateral esquerda inclinada subindo até o ombro com canto nítido
  ctx.lineTo(148, 220);
  ctx.quadraticCurveTo(150, 204, 168, 196);
  // Borda superior da asa esquerda convergindo ao pod central
  ctx.bezierCurveTo(285, 152, 415, 126, 502, 110);
  // Cúpula elevada do DRS envolvendo a pílula com folga uniforme
  ctx.bezierCurveTo(526, 104, 535, 58, 566, 54);
  ctx.quadraticCurveTo(600, 50, 634, 54);
  ctx.bezierCurveTo(665, 58, 674, 104, 698, 110);
  // Borda superior da asa direita descendo suavemente
  ctx.bezierCurveTo(785, 126, 915, 152, 1032, 196);
  ctx.quadraticCurveTo(1050, 204, 1052, 220);
  // Lateral direita inclinada descendo até o arco do Halo
  ctx.lineTo(1075, archY(1075, 0));

  // Borda inferior direita acompanhando a curvatura exata do Halo
  for (let x = 1060; x >= 685; x -= 25) {
    ctx.lineTo(x, archY(x, 0));
  }
  // Curva suave sob o mostrador circular central
  ctx.bezierCurveTo(654, 256, 546, 256, 515, archY(515, 0));
  // Borda inferior esquerda acompanhando a curvatura exata do Halo
  for (let x = 500; x >= 125; x -= 25) {
    ctx.lineTo(x, archY(x, 0));
  }
  ctx.closePath();

  // Preenchimento vidro fumê escuro translúcido
  const bgGrad = ctx.createLinearGradient(600, 52, 600, 360);
  bgGrad.addColorStop(0, `rgba(10, 22, 32, ${0.80 * glassOpacity})`);
  bgGrad.addColorStop(0.55, `rgba(6, 14, 22, ${0.86 * glassOpacity})`);
  bgGrad.addColorStop(1, `rgba(4, 9, 14, ${0.92 * glassOpacity})`);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Borda neon ciano externa contínua com gradiente e glow
  ctx.save();
  ctx.shadowBlur = 16;
  ctx.shadowColor = accent;
  const edgeGrad = ctx.createLinearGradient(125, 340, 1075, 340);
  edgeGrad.addColorStop(0, 'rgba(0, 245, 212, 0.35)');
  edgeGrad.addColorStop(0.08, '#00F0FF');
  edgeGrad.addColorStop(0.5, accent);
  edgeGrad.addColorStop(0.92, '#00F0FF');
  edgeGrad.addColorStop(1, 'rgba(0, 245, 212, 0.35)');
  ctx.strokeStyle = edgeGrad;
  ctx.lineWidth = 2.0;
  ctx.stroke();
  ctx.restore();

  // Linha divisória interna ciano brilhante na asa esquerda (Sainz / Russell)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(148, archY(148, 56));
  for (let x = 165; x <= 512; x += 20) {
    ctx.lineTo(x, archY(x, 56));
  }
  ctx.strokeStyle = '#00E5FF';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#00E5FF';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // ---------------------------------------------------------------------------
  // 2. POD CENTRAL (DRS + TACÔMETRO + VELOCÍMETRO)
  // ---------------------------------------------------------------------------
  const POD_CX = 600;
  const POD_CY = 178;

  // Fundo circular escuro do mostrador
  ctx.save();
  const podGrad = ctx.createRadialGradient(POD_CX, POD_CY, 12, POD_CX, POD_CY, 74);
  podGrad.addColorStop(0, 'rgba(14, 22, 32, 0.94)');
  podGrad.addColorStop(0.82, 'rgba(6, 10, 16, 0.96)');
  podGrad.addColorStop(1, 'rgba(3, 6, 10, 0.4)');
  ctx.beginPath();
  ctx.arc(POD_CX, POD_CY, 74, 0, Math.PI * 2);
  ctx.fillStyle = podGrad;
  ctx.fill();
  ctx.restore();

  // Tacômetro de RPM em arco (138° até 332° = de ~7h30 até ~2h00 como na referência)
  const TOTAL_LEDS = 22;
  const START_DEG = 138;
  const END_DEG = 336;
  const activeLeds = Math.round(clamp((f.rpm - 4000) / (f.maxRpm - 4000), 0, 1) * TOTAL_LEDS);

  for (let i = 0; i < TOTAL_LEDS; i++) {
    const deg = START_DEG + (i * (END_DEG - START_DEG) / (TOTAL_LEDS - 1));
    const rad = (deg * Math.PI) / 180;
    const r1 = 56;
    const r2 = 70;
    const x1 = POD_CX + Math.cos(rad) * r1;
    const y1 = POD_CY + Math.sin(rad) * r1;
    const x2 = POD_CX + Math.cos(rad) * r2;
    const y2 = POD_CY + Math.sin(rad) * r2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 5.4;
    ctx.lineCap = 'butt';

    if (i < activeLeds) {
      if (i >= 17) {
        ctx.strokeStyle = '#FF2200';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#FF2200';
      } else if (i < 5) {
        ctx.strokeStyle = '#00F5D4';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00F5D4';
      } else {
        ctx.strokeStyle = i >= 14 ? '#CCFF00' : '#55FF00';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#66FF00';
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();
    }
    ctx.restore();
  }

  // Anel interno fino branco/cinza ao redor da velocidade
  ctx.save();
  ctx.beginPath();
  ctx.arc(POD_CX, POD_CY, 49, (125 * Math.PI) / 180, (320 * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.0;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(POD_CX, POD_CY, 49, (-40 * Math.PI) / 180, (70 * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Pequeno ponteiro branco no topo direito do anel interno (~1h)
  const tickAng = (-36 * Math.PI) / 180;
  ctx.beginPath();
  ctx.moveTo(POD_CX + Math.cos(tickAng) * 45, POD_CY + Math.sin(tickAng) * 45);
  ctx.lineTo(POD_CX + Math.cos(tickAng) * 53, POD_CY + Math.sin(tickAng) * 53);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  // Pílula DRS Encaixada na Cúpula (fundo verde escuro translúcido + borda verde néon)
  ctx.save();
  const drsOn = f.drs === 'ON';
  const drsReady = f.drs === 'READY' || drsOn;
  if (drsOn) {
    ctx.fillStyle = 'rgba(10, 52, 22, 0.92)';
    drawRoundRect(ctx, 556, 63, 88, 26, 13);
    ctx.fill();
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#39FF14';
    ctx.strokeStyle = '#39FF14';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.font = '800 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#55FF33';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', POD_CX, 81);
  } else if (drsReady) {
    ctx.fillStyle = 'rgba(6, 28, 14, 0.9)';
    drawRoundRect(ctx, 556, 63, 88, 26, 13);
    ctx.fill();
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00E676';
    ctx.strokeStyle = '#00E676';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = '800 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#00E676';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', POD_CX, 81);
  } else {
    ctx.fillStyle = 'rgba(8, 14, 18, 0.85)';
    drawRoundRect(ctx, 556, 63, 88, 26, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(139, 155, 176, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '800 15px "Titillium Web", sans-serif';
    ctx.fillStyle = '#8B9BB0';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', POD_CX, 81);
  }
  ctx.restore();

  // Textos internos do Velocímetro
  ctx.font = '700 11px "Titillium Web", sans-serif';
  ctx.fillStyle = '#A8B8C8';
  ctx.textAlign = 'center';
  ctx.fillText('RPM', POD_CX, 146);

  ctx.save();
  ctx.font = '900 44px "Chakra Petch", "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
  ctx.fillText(String(f.speed), POD_CX, 190);
  ctx.restore();

  ctx.font = '700 11px "Titillium Web", sans-serif';
  ctx.fillStyle = '#A8B8C8';
  ctx.textAlign = 'center';
  ctx.fillText('KM/H', POD_CX, 211);

  // ---------------------------------------------------------------------------
  // 3. ASA ESQUERDA: PILOTOS + DELTAS + ERS (POSICIONADOS NA CURVA DO HALO)
  // ---------------------------------------------------------------------------
  // Linha 1 (Topo): 11 SAINZ
  ctx.save();
  const sX = 188;
  ctx.translate(sX, archY(sX, 74));
  ctx.rotate(archAngle(265));
  drawFerrariShield(ctx, 0, -13, 13, 16);
  ctx.font = '800 italic 17px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('11  SAINZ', 22, 0);
  ctx.restore();

  // Delta Sainz
  ctx.save();
  const sdX = 435;
  ctx.translate(sdX, archY(sdX, 72));
  ctx.rotate(archAngle(sdX));
  ctx.font = '800 italic 14px "Titillium Web", sans-serif';
  ctx.fillStyle = '#76FF03';
  ctx.textAlign = 'right';
  ctx.fillText('+0.241s', -4, 0);
  drawDeltaArrow(ctx, 4, -5, '#76FF03');
  ctx.restore();

  // Linha 2 (Meio): 12 RUSSELL
  ctx.save();
  const rX = 198;
  ctx.translate(rX, archY(rX, 32));
  ctx.rotate(archAngle(280));
  // Ícone Mercedes 3 raios
  ctx.strokeStyle = '#00F5D4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(6, -5, 6, 0, Math.PI * 2);
  ctx.stroke();
  for (let s = 0; s < 3; s++) {
    const sAng = ((s * 120 - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(6, -5);
    ctx.lineTo(6 + Math.cos(sAng) * 6, -5 + Math.sin(sAng) * 6);
    ctx.stroke();
  }
  ctx.font = '800 italic 17px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('12  RUSSELL', 22, 0);
  ctx.restore();

  // Delta Russell
  ctx.save();
  const rdX = 435;
  ctx.translate(rdX, archY(rdX, 34));
  ctx.rotate(archAngle(rdX));
  ctx.font = '800 italic 14px "Titillium Web", sans-serif';
  ctx.fillStyle = '#76FF03';
  ctx.textAlign = 'right';
  ctx.fillText('+0.241s', -4, 0);
  drawDeltaArrow(ctx, 4, -5, '#76FF03');
  ctx.restore();

  // ERS (78% + arco de energia na borda inferior)
  ctx.save();
  const ersTextX = 148;
  ctx.translate(ersTextX, archY(ersTextX, 11));
  ctx.rotate(archAngle(180));
  ctx.font = '800 italic 11px "Titillium Web", sans-serif';
  ctx.fillStyle = cfg.ersColor || '#00F5D4';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(f.ers)}%`, 0, 0);
  ctx.restore();

  // Barra curva de ERS ao longo do arco inferior esquerdo
  const ersStartX = 195;
  const ersMaxEndX = 425;
  const ersCurrEndX = ersStartX + ((ersMaxEndX - ersStartX) * clamp(f.ers, 0, 100)) / 100;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ersStartX, archY(ersStartX, 11));
  for (let x = ersStartX; x <= ersMaxEndX; x += 15) {
    ctx.lineTo(x, archY(x, 11));
  }
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.18)';
  ctx.lineWidth = 2.4;
  ctx.stroke();

  if (f.ers > 1) {
    ctx.beginPath();
    ctx.moveTo(ersStartX, archY(ersStartX, 11));
    for (let x = ersStartX; x <= ersCurrEndX; x += 10) {
      ctx.lineTo(x, archY(x, 11));
    }
    const eGrad = ctx.createLinearGradient(ersStartX, 0, ersMaxEndX, 0);
    eGrad.addColorStop(0, cfg.ersColor || '#00F5D4');
    eGrad.addColorStop(1, '#66FF00');
    ctx.strokeStyle = eGrad;
    ctx.shadowBlur = 8;
    ctx.shadowColor = cfg.ersColor || '#00F5D4';
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }
  ctx.restore();

  // ---------------------------------------------------------------------------
  // 4. ASA DIREITA: THROTTLE CURVO + BRAKE + RÉGUA DE MARCHAS CURVA
  // ---------------------------------------------------------------------------
  // Barra segmentada curva de Throttle (20 cápsulas no topo da asa direita)
  const TOTAL_THR_BLOCKS = 20;
  const activeThr = Math.round((f.throttle / 100) * TOTAL_THR_BLOCKS);
  const thrStartX = 716;
  const thrStep = 10.5;

  for (let i = 0; i < TOTAL_THR_BLOCKS; i++) {
    const bx = thrStartX + i * thrStep;
    const by = archY(bx, 66);
    const ang = archAngle(bx);

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);

    if (i < activeThr) {
      const thrColor = i < 4 ? '#00F5D4' : (i > 14 ? '#AAFF00' : (cfg.throttleColor || '#66FF00'));
      ctx.fillStyle = thrColor;
      ctx.shadowBlur = 8;
      ctx.shadowColor = thrColor;
      drawRoundRect(ctx, -3.5, -7, 7, 13, 1.8);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      drawRoundRect(ctx, -3.5, -7, 7, 13, 1.8);
      ctx.fill();
    }
    ctx.restore();
  }

  // Porcentagem 100% + Rótulos THROTTLE / BRAKE curvados
  ctx.save();
  const pctX = 948;
  ctx.translate(pctX, archY(pctX, 64));
  ctx.rotate(archAngle(pctX));
  ctx.fillStyle = 'rgba(102, 255, 0, 0.22)';
  drawRoundRect(ctx, -22, -10, 44, 17, 4);
  ctx.fill();
  ctx.font = '900 12px "Titillium Web", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(f.throttle)}%`, 0, 3);
  ctx.restore();

  ctx.save();
  const lblX = 1010;
  ctx.translate(lblX, archY(lblX, 65));
  ctx.rotate(archAngle(lblX));
  ctx.font = '800 10px "Titillium Web", sans-serif';
  ctx.fillStyle = cfg.throttleColor || '#66FF00';
  ctx.textAlign = 'center';
  ctx.fillText('THROTTLE', 0, -2);
  ctx.fillStyle = cfg.brakeColor || '#FF2A4D';
  ctx.fillText('BRAKE', 0, 12);
  ctx.restore();

  // Barra curva vermelha de Brake quando pressionado
  if (f.brake > 0) {
    const brkEndX = thrStartX + ((TOTAL_THR_BLOCKS * thrStep) * clamp(f.brake, 0, 100)) / 100;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(thrStartX, archY(thrStartX, 50));
    for (let x = thrStartX; x <= brkEndX; x += 10) {
      ctx.lineTo(x, archY(x, 50));
    }
    ctx.strokeStyle = cfg.brakeColor || '#FF2A4D';
    ctx.shadowBlur = 10;
    ctx.shadowColor = cfg.brakeColor || '#FF2A4D';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.restore();
  }

  // Régua de Marchas curva na base da asa direita: N 1 2 3 4 5 6 7 8
  const gears = ['N', '1', '2', '3', '4', '5', '6', '7', '8'];
  const gearStartX = 716;
  const gearStep = 31;

  gears.forEach((gear, idx) => {
    const gx = gearStartX + idx * gearStep;
    const gy = archY(gx, 22);
    const ang = archAngle(gx) * 0.9;
    const isActive = (gear === f.gear) || (gear === 'N' && f.gear === 'R');

    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(ang);

    if (isActive) {
      ctx.fillStyle = cfg.gearColor || '#00F5D4';
      ctx.shadowBlur = 16;
      ctx.shadowColor = cfg.gearColor || '#00F5D4';
      drawRoundRect(ctx, -12, -13, 24, 24, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = '900 17px "Titillium Web", sans-serif';
      ctx.fillStyle = '#031218';
      ctx.textAlign = 'center';
      ctx.fillText(gear, 0, 5);
    } else {
      ctx.font = '700 16px "Titillium Web", sans-serif';
      ctx.fillStyle = '#B8C6D4';
      ctx.textAlign = 'center';
      ctx.fillText(gear, 0, 5);
    }
    ctx.restore();
  });

  // Borda vermelha curva acompanhando o final da régua de marchas (5 6 7 8 ┐)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(860, archY(860, 40));
  for (let x = 875; x <= 1005; x += 15) {
    ctx.lineTo(x, archY(x, 40));
  }
  ctx.quadraticCurveTo(1022, archY(1022, 40), 1028, archY(1028, 8));
  ctx.strokeStyle = cfg.brakeColor || '#FF2A4D';
  ctx.shadowBlur = 8;
  ctx.shadowColor = cfg.brakeColor || '#FF2A4D';
  ctx.lineWidth = 2.0;
  ctx.stroke();
  ctx.restore();

  // ---------------------------------------------------------------------------
  // 5. TEMPERATURAS DOS PNEUS (SE HABILITADO)
  // ---------------------------------------------------------------------------
  if (cfg.showTyres && f.tyres) {
    ctx.font = '10px "Titillium Web", sans-serif';
    ctx.fillStyle = '#8B9BB0';
    ctx.textAlign = 'center';
    ctx.fillText(`FL ${f.tyres.fl}°   FR ${f.tyres.fr}°   RL ${f.tyres.rl}°   RR ${f.tyres.rr}°`, 600, 456);
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
