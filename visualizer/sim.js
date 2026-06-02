'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const AU = 1.495978707e11;
const SEC_PER_DAY = 86400;
const SEC_PER_YEAR = 365.25 * SEC_PER_DAY;

// Body configuration
const BODY_CONFIG = [
  { name: 'Sun',     color: '#ffffa0', glowColor: '#ffff00', radius: 14, glowRadius: 22 },
  { name: 'Mercury', color: '#aaaaaa', glowColor: '#888888', radius:  4, glowRadius:  6 },
  { name: 'Venus',   color: '#ffe888', glowColor: '#ffcc44', radius:  6, glowRadius:  8 },
  { name: 'Earth',   color: '#4488ff', glowColor: '#2266cc', radius:  6, glowRadius:  9 },
  { name: 'Mars',    color: '#ff5522', glowColor: '#cc2200', radius:  5, glowRadius:  8 },
  { name: 'Jupiter', color: '#d4a87a', glowColor: '#b08050', radius: 10, glowRadius: 13 },
  { name: 'Saturn',  color: '#e8d090', glowColor: '#c8a860', radius:  9, glowRadius: 12, hasRing: true },
  { name: 'Uranus',  color: '#80d8d8', glowColor: '#44aaaa', radius:  7, glowRadius: 10 },
  { name: 'Neptune', color: '#5566ff', glowColor: '#3344cc', radius:  7, glowRadius: 10 },
  { name: 'Ceres',   color: '#999999', glowColor: '#666666', radius:  3, glowRadius:  5 },
];

const SHIP_COLOR = '#4499ff';
const SHIP_GLOW_COLOR = '#88ccff';
const TRAIL_LENGTH = 200;
const SHIP_TRAIL_LENGTH = 300;
const STAR_COUNT = 600;

// ── State ─────────────────────────────────────────────────────────────────────
// Exposed for testing
window._simState = {};
let data = null;
let frames = [];
let frameIdx = 0;
let playing = true;
let speed = 10; // frames per animation tick
let followBody = -1; // -1 = no follow
let zoom = 1.0;
let panX = 0, panY = 0;
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let dragPanStartX = 0, dragPanStartY = 0;
let logScale = false;
let stars = [];
let canvas, ctx;
let animFrame;
let lastAnimTime = 0;
let trails = []; // trail ring-buffers per body
let shipTrail = [];
let hoveredBody = -1;
let mouseX = 0, mouseY = 0;

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('simCanvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  generateStars();
  setupEvents();
  loadData();
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function generateStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * 4000 - 2000,
      y: Math.random() * 4000 - 2000,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.6 + 0.2,
    });
  }
}

function loadData() {
  document.getElementById('loading').style.display = 'block';
  fetch('trajectory.json')
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(d => {
      data = d;
      frames = d.frames;
      // Init trails
      trails = BODY_CONFIG.map(() => []);
      shipTrail = [];
      document.getElementById('loading').style.display = 'none';
      document.getElementById('scrub-slider').max = frames.length - 1;
      setupEventButtons();
      setupInfoPanels();
      setInitialView();
      animate();
    })
    .catch(e => {
      document.getElementById('loading').innerHTML =
        '<span style="color:#ff4400">ERROR: ' + e.message + '</span><br><small>Start a local HTTP server to load trajectory.json</small>';
    });
}

function setInitialView() {
  // Default: show inner solar system, centered on Sun
  zoom = 0.8;
  panX = 0;
  panY = 0;
}

// ── World ↔ Screen ─────────────────────────────────────────────────────────────
function worldScale() {
  // Base scale: 1 AU → 90 px at zoom=1
  return (zoom * 90) / AU;
}

function worldToScreen(wx, wy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const s = worldScale();
  let sx, sy;
  if (logScale) {
    const r = Math.sqrt(wx * wx + wy * wy);
    if (r < 1e6) { sx = cx + panX; sy = cy + panY; }
    else {
      const logR = Math.log10(r / 1e9) / Math.log10(6e12 / 1e9);
      const scale = logR * 450 * zoom / r;
      sx = cx + panX + wx * scale;
      sy = cy + panY + wy * scale;
    }
  } else {
    sx = cx + panX + wx * s;
    sy = cy + panY + wy * s;
  }
  return { x: sx, y: sy };
}

function screenToWorld(sx, sy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const s = worldScale();
  return {
    x: (sx - cx - panX) / s,
    y: (sy - cy - panY) / s,
  };
}

// ── Animation ────────────────────────────────────────────────────────────────
function animate(now) {
  animFrame = requestAnimationFrame(animate);
  if (!data) return;

  if (playing) {
    const framesToAdvance = Math.max(1, Math.round(speed));
    frameIdx = (frameIdx + framesToAdvance) % frames.length;
  }

  updateTrails();
  render();
  updateHUD();
}

function updateTrails() {
  const f = frames[frameIdx];
  for (let i = 0; i < BODY_CONFIG.length; i++) {
    trails[i].push({ x: f.positions[i][0], y: f.positions[i][1] });
    if (trails[i].length > TRAIL_LENGTH) trails[i].shift();
  }
  if (f.shipPos !== null && f.shipPos !== undefined) {
    shipTrail.push({ x: f.shipPos[0], y: f.shipPos[1] });
    if (shipTrail.length > SHIP_TRAIL_LENGTH) shipTrail.shift();
  } else {
    // Clear trail when ship is not active
    if (f.shipPhase === 'at_ceres' && shipTrail.length > 0) {
      shipTrail = [];
    }
  }
}

function render() {
  const f = frames[frameIdx];
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#000008';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars (static in screen space, offset slightly by pan for parallax)
  renderStars();

  // Camera: follow mode
  if (followBody >= 0 && followBody < f.positions.length) {
    const bp = f.positions[followBody];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const s = worldScale();
    panX = -(bp[0] * s);
    panY = -(bp[1] * s);
  }

  // Orbital trails
  for (let i = 0; i < BODY_CONFIG.length; i++) {
    renderTrail(trails[i], BODY_CONFIG[i].color, 0.35, 1.5);
  }
  // Ship trail
  renderShipTrail(f);

  // Transit arc (dotted)
  renderTransitArc(f);

  // Bodies
  for (let i = 0; i < BODY_CONFIG.length; i++) {
    renderBody(i, f.positions[i], f);
  }

  // Ship
  if (f.shipPos !== null && f.shipPos !== undefined) {
    renderShip(f);
  }

  // Labels on hover
  renderLabels(f);
}

function renderStars() {
  for (const s of stars) {
    const parallaxX = s.x + panX * 0.05;
    const parallaxY = s.y + panY * 0.05;
    const sx = ((parallaxX % canvas.width) + canvas.width) % canvas.width;
    const sy = ((parallaxY % canvas.height) + canvas.height) % canvas.height;
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderTrail(trail, color, baseAlpha, width) {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const p0 = worldToScreen(trail[i-1].x, trail[i-1].y);
    const p1 = worldToScreen(trail[i].x, trail[i].y);
    const alpha = baseAlpha * (i / trail.length);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function renderShipTrail(f) {
  if (shipTrail.length < 2) return;
  const isBurning = (f.shipPhase === 'ceres_to_mars' || f.shipPhase === 'mars_to_ceres');
  const trailColor = isBurning ? '#88aaff' : '#445588';
  renderTrail(shipTrail, trailColor, 0.5, 1.5);
}

function renderTransitArc(f) {
  // Draw dotted arc showing the Hohmann ellipse during transit
  if (!data || !data.ship) return;
  const phase = f.shipPhase;
  if (phase !== 'ceres_to_mars' && phase !== 'mars_to_ceres') return;

  const ship = data.ship;
  let a_from, a_to;
  if (phase === 'ceres_to_mars') {
    a_from = 4.14e11; a_to = 2.279e11; // Ceres → Mars
  } else {
    a_from = 2.279e11; a_to = 4.14e11; // Mars → Ceres
  }
  const a_t = (a_from + a_to) / 2;

  // Draw dotted ellipse (simplified as circle at semi-major axis a_t)
  ctx.save();
  ctx.setLineDash([4, 8]);
  ctx.strokeStyle = '#334466';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;

  // The ellipse: draw approximate circle scaled
  const cx = canvas.width / 2 + panX;
  const cy = canvas.height / 2 + panY;
  if (!logScale) {
    const s = worldScale();
    const ra = a_from * s;
    const rb = a_to * s;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(ra, rb), Math.min(ra, rb), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function renderBody(idx, pos, f) {
  const cfg = BODY_CONFIG[idx];
  const { x, y } = worldToScreen(pos[0], pos[1]);

  // Glow
  const grad = ctx.createRadialGradient(x, y, 0, x, y, cfg.glowRadius);
  grad.addColorStop(0, cfg.color + 'cc');
  grad.addColorStop(0.4, cfg.color + '55');
  grad.addColorStop(1, cfg.color + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, cfg.glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Body circle
  ctx.fillStyle = cfg.color;
  ctx.beginPath();
  ctx.arc(x, y, cfg.radius, 0, Math.PI * 2);
  ctx.fill();

  // Saturn ring
  if (cfg.hasRing) {
    ctx.save();
    ctx.strokeStyle = '#c8a86088';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y, cfg.radius * 2.4, cfg.radius * 0.7, 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Label (always show for important bodies or on hover)
  const isHovered = hoveredBody === idx;
  if (isHovered || idx === 0 || idx === 3 || idx === 4 || idx === 9) {
    ctx.fillStyle = isHovered ? '#ffffff' : cfg.color + 'aa';
    ctx.font = isHovered ? 'bold 11px Courier New' : '10px Courier New';
    ctx.fillText(cfg.name, x + cfg.radius + 3, y - 3);
  }
}

function renderShip(f) {
  if (!f.shipPos) return;
  const { x, y } = worldToScreen(f.shipPos[0], f.shipPos[1]);
  const isBurning = (f.shipPhase === 'ceres_to_mars' || f.shipPhase === 'mars_to_ceres');

  // Thruster glow during burn phases
  if (isBurning) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 14);
    grad.addColorStop(0, 'rgba(100,180,255,0.8)');
    grad.addColorStop(0.5, 'rgba(50,100,255,0.3)');
    grad.addColorStop(1, 'rgba(0,50,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ship triangle
  const size = 6;
  const vx = f.shipPos[0];
  const vy = f.shipPos[1];
  let angle = Math.atan2(vy, vx) + Math.PI / 2; // point outward from sun roughly

  // Compute velocity direction from last two trail points for more accurate pointing
  if (shipTrail.length >= 2) {
    const last = shipTrail[shipTrail.length - 1];
    const prev = shipTrail[shipTrail.length - 2];
    const dvx = last.x - prev.x;
    const dvy = last.y - prev.y;
    if (dvx * dvx + dvy * dvy > 0) {
      angle = Math.atan2(dvy, dvx) - Math.PI / 2;
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = isBurning ? SHIP_GLOW_COLOR : SHIP_COLOR;
  ctx.strokeStyle = isBurning ? '#ffffff' : '#88aaff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.6, size * 0.7);
  ctx.lineTo(-size * 0.6, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.fillStyle = isBurning ? '#88ccff' : '#4466aa';
  ctx.font = '10px Courier New';
  ctx.fillText('SHIP', x + 8, y - 4);
}

function renderLabels(f) {
  if (hoveredBody < 0) return;
  // Tooltip handled separately
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD() {
  if (!frames.length) return;
  const f = frames[frameIdx];
  const t = f.t;
  const years = Math.floor(t / SEC_PER_YEAR);
  const days  = Math.floor((t % SEC_PER_YEAR) / SEC_PER_DAY);

  document.getElementById('time-display').textContent =
    `T+${years}y ${String(days).padStart(3,'0')}d`;

  document.getElementById('scrub-slider').value = frameIdx;

  // Ship panel
  const shipPanel = document.getElementById('ship-panel');
  if (f.shipPos !== null && f.shipPos !== undefined) {
    shipPanel.classList.add('visible');
    const phaseNames = {
      'at_ceres': 'AT CERES',
      'ceres_to_mars': 'CERES → MARS',
      'at_mars': 'AT MARS',
      'mars_to_ceres': 'MARS → CERES',
    };
    document.getElementById('ship-phase-display').textContent =
      phaseNames[f.shipPhase] || f.shipPhase;

    // ETA
    let etaStr = '--';
    const ship = data.ship;
    if (f.shipPhase === 'ceres_to_mars') {
      const remaining = ship.arriveMarsTime - t;
      if (remaining > 0) etaStr = Math.floor(remaining / SEC_PER_DAY) + 'd';
    } else if (f.shipPhase === 'mars_to_ceres') {
      const remaining = ship.arriveCeresTime - t;
      if (remaining > 0) etaStr = Math.floor(remaining / SEC_PER_DAY) + 'd';
    }
    document.getElementById('ship-eta').textContent = 'ETA: ' + etaStr;
  } else {
    shipPanel.classList.remove('visible');
  }

  // Follow display
  const followDisplay = document.getElementById('follow-display');
  if (followBody >= 0) {
    followDisplay.textContent = `FOLLOW: ${BODY_CONFIG[followBody].name}`;
  } else {
    followDisplay.textContent = '';
  }

  // Scale
  const auPerPx = 1 / (worldScale() * AU);
  document.getElementById('scale-display').textContent =
    `scale: ${auPerPx.toExponential(3)} AU/px | zoom: ${zoom.toFixed(3)}`;

  // Hover tooltip
  updateTooltip();
}

function updateTooltip() {
  if (!frames.length) return;
  const f = frames[frameIdx];
  const tooltip = document.getElementById('tooltip');

  if (hoveredBody >= 0) {
    const cfg = BODY_CONFIG[hoveredBody];
    const pos = f.positions[hoveredBody];
    const distAU = Math.sqrt(pos[0]*pos[0] + pos[1]*pos[1]) / AU;
    tooltip.style.display = 'block';
    tooltip.style.left = (mouseX + 15) + 'px';
    tooltip.style.top  = (mouseY - 10) + 'px';
    // Show info
    const massList = [1.989e30,3.301e23,4.867e24,5.972e24,6.417e23,1.899e27,5.685e26,8.682e25,1.024e26,9.393e20];
    const periodDays = [0,87.97,224.7,365.25,686.97,4332.6,10759.2,30688.5,60195.5,1682.0];
    const infoPanel = document.getElementById('info-panel');
    infoPanel.classList.add('visible');
    document.getElementById('info-body-name').textContent = cfg.name;
    document.getElementById('info-mass').textContent = massList[hoveredBody].toExponential(2) + ' kg';
    document.getElementById('info-dist').textContent = distAU.toFixed(3) + ' AU';
    document.getElementById('info-period').textContent = hoveredBody === 0 ? '--' : periodDays[hoveredBody].toFixed(1) + ' d';
    tooltip.textContent = cfg.name + ' (' + distAU.toFixed(2) + ' AU)';
  } else {
    tooltip.style.display = 'none';
    document.getElementById('info-panel').classList.remove('visible');
  }
}

// ── Events ─────────────────────────────────────────────────────────────────────
function setupEvents() {
  // Play/pause
  document.getElementById('play-btn').addEventListener('click', () => {
    playing = !playing;
    document.getElementById('play-btn').textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
    document.getElementById('play-btn').classList.toggle('active', !playing);
  });

  // Speed slider
  const speedSlider = document.getElementById('speed-slider');
  speedSlider.addEventListener('input', () => {
    // Logarithmic: 1x to 1000x
    const raw = parseFloat(speedSlider.value);
    speed = Math.round(Math.pow(10, raw / 33.33));
    speed = Math.max(1, Math.min(1000, speed));
    document.getElementById('speed-label').textContent = speed + 'x';
  });

  // Log scale
  document.getElementById('log-scale-btn').addEventListener('click', () => {
    logScale = !logScale;
    document.getElementById('log-scale-btn').classList.toggle('active', logScale);
  });

  // Scrub slider
  document.getElementById('scrub-slider').addEventListener('input', (e) => {
    frameIdx = parseInt(e.target.value);
    // Reset trails
    trails = BODY_CONFIG.map(() => []);
    shipTrail = [];
  });

  // Zoom with scroll wheel
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const before = screenToWorld(e.clientX, e.clientY);
    zoom *= factor;
    zoom = Math.max(0.05, Math.min(5000, zoom));
    window._simState.zoom = zoom;
    const after = screenToWorld(e.clientX, e.clientY);
    const s = worldScale();
    panX += (after.x - before.x) * s;
    panY += (after.y - before.y) * s;
  }, { passive: false });

  // Pan
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanStartX = panX;
    dragPanStartY = panY;
  });

  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (isDragging) {
      panX = dragPanStartX + (e.clientX - dragStartX);
      panY = dragPanStartY + (e.clientY - dragStartY);
      followBody = -1;
    }
    checkHover(e.clientX, e.clientY);
  });

  canvas.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    isDragging = false;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      handleClick(e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    hoveredBody = -1;
  });

  // Keyboard: space = play/pause
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      document.getElementById('play-btn').click();
    }
    if (e.code === 'Escape') {
      followBody = -1;
    }
  });
}

function checkHover(sx, sy) {
  if (!frames.length) return;
  const f = frames[frameIdx];
  hoveredBody = -1;
  let minDist = 20;
  for (let i = 0; i < BODY_CONFIG.length; i++) {
    const { x, y } = worldToScreen(f.positions[i][0], f.positions[i][1]);
    const d = Math.sqrt((sx-x)*(sx-x) + (sy-y)*(sy-y));
    const threshold = BODY_CONFIG[i].radius + 6;
    if (d < threshold && d < minDist) {
      minDist = d;
      hoveredBody = i;
    }
  }
}

function handleClick(sx, sy) {
  if (!frames.length) return;
  const f = frames[frameIdx];
  for (let i = 0; i < BODY_CONFIG.length; i++) {
    const { x, y } = worldToScreen(f.positions[i][0], f.positions[i][1]);
    const d = Math.sqrt((sx-x)*(sx-x) + (sy-y)*(sy-y));
    if (d < BODY_CONFIG[i].radius + 8) {
      followBody = (followBody === i) ? -1 : i;
      return;
    }
  }
  // Clicked empty space: unfollow
  followBody = -1;
}

function setupEventButtons() {
  if (!data || !data.ship) return;
  const ship = data.ship;

  const findFrame = (t) => {
    let closest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const diff = Math.abs(frames[i].t - t);
      if (diff < minDiff) { minDiff = diff; closest = i; }
    }
    return closest;
  };

  const jumpTo = (t) => {
    frameIdx = findFrame(t);
    trails = BODY_CONFIG.map(() => []);
    shipTrail = [];
    playing = false;
    document.getElementById('play-btn').textContent = '▶ PLAY';
    document.getElementById('play-btn').classList.add('active');
  };

  document.getElementById('btn-depart').addEventListener('click', () => jumpTo(ship.departTime));
  document.getElementById('btn-arrive-mars').addEventListener('click', () => jumpTo(ship.arriveMarsTime));
  document.getElementById('btn-depart-mars').addEventListener('click', () => jumpTo(ship.departMarsTime));
  document.getElementById('btn-arrive-ceres').addEventListener('click', () => jumpTo(ship.arriveCeresTime));
}

function setupInfoPanels() {
  // Ship panel structure built in HTML, just ensure it can be shown
}
