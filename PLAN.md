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
- [x] `visualizer/docs/PHYSICS.md` — equations, approximations, validated numbers (presenter cheat sheet)
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

## Phase 8 — Teach the physics  ✅
- [x] "The math" panel (left side): live equations + this mission's actual inputs
      (brachistochrone d, a, drive-vs-Sun-gravity ratio; Hohmann aₜ, r₁, r₂, μ, Δv)
- [x] Help tooltips on equation terms and panel labels (hover any dotted term)
- [x] Tests: math panel independently reproduces the Lean transit numbers in-browser;
      tooltips exist, are substantive, and appear on hover (20 Playwright total)

## Phase 9 — Deep-dive docs + 5 g combat burn  ✅
- [x] `visualizer/docs/ORBITAL_MECHANICS.md` — full-page tour: Hohmann transfers in depth
      (vis-viva, launch windows/synodic period, Oberth, bi-elliptic, gravity
      assists) + Lagrange points (L1–L5, stability, Hill radius, Trojans, JWST)
- [x] `visualizer/docs/EPSTEIN_DRIVE.md` — candidate drive values (accel tiers, exhaust
      velocity 1.5–4% c, Isp ~10⁶ s, ~24 TW jet power via the rocket equation)
      and the config→Lean→visualizer data flow, with file links
- [x] `config/missions.json`: new **Epstein 5 g combat burn** drive
      (5 routes × 5 drives = 25 missions; Earth→Mars in 43.6 h, 2.5% c at flip)
- [x] Playwright test 21: ep5 present, fastest on every route, obeys the
      t ∝ 1/√a scaling law, telemetry crosses ~2.5% c at the flip; screenshot

## Phase 10 — Public deploy for the event  ✅
- [x] `vercel.json` — serve `visualizer/` as a static site (no install/build);
      import of `main` on Vercel deploys as-is
- [x] `visualizer/docs.html` — in-app rendered docs (Expanse-styled tabs:
      cheat sheet / orbital mechanics / Epstein drive) with vendored
      `marked.min.js` (no CDN dependency at the venue); `.md` links become tab
      switches, source links point to GitHub
- [x] Docs moved to `visualizer/docs/` so the deploy serves them (single source)
- [x] **📖 THE PHYSICS** button in the sim's top bar; presenter-flow strip
      (1 run the sim ▸ 2 numbers/equations ▸ 3 more missions, press C)
- [x] README: deployment + presentation-flow sections
- [x] Playwright test 22: docs reachable from sim, all three pages render,
      GitHub link rewriting, back-link returns to the sim; screenshot

## Status: ✅ 38 Lean tests + 22 Playwright tests green; catalog (25 missions) generates in <1 s.

## Stretch (post-talk)
- Keplerian eccentricity/inclination for planet rendering
- Round-trip missions; render Lagrange points / Trojans in the visualizer
  (covered in prose in `visualizer/docs/ORBITAL_MECHANICS.md`)
- Relativistic correction note for the highest-g burns
