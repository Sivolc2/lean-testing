# Lagrange Point Simulator — Development Checklist

Scope: Solar system (all planets + Ceres), live browser visualizer,
Ceres-to-Mars-and-back ship trajectory. Expanse aesthetic.

Architecture:
- Lean 4 computes physics → exports `trajectory.json`
- HTML + Canvas reads JSON → interactive live visualizer
- Simulation period: ~4 years (enough for Ceres↔Mars round trip)
- Output resolution: 1 point per 6 sim-hours per body (~5700 frames)

---

## Phase 1 — Math & Physics Foundation

### Tasks
- [ ] `LeanTesting/Vec2.lean` — Vec2 struct: add, sub, scale, dot, norm, normSq, normalize, dist
- [ ] `LeanTesting/Body.lean` — Body struct (pos, vel, mass, name); Ship struct (pos, vel, thrust, facing)
- [ ] `LeanTesting/Forces.lean` — N-body gravitational acceleration; softening param ε to avoid singularity
- [ ] `LeanTesting/RK4.lean` — Generic RK4 integrator over a flat state vector (Float Array)

### Checks
- `lake build` passes with no errors
- Unit: Vec2.norm of (3,4) = 5.0
- Unit: gravity between two 1kg masses at distance 1m = G ≈ 6.674e-11 N
- Unit: RK4 on simple harmonic oscillator conserves energy to <0.01% over 100 periods

---

## Phase 2 — Solar System Initial Conditions

### Tasks
- [ ] `LeanTesting/SolarSystem.lean` — Hardcode J2000-epoch bodies:
  - Sun, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Ceres
  - Masses (kg), semi-major axes (m), initial positions/velocities (ecliptic plane, circular approx)
  - Gravitational parameter μ = GM for each body
- [ ] Verify orbital periods emerge from simulation (don't hardcode them)

### Checks
- Run sim for 1 Earth year; Earth returns within 0.5° of start → orbital period ≈ 365.25 days
- Run sim for 1 Mars year (687 days); Mars returns within 1° of start
- Ceres orbital period ≈ 4.6 years — partial orbit visible in 4-year sim
- Jupiter barely moves visibly (11.9 year period) — sanity check on scale

---

## Phase 3 — Ceres-Mars Transfer Trajectory

### Tasks
- [ ] `LeanTesting/Transfer.lean` — Compute Hohmann transfer window:
  - Find next launch window (Mars at correct phase angle ahead of Ceres)
  - Calculate Δv for departure burn from Ceres orbit
  - Calculate Δv for arrival burn into Mars orbit
  - Mirror for return leg
- [ ] Ship follows computed trajectory; integrate with RK4 using thrust impulses at start/end of each leg
- [ ] `LeanTesting/Epstein.lean` (stretch) — Constant-thrust flip-and-burn as alternative to Hohmann

### Checks
- Ceres→Mars Hohmann transfer time ≈ 8–10 months (verify against known ~259 day figure)
- Ship position at Mars arrival within 1% of Mars position
- Return leg symmetric
- Total round-trip sim time fits within 4-year simulation window

---

## Phase 4 — JSON Export

### Tasks
- [ ] `LeanTesting/Export.lean` — Serialize simulation state to JSON:
  ```json
  {
    "bodies": ["Sun","Mercury",...,"Ceres"],
    "ship": { "departTime": 0, "arriveTime": 0, "returnTime": 0 },
    "frames": [
      { "t": 0.0, "positions": [[x,y], ...], "shipPos": [x,y], "shipPhase": "transit" }
    ]
  }
  ```
- [ ] `Main.lean` — Wire up: init solar system → run sim → export JSON
- [ ] Output to `visualizer/trajectory.json`

### Checks
- `lake exe lean-testing` completes in < 30 seconds
- Output file is valid JSON (`python3 -m json.tool trajectory.json`)
- Frame count matches expected (4yr × 365d × 4frames/day = ~5840 frames)
- Body count per frame matches header body list
- Ship position is `null` before departure and after return

---

## Phase 5 — Basic HTML Visualizer

### Tasks
- [ ] `visualizer/index.html` — Canvas element, load `trajectory.json`
- [ ] `visualizer/sim.js` — Animate loop:
  - Scale solar system to canvas (log scale option for outer planets)
  - Draw bodies as circles sized by mass (log scale)
  - Draw orbital trails (last N frames per body)
  - Draw ship as triangle, trail in different color
  - Animate at configurable speed
- [ ] `visualizer/style.css` — Dark space background; Expanse-style monochrome HUD aesthetic

### Checks
- Open `index.html` in browser — no console errors
- All 10 bodies visible and moving
- Orbital motion looks correct (inner planets faster than outer)
- Ship visible during transit phases
- Orbital trails render without performance drop (target 60fps)

---

## Phase 6 — Interactive Controls

### Tasks
- [ ] Play / Pause button
- [ ] Time speed slider (1x → 1000x sim speed)
- [ ] Zoom: scroll wheel, pinch; pan: click-drag
- [ ] "Follow" mode: click a body to lock camera on it
- [ ] Time scrub bar showing sim date (Year + Day)
- [ ] Labels: body names on hover; show current sim date in corner
- [ ] "Jump to event" buttons: Departure, Mars Arrival, Return Departure, Ceres Arrival

### Checks
- Pause/play works; time does not drift on resume
- Zoom 100x in on inner solar system — Mercury visible and moving correctly
- Follow Earth: Earth stays centered, other planets orbit around it
- Jump-to-event buttons snap to correct frame
- Labels don't overlap at default zoom

---

## Phase 7 — Polish & Expanse Aesthetic

### Tasks
- [ ] Body colors: Sun (yellow-white glow), Mercury (grey), Venus (pale yellow),
  Earth (blue), Mars (red-orange), Jupiter (tan bands), Saturn (with ring),
  Uranus/Neptune (blue-green), Ceres (grey, small)
- [ ] Ship: glowing blue thruster flame during burn phases; dim during coast
- [ ] Ceres→Mars trajectory arc drawn as dotted curve when in transit
- [ ] Info panel: click any body → show name, mass, current distance from Sun, orbital period
- [ ] Ship info panel: current phase (Departing / Coast / Decelerating / At Mars / Return), ETA
- [ ] Background star field (static, decorative)

### Checks
- Visual review: looks like a plausible space sim
- Saturn ring visible at normal zoom
- Thruster glow only during burn phases (departure/arrival)
- Info panels show correct physics data (verify distance vs known AU values)
- Works in Chrome and Firefox

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
