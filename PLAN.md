# Epstein Drive Transit Simulator — Build Checklist

Goal: a config-driven simulator + visualizer contrasting the Epstein Drive's
constant-thrust flip-and-burn against today's chemical/Hohmann transfers, for an
*Expanse*-themed talk. Routes feature the first-two-episodes trips (the
Canterbury's **Ceres↔Saturn** ice run) plus the canonical **Earth↔Mars**.

Methodology: **tests designed first, then implemented, then validated** — Lean
assertions (`lake exe tests`) and Playwright (`npx playwright test`).

> Foundation (already in the repo): N-body RK4 core, J2000 solar-system initial
> conditions, the Ceres↔Mars Hohmann transfer, and the Canvas visualizer.

---

## Phase 1 — Config & JSON  ✅
- [x] `LeanTesting/Json.lean` — hand-rolled parser (objects/arrays/strings/numbers/bools/null), scientific notation
- [x] `LeanTesting/Config.lean` — `DriveSpec` / `RouteSpec`, reads `config/missions.json`
- [x] `config/missions.json` — canon drive spread (chem, 0.3 g, 1 g, 3 g) + episode routes
- [x] Tests: float parsing (`1.234e11`, `-2.5`, junk-rejection), config parse, malformed ⇒ error

## Phase 2 — Physics  ✅
- [x] `LeanTesting/Orbit.lean` — circular analytic positions, period, ω
- [x] `LeanTesting/Brachistochrone.lean` — `t=2√(d/a)`, `v=√(ad)`, path, moving-target intercept solver
- [x] `LeanTesting/Hohmann.lean` — generalized transfer, Kepler-solved ellipse path, destination phasing
- [x] Tests: Earth→Mars **259 d**, Ceres→Mars **574 d**, Ceres→Saturn **7.7 yr**, Δv, Kepler residual, intercept convergence

## Phase 3 — Missions, export, wiring  ✅
- [x] `LeanTesting/Mission.lean` — `buildMissions` over routes × drives; transit, peak v, Δv, speed-up, frames
- [x] `LeanTesting/Export.lean` — new `trajectory.json` schema (bodies / drives / missions); summary table; N-body period validation
- [x] `Main.lean` config→missions→export; `Tests.lean` exe; lakefile `tests` target
- [x] Tests: mission count, finite/positive transits, speed-up 40–120× (E→M 1 g), export JSON round-trip

## Phase 4 — Visualizer  ✅
- [x] Mission picker (route + drive buttons), auto-fit per mission
- [x] Numbers panel: transit time, peak velocity, accel (g), Δv, **"N× faster than chemical"** badge
- [x] Drive-phase indicator (ACCEL / FLIP / DECEL / COAST), thruster glow, ship trail
- [x] Play/pause, speed, scrub, zoom/pan/follow, star field, Expanse aesthetic
- [x] `window._sim` exposed for test assertions

## Phase 5 — Frontend tests  ✅
- [x] `tests/missions.spec.js` (11 tests) — picker populated, **numbers match JSON**, chemical-vs-Epstein, ship animates, phase indicator, controls
- [x] `package.json` (+ `@playwright/test`); screenshot review

## Phase 6 — Docs  ✅
- [x] `docs/PHYSICS.md` — equations, approximations, validated numbers (presenter cheat sheet)
- [x] `README.md`, this checklist

---

## Phase 7 — Presentation revamp  ✅
- [x] Earth→Ceres "Belter run" route (5 routes × 4 drives = 20 missions)
- [x] Orbit guides for every planet; phase-colored flown path + dashed future path
- [x] Flip-point + intercept markers; drive plume; label de-overlap
- [x] Live telemetry: current velocity, **% of light speed**, distance traveled/remaining
- [x] **Same-clock race strip** (chemical vs Epstein on one clock) — was a stretch goal
- [x] Catalog overlay (press **C**) — the full numbers table in-app, click a row to fly it
- [x] Keyboard shortcuts (Space, ←/→, F follow ship, R reset view, C catalog)
- [x] Phase timeline under the scrub bar; parallax + twinkle starfield; vignette
- [x] Frame-rate-independent playback; scrub no longer fights the animation loop
- [x] 7 new Playwright tests (18 total), incl. telemetry-vs-frames cross-check

## Status: ✅ 38 Lean tests + 18 Playwright tests green; catalog generates in <1 s.

## Stretch (post-talk)
- Keplerian eccentricity/inclination for planet rendering
- Round-trip missions; Lagrange points / Trojans
- Relativistic correction note for the highest-g burns
