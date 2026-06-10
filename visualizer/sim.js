'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const AU = 1.495978707e11;
const SEC_PER_DAY = 86400;
const SEC_PER_YEAR = 365.25 * SEC_PER_DAY;

// Visual config keyed by body name (data drives the rest).
const BODY_STYLE = {
  Sun:     { color: '#ffd966', glow: '#ffcc00', r: 13 },
  Mercury: { color: '#aaaaaa', glow: '#888888', r: 4 },
  Venus:   { color: '#ffe888', glow: '#ffcc44', r: 6 },
  Earth:   { color: '#4488ff', glow: '#2266cc', r: 6 },
  Mars:    { color: '#ff5522', glow: '#cc2200', r: 5 },
  Jupiter: { color: '#d4a87a', glow: '#b08050', r: 10 },
  Saturn:  { color: '#e8d090', glow: '#c8a860', r: 9, ring: true },
  Uranus:  { color: '#80d8d8', glow: '#44aaaa', r: 7 },
  Neptune: { color: '#5566ff', glow: '#3344cc', r: 7 },
  Ceres:   { color: '#bbbbbb', glow: '#777777', r: 4 },
};
const TRAIL_LEN = 160;
const SHIP_TRAIL_LEN = 220;
const STAR_COUNT = 500;

// ── State ──────────────────────────────────────────────────────────────────
window._sim = { data: null, mission: null, displayed: {} };
let data = null;
let routes = [];           // [{from,to,label}]
let mission = null;        // current mission object
let frames = [];           // mission.frames
let frameIdx = 0;
let playing = true;
let speed = 10;
let selRoute = null;       // "From→To"
let selDrive = null;       // driveId
let zoom = 1.0;
let panX = 0, panY = 0;
let isDragging = false, dragSX = 0, dragSY = 0, dragPX = 0, dragPY = 0;
let followBody = -1;
let stars = [];
let canvas, ctx;
let trails = [], shipTrail = [];
let bodyNames = [];

// ── Init ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('simCanvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  generateStars();
  setupControls();
  loadData();
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function generateStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({ x: Math.random() * 4000 - 2000, y: Math.random() * 4000 - 2000,
                 r: Math.random() * 1.2 + 0.3, a: Math.random() * 0.6 + 0.2 });
  }
}

function loadData() {
  fetch('trajectory.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => {
      data = d;
      window._sim.data = d;
      bodyNames = d.bodies.map(b => b.name);
      buildRouteList();
      buildPickers();
      // default selection: Ceres→Saturn (the Canterbury) on Epstein 1g, else first
      const def = d.missions.find(m => m.id === 'Ceres-Saturn-ep1') || d.missions[0];
      selectMission(def);
      document.getElementById('loading').style.display = 'none';
      animate();
    })
    .catch(e => {
      document.getElementById('loading').innerHTML =
        '<span style="color:#ff5533">ERROR: ' + e.message +
        '</span><br><small>Serve this folder over HTTP (e.g. <code>npx http-server</code>) and run <code>lake exe lean-testing</code> first.</small>';
    });
}

// ── Mission selection ────────────────────────────────────────────────────────
function buildRouteList() {
  const seen = new Set();
  routes = [];
  for (const m of data.missions) {
    const key = m.from + '→' + m.to;
    if (!seen.has(key)) { seen.add(key); routes.push({ from: m.from, to: m.to, label: m.route }); }
  }
}

function buildPickers() {
  const rl = document.getElementById('route-list');
  rl.innerHTML = '';
  routes.forEach(r => {
    const key = r.from + '→' + r.to;
    const b = document.createElement('button');
    b.className = 'pick-btn route-btn';
    b.dataset.route = key;
    b.textContent = r.from + ' → ' + r.to;
    b.addEventListener('click', () => { selRoute = key; refreshMissionFromSelection(); });
    rl.appendChild(b);
  });
  const dl = document.getElementById('drive-list');
  dl.innerHTML = '';
  data.drives.forEach(d => {
    const b = document.createElement('button');
    b.className = 'pick-btn drive-btn';
    b.dataset.drive = d.id;
    b.textContent = d.label;
    b.addEventListener('click', () => { selDrive = d.id; refreshMissionFromSelection(); });
    dl.appendChild(b);
  });
}

function refreshMissionFromSelection() {
  const [from, to] = selRoute.split('→');
  const m = data.missions.find(x => x.from === from && x.to === to && x.driveId === selDrive);
  if (m) selectMission(m);
}

function selectMission(m) {
  mission = m;
  window._sim.mission = m;
  frames = m.frames;
  frameIdx = 0;
  selRoute = m.from + '→' + m.to;
  selDrive = m.driveId;
  trails = bodyNames.map(() => []);
  shipTrail = [];
  highlightPickers();
  autoFit();
  updateNumbers();
}

function highlightPickers() {
  document.querySelectorAll('.route-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.route === selRoute));
  document.querySelectorAll('.drive-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.drive === selDrive));
}

function autoFit() {
  // Fit the two endpoint orbits + ship path within the viewport.
  let maxR = 0;
  const fromIdx = bodyNames.indexOf(mission.from);
  const toIdx = bodyNames.indexOf(mission.to);
  for (const f of frames) {
    for (const idx of [fromIdx, toIdx]) {
      const p = f.positions[idx];
      maxR = Math.max(maxR, Math.hypot(p[0], p[1]));
    }
    maxR = Math.max(maxR, Math.hypot(f.shipPos[0], f.shipPos[1]));
  }
  const extentAU = maxR / AU || 1;
  const target = 0.40 * Math.min(canvas.width, canvas.height);
  zoom = target / (extentAU * 90);
  panX = 0; panY = 0;
  followBody = -1;
}

// ── World ↔ screen ────────────────────────────────────────────────────────
function worldScale() { return (zoom * 90) / AU; }
function worldToScreen(wx, wy) {
  const s = worldScale();
  return { x: canvas.width / 2 + panX + wx * s, y: canvas.height / 2 + panY + wy * s };
}
function screenToWorld(sx, sy) {
  const s = worldScale();
  return { x: (sx - canvas.width / 2 - panX) / s, y: (sy - canvas.height / 2 - panY) / s };
}

// ── Animation ────────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  if (!data || !mission) return;
  if (playing) {
    frameIdx = (frameIdx + Math.max(1, Math.round(speed))) % frames.length;
  }
  updateTrails();
  render();
  updateHUD();
}

function updateTrails() {
  const f = frames[frameIdx];
  for (let i = 0; i < bodyNames.length; i++) {
    trails[i].push({ x: f.positions[i][0], y: f.positions[i][1] });
    if (trails[i].length > TRAIL_LEN) trails[i].shift();
  }
  shipTrail.push({ x: f.shipPos[0], y: f.shipPos[1] });
  if (shipTrail.length > SHIP_TRAIL_LEN) shipTrail.shift();
}

function render() {
  const f = frames[frameIdx];
  ctx.fillStyle = '#000007';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  renderStars();

  if (followBody >= 0) {
    const bp = f.positions[followBody];
    const s = worldScale();
    panX = -(bp[0] * s); panY = -(bp[1] * s);
  }

  for (let i = 0; i < bodyNames.length; i++)
    renderTrail(trails[i], styleOf(i).color, 0.30, 1.3);
  renderShipTrail(f);

  for (let i = 0; i < bodyNames.length; i++)
    renderBody(i, f.positions[i]);
  renderShip(f);
}

function styleOf(i) { return BODY_STYLE[bodyNames[i]] || { color: '#888', glow: '#444', r: 4 }; }

function renderStars() {
  for (const s of stars) {
    const sx = (((s.x + panX * 0.05) % canvas.width) + canvas.width) % canvas.width;
    const sy = (((s.y + panY * 0.05) % canvas.height) + canvas.height) % canvas.height;
    ctx.globalAlpha = s.a; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderTrail(trail, color, baseAlpha, width) {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const p0 = worldToScreen(trail[i - 1].x, trail[i - 1].y);
    const p1 = worldToScreen(trail[i].x, trail[i].y);
    ctx.globalAlpha = baseAlpha * (i / trail.length);
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function renderShipTrail(f) {
  const burning = f.phase === 'accel' || f.phase === 'decel' || f.phase === 'flip';
  renderTrail(shipTrail, burning ? '#88ccff' : '#5577aa', 0.6, 1.8);
}

function renderBody(idx, pos) {
  const st = styleOf(idx);
  const { x, y } = worldToScreen(pos[0], pos[1]);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, st.r * 1.8);
  grad.addColorStop(0, st.color + 'cc'); grad.addColorStop(0.4, st.color + '55'); grad.addColorStop(1, st.color + '00');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, st.r * 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(x, y, st.r, 0, Math.PI * 2); ctx.fill();
  if (st.ring) {
    ctx.save(); ctx.strokeStyle = '#c8a86088'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y, st.r * 2.4, st.r * 0.7, 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // Label endpoints + Sun
  const name = bodyNames[idx];
  if (name === 'Sun' || name === mission.from || name === mission.to) {
    ctx.fillStyle = st.color + 'dd'; ctx.font = '11px "Courier New", monospace';
    ctx.fillText(name, x + st.r + 4, y - 4);
  }
}

function renderShip(f) {
  const { x, y } = worldToScreen(f.shipPos[0], f.shipPos[1]);
  const burning = f.phase === 'accel' || f.phase === 'decel' || f.phase === 'flip';
  if (burning) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 16);
    grad.addColorStop(0, 'rgba(120,190,255,0.85)');
    grad.addColorStop(0.5, 'rgba(60,110,255,0.30)');
    grad.addColorStop(1, 'rgba(0,50,255,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  }
  // heading from trail
  let angle = 0;
  if (shipTrail.length >= 2) {
    const a = shipTrail[shipTrail.length - 1], b = shipTrail[shipTrail.length - 2];
    angle = Math.atan2(a.y - b.y, a.x - b.x) - Math.PI / 2;
    // during decel the ship has flipped — point thruster forward
    if (f.phase === 'decel') angle += Math.PI;
  }
  const size = 7;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = burning ? '#aad4ff' : '#5588cc';
  ctx.strokeStyle = burning ? '#ffffff' : '#88aacc'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.6, size * 0.7);
  ctx.lineTo(-size * 0.6, size * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = burning ? '#aaddff' : '#6688aa'; ctx.font = '10px "Courier New", monospace';
  ctx.fillText('SHIP', x + 9, y - 5);
}

// ── HUD / numbers ────────────────────────────────────────────────────────────
function fmtTime(days) {
  if (days < 2) return (days * 24).toFixed(1) + ' h';
  if (days < 400) return Math.round(days) + ' days';
  return (days / 365.25).toFixed(2) + ' yr';
}

function updateNumbers() {
  const m = mission;
  document.getElementById('np-route').textContent = m.from + ' → ' + m.to;
  document.getElementById('np-drive').textContent = m.driveLabel;
  document.getElementById('np-transit').textContent = fmtTime(m.transitDays);
  document.getElementById('np-peakv').textContent = Math.round(m.peakVelKms).toLocaleString() + ' km/s';
  document.getElementById('np-accel').textContent = m.isHohmann ? 'impulsive' : m.accelG + ' g';
  document.getElementById('np-dv').textContent = m.isHohmann ? m.deltaVKms.toFixed(2) + ' km/s' : '—';

  const speedBox = document.getElementById('np-speedup-box');
  const baseNote = document.getElementById('np-baseline-note');
  if (m.isHohmann) {
    speedBox.style.display = 'none';
    baseNote.style.display = 'block';
  } else {
    speedBox.style.display = 'block';
    baseNote.style.display = 'none';
    document.getElementById('np-speedup').textContent = Math.round(m.speedupFactor) + '× faster';
  }
  window._sim.displayed = {
    route: m.from + ' → ' + m.to, drive: m.driveLabel,
    transit: fmtTime(m.transitDays), transitDays: m.transitDays,
    peakVelKms: m.peakVelKms, accelG: m.accelG, isHohmann: m.isHohmann,
    deltaVKms: m.deltaVKms, speedupFactor: m.speedupFactor,
  };
}

function updateHUD() {
  const f = frames[frameIdx];
  const elapsedDays = f.t / SEC_PER_DAY;
  document.getElementById('time-display').textContent = 'T+' + fmtTime(elapsedDays);
  const remain = mission.transitDays - elapsedDays;
  document.getElementById('eta-display').textContent = remain > 0 ? '  ETA ' + fmtTime(remain) : '  ARRIVED';
  document.getElementById('scrub-slider').max = frames.length - 1;
  document.getElementById('scrub-slider').value = frameIdx;

  const phaseEl = document.getElementById('phase-indicator');
  const labels = { accel: 'ACCELERATING ▲', flip: 'FLIP & BURN ⟲', decel: 'DECELERATING ▼', coast: 'COASTING ···' };
  phaseEl.textContent = labels[f.phase] || f.phase.toUpperCase();
  phaseEl.className = 'phase-' + f.phase;
}

// ── Controls ──────────────────────────────────────────────────────────────────
function setupControls() {
  document.getElementById('play-btn').addEventListener('click', togglePlay);
  document.getElementById('speed-slider').addEventListener('input', e => {
    speed = Math.max(1, Math.min(1000, Math.round(Math.pow(10, parseFloat(e.target.value) / 33.33))));
    document.getElementById('speed-label').textContent = speed + '×';
  });
  document.getElementById('scrub-slider').addEventListener('input', e => {
    frameIdx = parseInt(e.target.value);
    trails = bodyNames.map(() => []); shipTrail = [];
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const before = screenToWorld(e.clientX, e.clientY);
    zoom *= (e.deltaY < 0 ? 1.15 : 0.87);
    zoom = Math.max(0.01, Math.min(20000, zoom));
    const after = screenToWorld(e.clientX, e.clientY);
    const s = worldScale();
    panX += (after.x - before.x) * s; panY += (after.y - before.y) * s;
    window._sim.zoom = zoom;
  }, { passive: false });
  canvas.addEventListener('mousedown', e => { isDragging = true; dragSX = e.clientX; dragSY = e.clientY; dragPX = panX; dragPY = panY; });
  canvas.addEventListener('mousemove', e => {
    if (isDragging) { panX = dragPX + (e.clientX - dragSX); panY = dragPY + (e.clientY - dragSY); followBody = -1; }
  });
  canvas.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    if (Math.abs(e.clientX - dragSX) < 5 && Math.abs(e.clientY - dragSY) < 5) handleClick(e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseleave', () => { isDragging = false; });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'Escape') followBody = -1;
  });
}

function togglePlay() {
  playing = !playing;
  const b = document.getElementById('play-btn');
  b.textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
  b.classList.toggle('active', !playing);
}

function handleClick(sx, sy) {
  const f = frames[frameIdx];
  for (let i = 0; i < bodyNames.length; i++) {
    const { x, y } = worldToScreen(f.positions[i][0], f.positions[i][1]);
    if (Math.hypot(sx - x, sy - y) < styleOf(i).r + 8) { followBody = (followBody === i) ? -1 : i; return; }
  }
  followBody = -1;
}
