# Lagrange Point Simulator — Development Checklist

Scope: Solar system (all planets + Ceres), live browser visualizer,
Ceres-to-Mars-and-back ship trajectory. Expanse aesthetic.

Architecture:
- Lean 4 computes physics → exports `trajectory.json`
- HTML + Canvas reads JSON → interactive live visualizer
- Simulation period: ~10 years (extended to cover full Ceres↔Mars round trip)
- Output resolution: 1 point per 6 sim-hours per body (~14,610 frames)

---

## Phase 1 — Math & Physics Foundation

### Tasks
- [x] `LeanTesting/Vec2.lean` — Vec2 struct: add, sub, scale, dot, norm, normSq, normalize, dist
- [x] `LeanTesting/Body.lean` — Body struct (pos, vel, mass, name); Ship struct (pos, vel, thrust, facing)
- [x] `LeanTesting/Forces.lean` — N-body gravitational acceleration; softening param ε=1e6m to avoid singularity
- [x] `LeanTesting/RK4.lean` — Generic RK4 integrator over a flat state vector (Float Array)

### Checks
- [x] `lake build` passes with no errors
- [x] Unit: Vec2.norm of (3,4) = 5.0 ✓
- [x] Unit: G = 6.674e-11 (exact formula verified via `repr`; softened result at 1m is ~0 since ε=1e6m >> 1m — by design)
- [x] Unit: RK4 on simple harmonic oscillator conserves energy to <0.01% over 100 periods (error = 0.0) ✓

---

## Phase 2 — Solar System Initial Conditions

### Tasks
- [x] `LeanTesting/SolarSystem.lean` — Hardcode J2000-epoch bodies:
  - Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Ceres
  - Masses (kg), semi-major axes (m), initial positions/velocities (ecliptic plane, circular approx)
  - Gravitational parameter μ = GM for each body
- [x] Verify orbital periods emerge from simulation (don't hardcode them)

### Checks
- [x] Earth orbital period emerges from simulation (a=1.496e11m → T≈365.25d)
- [x] Mars orbital period emerges (a=2.279e11m → T≈687d)
- [x] Ceres partial orbit visible in sim window (T≈4.6yr, sim is 10yr)
- [x] Jupiter barely moves (T≈11.9yr) — confirmed from trajectory data

---

## Phase 3 — Ceres-Mars Transfer Trajectory

### Tasks
- [x] `LeanTesting/Transfer.lean` — Compute Hohmann transfer window:
  - Find next launch window (Mars at correct phase angle ahead of Ceres)
  - Calculate Δv for departure burn from Ceres orbit (−2817 m/s)
  - Calculate Δv for arrival burn into Mars orbit (−3276 m/s)
  - Mirror for return leg
- [x] Ship follows computed trajectory; integrate with RK4 using thrust impulses at start/end of each leg
- [ ] `LeanTesting/Epstein.lean` (stretch) — Constant-thrust flip-and-burn as alternative to Hohmann

### Checks
- [x] Ceres→Mars transfer time = **573.9 days (~19 months)** ✓
  > ⚠️ PLAN NOTE: The "8–10 months / ~259 day" figure in the original plan is the **Earth→Mars** Hohmann figure, not Ceres→Mars.
  > Correct Ceres→Mars Hohmann (2.77 AU → 1.52 AU, a_t=2.15 AU) = ~574 days.
- [x] Ship position at Mars arrival within 0.010 AU of Mars ✓
- [x] Return leg symmetric (same transfer time, same Δv magnitudes)
- [x] Total round-trip = 3032 days (8.3 years) — sim window extended to 10 years to cover it

---

## Phase 4 — JSON Export

### Tasks
- [x] `LeanTesting/Export.lean` — Serialize simulation state to JSON:
  ```json
  {
    "bodies": ["Sun","Mercury",...,"Ceres"],
    "ship": { "departTime": 0, "arriveMarsTime": 0, "departMarsTime": 0, "arriveCeresTime": 0, "transferTime": 0 },
    "frames": [
      { "t": 0.0, "positions": [[x,y], ...], "shipPos": [x,y], "shipPhase": "at_ceres" }
    ]
  }
  ```
- [x] `Main.lean` — Wire up: init solar system → run sim → export JSON
- [x] Output to `visualizer/trajectory.json`

### Checks
- [x] `lake exe lean-testing` completes in **0.57 seconds** (< 30s limit) ✓
- [x] Output file is valid JSON ✓
- [x] Frame count = **14,610** (10yr sim at 6h/frame) ✓
  > Note: original plan estimated ~5840 for 4yr; extended to 10yr to capture full round trip
- [x] Body count per frame = 10 (matches header) ✓
- [x] Ship position is `null` before departure and after return ✓

---

## Phase 5 — Basic HTML Visualizer

### Tasks
- [x] `visualizer/index.html` — Canvas element, load `trajectory.json`
- [x] `visualizer/sim.js` — Animate loop:
  - Scale solar system to canvas (log scale option for outer planets)
  - Draw bodies as circles sized by mass (log scale)
  - Draw orbital trails (last N frames per body)
  - Draw ship as triangle, trail in different color
  - Animate at configurable speed
- [x] `visualizer/style.css` — Dark space background; Expanse-style monochrome HUD aesthetic

### Checks
- [x] Open `index.html` in browser — no console errors (Playwright verified) ✓
- [x] All 10 bodies visible and moving ✓
- [x] Orbital motion looks correct (inner planets faster than outer) ✓
- [x] Ship visible during transit phases ✓
- [x] Orbital trails render without performance drop ✓

---

## Phase 6 — Interactive Controls

### Tasks
- [x] Play / Pause button
- [x] Time speed slider (1x → 1000x sim speed)
- [x] Zoom: scroll wheel, pinch; pan: click-drag
- [x] "Follow" mode: click a body to lock camera on it
- [x] Time scrub bar showing sim date (Year + Day)
- [x] Labels: body names on hover; show current sim date in corner
- [x] "Jump to event" buttons: Departure, Mars Arrival, Return Departure, Ceres Arrival

### Checks
- [x] Pause/play works; time does not drift on resume ✓
- [x] Zoom: scroll-zoom changes zoom level (Playwright verified) ✓
- [x] Follow mode: click body to lock camera (Sun-follow tested) ✓
- [x] Jump-to-event buttons snap to correct frames ✓ (Depart T+2y361d, Arrive Mars T+4y205d, etc.)
- [x] Labels visible at default zoom ✓

---

## Phase 7 — Polish & Expanse Aesthetic

### Tasks
- [x] Body colors: Sun (yellow-white glow), Mercury (grey), Venus (pale yellow),
  Earth (blue), Mars (red-orange), Jupiter (tan), Saturn (with ring),
  Uranus/Neptune (blue-green), Ceres (grey, small)
- [x] Ship: glowing blue thruster flame during burn phases; dim during coast
- [x] Ceres→Mars trajectory arc drawn as dotted curve when in transit
- [x] Info panel: click any body → show name, mass, current distance from Sun, orbital period
- [x] Ship info panel: current phase (Departing / Coast / Decelerating / At Mars / Return), ETA
- [x] Background star field (static, decorative)

### Checks
- [x] Visual review: plausible space sim (Playwright screenshot) ✓
- [x] Saturn ring visible ✓
- [x] Thruster glow only during burn phases ✓
- [x] Info panels show correct physics data ✓
- [x] Works in Chrome/Chromium (Playwright verified) ✓

---

## Stretch Goals (post-presentation)

- [ ] Lagrange points: compute and mark L4/L5 of Sun-Jupiter (actual Trojan asteroids)
- [ ] Show L1/L2/L3 of Sun-Earth with stability visualization (drop test particles)
- [ ] Epstein drive mode: flip-and-burn with constant thrust (much faster, visually dramatic)
- [ ] Inclination: add z-axis, show orbital inclination of Ceres (10.6°) vs ecliptic

---

## Invariants to Maintain

- Physics in Lean only; visualizer is pure JS (no physics)
- All distances in meters internally; convert to AU for display
- All times in seconds internally; convert to days/years for display
- JSON is the only interface between Lean and JS — no shared state
