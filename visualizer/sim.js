'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const AU = 1.495978707e11;
const SEC_PER_DAY = 86400;
const C_KMS = 299792.458;          // speed of light, km/s
const GM_SUN = 1.32712440018e20;   // Sun's gravitational parameter μ, m³/s²
const G_EARTH = 9.80665;           // m/s² per "g"

// Visual config keyed by body name (data drives the rest).
const BODY_STYLE = {
  Sun:     { color: '#ffd966', glow: '#ffcc00', r: 14 },
  Mercury: { color: '#aaaaaa', glow: '#888888', r: 3.5 },
  Venus:   { color: '#ffe888', glow: '#ffcc44', r: 5.5 },
  Earth:   { color: '#4488ff', glow: '#2266cc', r: 6 },
  Mars:    { color: '#ff5522', glow: '#cc2200', r: 5 },
  Jupiter: { color: '#d4a87a', glow: '#b08050', r: 10 },
  Saturn:  { color: '#e8d090', glow: '#c8a860', r: 9, ring: true },
  Uranus:  { color: '#80d8d8', glow: '#44aaaa', r: 7 },
  Neptune: { color: '#5566ff', glow: '#3344cc', r: 7 },
  Ceres:   { color: '#c8b8a8', glow: '#887766', r: 4 },
};
const PHASE_COLORS = { accel: '#ffb060', flip: '#ff66cc', decel: '#66c0ff', coast: '#48685c' };
const PHASE_LABELS = { accel: 'ACCELERATING ▲', flip: 'FLIP & BURN ⟲', decel: 'DECELERATING ▼', coast: 'COASTING ···' };

// ── State ──────────────────────────────────────────────────────────────────
window._sim = { data: null, mission: null, displayed: {} };
let data = null;
let routes = [];            // [{from,to,label}]
let mission = null;         // current mission object
let frames = [];            // mission.frames
let frameFloat = 0;         // fractional playback position
let frameIdx = 0;
let playing = true;
let speed = 10;             // frames advanced per second of wall clock
let lastTick = null;
let selRoute = null;        // "From→To"
let selDrive = null;        // driveId
let zoom = 1.0;
let panX = 0, panY = 0;
let isDragging = false, dragSX = 0, dragSY = 0, dragPX = 0, dragPY = 0;
let followTarget = null;    // null | {type:'body', idx} | {type:'ship'}
let scrubbing = false;
let starsFar = [], starsNear = [];
let canvas, ctx;
let bodyNames = [];
let cumDist = [];           // cumulative ship path length per frame (m)
let totalDist = 0;
let chemBaseline = null;    // chemical mission for the current route

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
  const mk = (n, rMin, rMax) => Array.from({ length: n }, () => ({
    x: Math.random() * 4000 - 2000, y: Math.random() * 4000 - 2000,
    r: rMin + Math.random() * (rMax - rMin),
    a: Math.random() * 0.5 + 0.18,
    tw: Math.random() * Math.PI * 2,          // twinkle phase
    ts: 0.4 + Math.random() * 1.6,            // twinkle speed
  }));
  starsFar = mk(320, 0.3, 0.9);
  starsNear = mk(180, 0.7, 1.6);
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
      buildCatalog();
      // default selection: Ceres→Saturn (the Canterbury) on Epstein 1g, else first
      const def = d.missions.find(m => m.id === 'Ceres-Saturn-ep1') || d.missions[0];
      selectMission(def);
      document.getElementById('loading').style.display = 'none';
      requestAnimationFrame(animate);
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
    b.innerHTML = '<span class="drive-label">' + d.label + '</span>' +
                  '<span class="drive-transit" data-drive-id="' + d.id + '"></span>';
    b.addEventListener('click', () => { selDrive = d.id; refreshMissionFromSelection(); });
    dl.appendChild(b);
  });
}

function updateDriveTimes() {
  if (!selRoute) return;
  const [from, to] = selRoute.split('→');
  document.querySelectorAll('.drive-transit').forEach(el => {
    const m = data.missions.find(x => x.from === from && x.to === to && x.driveId === el.dataset.driveId);
    el.textContent = m ? fmtTime(m.transitDays) : '';
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
  frameFloat = 0;
  frameIdx = 0;
  selRoute = m.from + '→' + m.to;
  selDrive = m.driveId;
  chemBaseline = data.missions.find(x => x.from === m.from && x.to === m.to && x.isHohmann) || null;

  // Precompute the ship's cumulative path length (for the telemetry panel).
  cumDist = new Array(frames.length);
  cumDist[0] = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].shipPos, b = frames[i].shipPos;
    cumDist[i] = cumDist[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  totalDist = cumDist[frames.length - 1];

  const scrub = document.getElementById('scrub-slider');
  scrub.max = frames.length - 1;
  scrub.value = 0;

  highlightPickers();
  updateDriveTimes();
  highlightCatalogRow();
  buildPhaseStrip();
  updateRaceLabels();
  autoFit();
  updateNumbers();
  updatePhysicsPanel();
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
  const target = 0.38 * Math.min(canvas.width, canvas.height);
  zoom = target / (extentAU * 90);
  panX = 0; panY = 0;
  followTarget = null;
  updateFollowBtn();
}

// ── Phase strip (colored timeline under the scrub bar) ──────────────────────
function buildPhaseStrip() {
  const el = document.getElementById('phase-strip');
  const n = frames.length;
  const stops = [];
  let cur = frames[0].phase, start = 0;
  for (let i = 1; i <= n; i++) {
    const ph = i < n ? frames[i].phase : null;
    if (ph !== cur) {
      const a = (start / n * 100).toFixed(2), b = (i / n * 100).toFixed(2);
      const c = PHASE_COLORS[cur] || '#48685c';
      stops.push(`${c} ${a}%`, `${c} ${b}%`);
      cur = ph; start = i;
    }
  }
  el.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
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
function animate(now) {
  requestAnimationFrame(animate);
  if (!data || !mission) return;
  const dt = lastTick == null ? 0 : Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  if (playing && !scrubbing) {
    frameFloat = (frameFloat + speed * dt) % frames.length;
    frameIdx = Math.floor(frameFloat);
  }
  render(now / 1000);
  updateHUD();
}

function render(tSec) {
  const f = frames[frameIdx];
  ctx.fillStyle = '#01030a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  renderStars(tSec);

  if (followTarget) {
    const s = worldScale();
    const p = followTarget.type === 'ship' ? f.shipPos : f.positions[followTarget.idx];
    panX = -(p[0] * s); panY = -(p[1] * s);
  }

  renderOrbitGuides();
  renderFuturePath();
  renderTraveledPath();
  renderRouteMarkers();

  for (let i = 0; i < bodyNames.length; i++)
    renderBody(i, f.positions[i]);
  renderShip(f);
}

function styleOf(i) { return BODY_STYLE[bodyNames[i]] || { color: '#888', glow: '#444', r: 4 }; }

function renderStars(tSec) {
  const layer = (stars, parallax) => {
    for (const s of stars) {
      const sx = (((s.x + panX * parallax) % canvas.width) + canvas.width) % canvas.width;
      const sy = (((s.y + panY * parallax) % canvas.height) + canvas.height) % canvas.height;
      ctx.globalAlpha = s.a * (0.72 + 0.28 * Math.sin(tSec * s.ts + s.tw));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI * 2); ctx.fill();
    }
  };
  layer(starsFar, 0.03);
  layer(starsNear, 0.08);
  ctx.globalAlpha = 1;
}

// Faint circular guides for every body's orbit (the model is circular orbits).
function renderOrbitGuides() {
  const s = worldScale();
  const c = worldToScreen(0, 0);
  for (const b of data.bodies) {
    if (!b.aAU) continue;
    const st = BODY_STYLE[b.name] || { color: '#888888' };
    const isEndpoint = b.name === mission.from || b.name === mission.to;
    ctx.beginPath();
    ctx.arc(c.x, c.y, b.aAU * AU * s, 0, Math.PI * 2);
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = isEndpoint ? 0.30 : 0.10;
    ctx.lineWidth = isEndpoint ? 1.2 : 0.8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// The not-yet-flown remainder of the trajectory, as a faint dashed line.
function renderFuturePath() {
  if (frameIdx >= frames.length - 1) return;
  ctx.save();
  ctx.setLineDash([4, 7]);
  ctx.strokeStyle = '#7fb8d8';
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const p0 = worldToScreen(frames[frameIdx].shipPos[0], frames[frameIdx].shipPos[1]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = frameIdx + 1; i < frames.length; i++) {
    const p = worldToScreen(frames[i].shipPos[0], frames[i].shipPos[1]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

// The flown part of the trajectory, colored by drive phase, fading with age.
function renderTraveledPath() {
  if (frameIdx < 1) return;
  for (let i = 1; i <= frameIdx; i++) {
    const a = frames[i - 1].shipPos, b = frames[i].shipPos;
    const p0 = worldToScreen(a[0], a[1]);
    const p1 = worldToScreen(b[0], b[1]);
    ctx.strokeStyle = PHASE_COLORS[frames[i].phase] || '#5577aa';
    ctx.globalAlpha = 0.22 + 0.55 * (i / frameIdx);
    ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Departure ring, arrival/intercept ring, and the flip point (Epstein only).
function renderRouteMarkers() {
  const dep = frames[0].shipPos;
  const arr = frames[frames.length - 1].shipPos;
  const toColor = (BODY_STYLE[mission.to] || { color: '#9fd8c8' }).color;

  let p = worldToScreen(dep[0], dep[1]);
  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = '#9fd8c8'; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.stroke();

  p = worldToScreen(arr[0], arr[1]);
  ctx.strokeStyle = toColor; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = toColor; ctx.globalAlpha = 0.75;
  ctx.font = '9px "Courier New", monospace';
  ctx.fillText('INTERCEPT', p.x + 15, p.y + 17);
  ctx.restore();

  if (!mission.isHohmann) {
    // flip point: the frame nearest mid-transit
    const mid = frames[Math.floor(frames.length / 2)].shipPos;
    p = worldToScreen(mid[0], mid[1]);
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = PHASE_COLORS.flip; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.3;
    ctx.strokeRect(-4, -4, 8, 8);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = PHASE_COLORS.flip;
    ctx.font = '9px "Courier New", monospace';
    ctx.fillText('FLIP', 8, -8);
    ctx.restore();
  }
}

function renderBody(idx, pos) {
  const st = styleOf(idx);
  const name = bodyNames[idx];
  const { x, y } = worldToScreen(pos[0], pos[1]);
  const isSun = name === 'Sun';
  const glowR = st.r * (isSun ? 3.2 : 1.9);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  grad.addColorStop(0, st.color + (isSun ? 'ee' : 'cc'));
  grad.addColorStop(0.4, st.color + '44');
  grad.addColorStop(1, st.color + '00');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(x, y, st.r, 0, Math.PI * 2); ctx.fill();
  if (st.ring) {
    ctx.save(); ctx.strokeStyle = '#c8a86088'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y, st.r * 2.4, st.r * 0.7, 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  // Labels: endpoints + Sun always and bright; others small, and only when
  // they aren't crowded against the Sun at the current zoom.
  const isEndpoint = name === mission.from || name === mission.to;
  if (isEndpoint || isSun) {
    ctx.fillStyle = st.color + 'ee';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillText(name, x + st.r + 5, y - 5);
  } else {
    const sun = worldToScreen(0, 0);
    if (Math.hypot(x - sun.x, y - sun.y) > 55) {
      ctx.fillStyle = st.color + '77';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText(name, x + st.r + 4, y - 4);
    }
  }
}

function renderShip(f) {
  const { x, y } = worldToScreen(f.shipPos[0], f.shipPos[1]);
  const burning = f.phase === 'accel' || f.phase === 'decel' || f.phase === 'flip';
  const flipped = f.phase === 'decel';

  // Heading from the local velocity vector (frame-to-frame difference).
  const i0 = Math.min(frameIdx, frames.length - 2);
  const a = frames[i0].shipPos, b = frames[i0 + 1].shipPos;
  let velAngle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  if (b[0] === a[0] && b[1] === a[1]) velAngle = 0;
  const heading = velAngle + (flipped ? Math.PI : 0);   // nose direction

  if (burning) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 17);
    grad.addColorStop(0, 'rgba(130,200,255,0.75)');
    grad.addColorStop(0.5, 'rgba(60,110,255,0.25)');
    grad.addColorStop(1, 'rgba(0,50,255,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill();
  }

  const size = 7;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading + Math.PI / 2);   // triangle nose points local -y

  // Exhaust plume out the back (during burns), flickering slightly.
  if (burning) {
    const flick = 1 + 0.25 * Math.sin(performance.now() / 42);
    const plume = size * 2.6 * flick;
    const pg = ctx.createLinearGradient(0, size, 0, size + plume);
    pg.addColorStop(0, 'rgba(170,220,255,0.95)');
    pg.addColorStop(0.4, 'rgba(90,150,255,0.55)');
    pg.addColorStop(1, 'rgba(40,80,255,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(-size * 0.38, size * 0.7);
    ctx.lineTo(size * 0.38, size * 0.7);
    ctx.lineTo(0, size * 0.7 + plume);
    ctx.closePath(); ctx.fill();
  }

  ctx.fillStyle = burning ? '#cfe8ff' : '#5588cc';
  ctx.strokeStyle = burning ? '#ffffff' : '#88aacc'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.6, size * 0.7);
  ctx.lineTo(-size * 0.6, size * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = burning ? '#aaddff' : '#6688aa';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillText('SHIP', x + 10, y + 16);   // below-right, clear of planet labels
}

// ── HUD / numbers ────────────────────────────────────────────────────────────
function fmtTime(days) {
  if (days < 2) return (days * 24).toFixed(1) + ' h';
  if (days < 400) return Math.round(days) + ' days';
  return (days / 365.25).toFixed(2) + ' yr';
}

function fmtAU(meters) {
  const au = meters / AU;
  return (au < 0.1 ? au.toFixed(3) : au.toFixed(2)) + ' AU';
}

// Ship speed at frame i (km/s) via central difference over the exported frames.
function velAtFrame(i) {
  const j0 = Math.max(0, i - 1), j1 = Math.min(frames.length - 1, i + 1);
  const a = frames[j0].shipPos, b = frames[j1].shipPos;
  const dt = frames[j1].t - frames[j0].t;
  if (dt <= 0) return 0;
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / dt / 1000;
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

// ── "The math" panel ─────────────────────────────────────────────────────────
function eqRow(lhs, val, tip, kind) {
  const row = document.createElement('div');
  row.className = 'eq-row ' + (kind || 'eq-sub');
  const l = document.createElement('span');
  l.className = 'eq-lhs' + (tip ? ' tip tip-above' : '');
  if (tip) l.setAttribute('data-tip', tip);
  l.textContent = lhs;
  const v = document.createElement('span');
  v.className = 'eq-val';
  v.textContent = val;
  row.append(l, v);
  return row;
}

function eqTitle(text) {
  const el = document.createElement('div');
  el.className = 'eq-title';
  el.textContent = text;
  return el;
}

// Rebuild the equations panel from the selected mission's actual inputs, so
// the audience can see exactly which numbers produce the headline result.
function updatePhysicsPanel() {
  const box = document.getElementById('physics-eqs');
  box.innerHTML = '';
  const m = mission;

  if (!m.isHohmann) {
    const a = m.accelG * G_EARTH;
    const dep = frames[0].shipPos, arr = frames[frames.length - 1].shipPos;
    const d = Math.hypot(arr[0] - dep[0], arr[1] - dep[1]);   // straight-line burn
    const tDays = 2 * Math.sqrt(d / a) / SEC_PER_DAY;
    const vPk = Math.sqrt(a * d) / 1000;
    const sunG = GM_SUN / (AU * AU);                          // Sun's pull at 1 AU
    const ratio = a / sunG;

    box.append(
      eqTitle('FLIP-AND-BURN (BRACHISTOCHRONE)'),
      eqRow('t = 2·√(d/a)', fmtTime(tDays),
        'Accelerate over the first half of d, decelerate over the second. Time grows with the square root of distance — 4× farther is only 2× longer, which is why the outer planets stop being remote.',
        'eq-main'),
      eqRow('v_pk = √(a·d)', Math.round(vPk).toLocaleString() + ' km/s',
        'Peak speed, reached at the flip point in the middle of the trip. Longer trips mean higher peaks — distance buys speed.',
        'eq-main'),
      eqRow('d', (d / AU).toFixed(2) + ' AU',
        'Straight-line distance to the intercept point — where ' + m.to + ' WILL be on arrival day, not where it is now. The sim solves for that lead like a hunter aiming ahead of a duck.'),
      eqRow('a', a.toFixed(2) + ' m/s²  (' + m.accelG + ' g)',
        'Constant proper acceleration, the drive’s one defining number. It doubles as the crew’s artificial gravity: burn at 1 g and the deck feels like Earth.'),
      eqRow('a / g_sun(1 AU)', '≈ ' + Math.round(ratio).toLocaleString() + '×',
        'The drive’s acceleration vs. the Sun’s pull at Earth’s distance (' + sunG.toFixed(4) + ' m/s²). The drive dominates so completely that the trajectory is effectively a straight line — gravity is a rounding error.'),
    );
    window._sim.physics = { model: 'brachistochrone', tDays, dAU: d / AU, aMs2: a, vPkKms: vPk, sunRatio: ratio };
  } else {
    const r1 = data.bodies.find(b => b.name === m.from).aAU;
    const r2 = data.bodies.find(b => b.name === m.to).aAU;
    const aT = (r1 + r2) / 2;
    const tDays = Math.PI * Math.sqrt(Math.pow(aT * AU, 3) / GM_SUN) / SEC_PER_DAY;

    box.append(
      eqTitle('HOHMANN TRANSFER (HALF-ELLIPSE)'),
      eqRow('t = π·√(aₜ³/μ)', fmtTime(tDays),
        'Half the orbital period of the transfer ellipse — Kepler’s third law. No engine running, no shortcuts: the Sun’s gravity alone sets the schedule.',
        'eq-main'),
      eqRow('aₜ = (r₁+r₂)/2', aT.toFixed(2) + ' AU',
        'Semi-major axis of the transfer ellipse, which just kisses the departure orbit on one end and the arrival orbit on the other. Bigger ellipse, longer period, slower trip.',
        'eq-main'),
      eqRow('r₁  (' + m.from + ')', r1.toFixed(2) + ' AU',
        'Radius of the departure orbit. 1 AU = the Earth–Sun distance ≈ 150 million km.'),
      eqRow('r₂  (' + m.to + ')', r2.toFixed(2) + ' AU',
        'Radius of the destination orbit. The transfer only connects when the planets line up — miss the launch window and you wait months or years for the next one.'),
      eqRow('μ = GM_sun', '1.327e20 m³/s²',
        'The Sun’s gravitational parameter: its mass times the gravitational constant. The only physical constant in the transit-time formula — everything else is geometry.'),
      eqRow('Δv (vis-viva)', m.deltaVKms.toFixed(2) + ' km/s',
        'Two impulsive burns: one to stretch the circular orbit into the ellipse, one to circularize on arrival, each sized by the vis-viva equation. Fuel cost grows exponentially with Δv, so chemical missions fight for every m/s.'),
    );
    window._sim.physics = { model: 'hohmann', tDays, aT_AU: aT, r1AU: r1, r2AU: r2, dvKms: m.deltaVKms };
  }
}

function updateTelemetry() {
  const v = velAtFrame(frameIdx);
  document.getElementById('np-curv').textContent =
    (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) + ' km/s';
  const pc = v / C_KMS * 100;
  document.getElementById('np-lightc').textContent =
    pc >= 0.01 ? pc.toFixed(2) + '% c' : '<0.01% c';
  document.getElementById('np-dist').textContent = fmtAU(cumDist[frameIdx]);
  document.getElementById('np-remain').textContent = fmtAU(Math.max(0, totalDist - cumDist[frameIdx]));
  window._sim.telemetry = { velKms: v, pctC: pc, traveledM: cumDist[frameIdx], totalM: totalDist };
}

// ── Same-clock race strip ────────────────────────────────────────────────────
function updateRaceLabels() {
  const strip = document.getElementById('race-strip');
  if (mission.isHohmann || !chemBaseline) {
    strip.style.display = 'none';
    return;
  }
  strip.style.display = 'flex';
  document.getElementById('race-ship-name').textContent =
    ('THIS SHIP (' + mission.driveLabel + ')').toUpperCase();
}

function updateRace() {
  if (mission.isHohmann || !chemBaseline) return;
  const elapsed = frames[frameIdx].t / SEC_PER_DAY;
  const epP = Math.min(1, elapsed / mission.transitDays);
  const chP = Math.min(1, elapsed / chemBaseline.transitDays);
  document.getElementById('race-ep-fill').style.width = (epP * 100).toFixed(1) + '%';
  document.getElementById('race-chem-fill').style.width = Math.max(chP * 100, 0.4).toFixed(2) + '%';
  document.getElementById('race-ep-pct').textContent =
    epP >= 1 ? 'ARRIVED · ' + fmtTime(mission.transitDays) : (epP * 100).toFixed(0) + '%';
  document.getElementById('race-chem-pct').textContent =
    (chP * 100).toFixed(1) + '% of ' + fmtTime(chemBaseline.transitDays);
}

function updateHUD() {
  const f = frames[frameIdx];
  const elapsedDays = f.t / SEC_PER_DAY;
  document.getElementById('time-display').textContent = 'T+' + fmtTime(elapsedDays);
  const remain = mission.transitDays - elapsedDays;
  document.getElementById('eta-display').textContent =
    remain > 0.005 * mission.transitDays ? '  ETA ' + fmtTime(remain) : '  ARRIVED';

  if (playing && !scrubbing)
    document.getElementById('scrub-slider').value = frameIdx;

  const phaseEl = document.getElementById('phase-indicator');
  phaseEl.textContent = PHASE_LABELS[f.phase] || f.phase.toUpperCase();
  phaseEl.className = 'phase-' + f.phase;

  updateTelemetry();
  updateRace();
}

// ── Catalog overlay ──────────────────────────────────────────────────────────
function buildCatalog() {
  const tbody = document.getElementById('catalog-body');
  tbody.innerHTML = '';
  let lastRoute = null;
  for (const m of data.missions) {
    if (m.route !== lastRoute) {
      lastRoute = m.route;
      const tr = document.createElement('tr');
      tr.className = 'route-head';
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = m.from + ' → ' + m.to;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    const tr = document.createElement('tr');
    tr.dataset.missionId = m.id;
    const cells = [
      '', m.driveLabel, fmtTime(m.transitDays),
      Math.round(m.peakVelKms).toLocaleString() + ' km/s',
      m.isHohmann ? 'Δv ' + m.deltaVKms.toFixed(2) + ' km/s' : m.accelG + ' g',
      m.isHohmann ? 'baseline' : Math.round(m.speedupFactor) + '× faster',
    ];
    cells.forEach((c, i) => {
      const td = document.createElement('td');
      td.textContent = c;
      if (i === 2) td.className = 'cat-transit';
      if (i === 5 && !m.isHohmann) td.className = 'cat-speedup';
      tr.appendChild(td);
    });
    tr.addEventListener('click', () => { selectMission(m); toggleCatalog(false); });
    tbody.appendChild(tr);
  }
}

function highlightCatalogRow() {
  document.querySelectorAll('#catalog-body tr[data-mission-id]').forEach(tr =>
    tr.classList.toggle('current', tr.dataset.missionId === mission.id));
}

function toggleCatalog(show) {
  const ov = document.getElementById('catalog-overlay');
  const showing = show !== undefined ? show : ov.hidden;
  ov.hidden = !showing;
  document.getElementById('catalog-btn').classList.toggle('active', showing);
  if (showing) highlightCatalogRow();
}

// ── Follow / view helpers ────────────────────────────────────────────────────
function toggleFollowShip() {
  followTarget = (followTarget && followTarget.type === 'ship') ? null : { type: 'ship' };
  updateFollowBtn();
}

function updateFollowBtn() {
  document.getElementById('follow-btn').classList.toggle(
    'active', !!(followTarget && followTarget.type === 'ship'));
}

// ── Controls ──────────────────────────────────────────────────────────────────
function setupControls() {
  document.getElementById('play-btn').addEventListener('click', togglePlay);
  document.getElementById('follow-btn').addEventListener('click', toggleFollowShip);
  document.getElementById('reset-view-btn').addEventListener('click', () => { if (mission) autoFit(); });
  document.getElementById('catalog-btn').addEventListener('click', () => toggleCatalog());
  document.getElementById('catalog-overlay').addEventListener('click', e => {
    if (e.target.id === 'catalog-overlay') toggleCatalog(false);
  });

  const applySpeed = v => {
    speed = Math.max(1, Math.min(1000, Math.round(Math.pow(10, v / 33.33))));
    document.getElementById('speed-label').textContent = speed + '×';
  };
  const speedSlider = document.getElementById('speed-slider');
  speedSlider.addEventListener('input', e => applySpeed(parseFloat(e.target.value)));
  applySpeed(parseFloat(speedSlider.value));

  const scrub = document.getElementById('scrub-slider');
  scrub.addEventListener('input', e => {
    frameIdx = parseInt(e.target.value);
    frameFloat = frameIdx;
  });
  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  window.addEventListener('pointerup', () => { scrubbing = false; });

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
    if (isDragging) {
      panX = dragPX + (e.clientX - dragSX); panY = dragPY + (e.clientY - dragSY);
      followTarget = null; updateFollowBtn();
    }
  });
  canvas.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    if (Math.abs(e.clientX - dragSX) < 5 && Math.abs(e.clientY - dragSY) < 5) handleClick(e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseleave', () => { isDragging = false; });

  window.addEventListener('keydown', e => {
    if (!mission) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        if (playing) togglePlay();
        const step = (e.shiftKey ? 10 : 1) * (e.code === 'ArrowRight' ? 1 : -1);
        frameIdx = (frameIdx + step + frames.length) % frames.length;
        frameFloat = frameIdx;
        document.getElementById('scrub-slider').value = frameIdx;
        break;
      }
      case 'KeyF': toggleFollowShip(); break;
      case 'KeyR': autoFit(); break;
      case 'KeyC': toggleCatalog(); break;
      case 'Escape':
        if (!document.getElementById('catalog-overlay').hidden) toggleCatalog(false);
        else { followTarget = null; updateFollowBtn(); }
        break;
    }
  });
}

function togglePlay() {
  playing = !playing;
  const b = document.getElementById('play-btn');
  b.textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
  b.classList.toggle('paused', !playing);
}

function handleClick(sx, sy) {
  const f = frames[frameIdx];
  // ship first
  const sp = worldToScreen(f.shipPos[0], f.shipPos[1]);
  if (Math.hypot(sx - sp.x, sy - sp.y) < 14) { toggleFollowShip(); return; }
  for (let i = 0; i < bodyNames.length; i++) {
    const { x, y } = worldToScreen(f.positions[i][0], f.positions[i][1]);
    if (Math.hypot(sx - x, sy - y) < styleOf(i).r + 8) {
      followTarget = (followTarget && followTarget.type === 'body' && followTarget.idx === i)
        ? null : { type: 'body', idx: i };
      updateFollowBtn();
      return;
    }
  }
  followTarget = null;
  updateFollowBtn();
}
