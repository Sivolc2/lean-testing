# The Epstein Drive — Potential Values, and What They Do to the Sim

The books never spec the drive — Daniel Abraham and Ty Franck keep it
deliberately vague so the plot can't be fact-checked. But the *consequences*
shown on screen (sustained 0.3 g Belter cruises, 1 g transits, multi-g "hard
burns" on the juice) pin it down surprisingly well. This page collects
plausible parameter values, derives what they imply with nothing but the rocket
equation, and maps each number to the exact place in the Lean code where it
enters the simulator.

---

## 1. The one knob the simulator exposes: `accelG`

In this sim a drive **is** its sustained acceleration. Each entry in
[`config/missions.json`](../../config/missions.json) is just
`{ id, label, accelG }`, and the value flows:

| Step | Where | What happens |
|---|---|---|
| 1. Config | `config/missions.json` | `"accelG": 5.0` |
| 2. Parse | [`LeanTesting/Config.lean`](../../LeanTesting/Config.lean) | → `DriveSpec.accelG : Float` |
| 3. To SI | [`LeanTesting/Mission.lean:93`](../../LeanTesting/Mission.lean) | `a := drive.accelG * gEarth` (9.80665 m/s²) |
| 4. Physics | [`LeanTesting/Brachistochrone.lean:21-24`](../../LeanTesting/Brachistochrone.lean) | `t = 2·√(d/a)`, `v_peak = √(a·d)`; intercept solved at line 43 |
| 5. Export | [`LeanTesting/Export.lean`](../../LeanTesting/Export.lean) | → `visualizer/trajectory.json` (frames + headline numbers) |
| 6. Render | [`visualizer/sim.js`](../../visualizer/sim.js) | new picker button, catalog row, race-strip lane, telemetry |

So adding a drive is a one-line config edit plus `lake exe lean-testing` — no
Lean changes. The two formulas in step 4 give the scaling law worth memorizing:
**transit time ∝ 1/√a and peak velocity ∝ √a**. Doubling the burn only makes
the trip 1.41× shorter — which is why 0.3 g already gets you 80% of the drama,
and why the catalog's day-counts cluster so tightly once you're past 1 g.

## 2. Candidate acceleration settings (now in the config)

All five below are live in `config/missions.json`; numbers are the simulator's
own output (run `lake exe lean-testing` to reprint the full 25-mission catalog).

| Setting | accelG | Canon role | Earth→Mars | Ceres→Saturn | Peak v (C→S) |
|---|---|---|---|---|---|
| Chemical (Hohmann) | 0 | our world, the baseline | 259 d | 7.7 yr | 22 km/s |
| Cruise | 0.3 | Belter-friendly economy transit | 7 d | 14 d | 1,858 km/s |
| Standard | 1.0 | Earther-normal gravity underway | 4 d | 8 d | 3,394 km/s |
| Hard burn | 3.0 | strapped in, uncomfortable | 2 d | 4 d | 5,881 km/s |
| **Combat burn** *(new)* | 5.0 | juice required; crew blackout risk without it | 43.6 h | 3 d | 7,593 km/s (2.5% c) |

Settings the config *doesn't* model, and why:

- **Emergency burns (8–15 g).** Canon allows them briefly (the *Roci* pulls
  them juiced). The brachistochrone math holds fine, but sustaining them for a
  multi-day transit would kill the crew, so they're combat maneuvers, not
  missions.
- **Below ~0.05 g.** The sim's straight-line approximation assumes the drive
  dwarfs solar gravity (~0.006 m/s² at 1 AU — see the justification comment at
  the top of `Brachistochrone.lean`). At 0.05 g the ratio is only ~80× and
  trajectories would start to curve; the model would need gravity back.

## 3. What those settings imply about the drive itself

The sim only needs `a`; the drive hardware is implied. A flip-and-burn spends
propellant the whole trip, so its total Δv is **2·v_peak** — and Tsiolkovsky
(`Δv = v_e · ln R`, mass ratio `R = wet/dry`) then dictates the exhaust
velocity. Take a 250 t corvette carrying 3× its dry mass in propellant
(R = 4, ln R ≈ 1.39):

| Mission | Δv = 2·v_peak | Required v_e | Implied Isp |
|---|---|---|---|
| Earth→Mars @ 1 g | 3,424 km/s | ≈ 2,500 km/s (0.8% c) | ~250,000 s |
| Ceres→Saturn @ 1 g | 6,788 km/s | ≈ 4,900 km/s (1.6% c) | ~500,000 s |
| Ceres→Saturn @ 5 g | 15,186 km/s (5% c!) | ≈ 11,000 km/s (3.7% c) | ~1,100,000 s |

So a **potential value set for the Epstein drive**, if you want one number per
spec sheet line:

- **Exhaust velocity:** ~5,000–11,000 km/s (1.5–4% of c) — the popular fan
  estimate of ~3.7% c, derived independently from the prequel short story
  *"Drive"*, lands inside this band.
- **Specific impulse:** 0.5–1 million seconds. For scale: chemical engines
  manage ~450 s, the best flown ion thrusters ~5,000 s. This is the
  "magic" — a thousandfold leap in efficiency, *not* new physics: perfect
  D–He³ fusion converts ~0.4% of mass to energy, capping exhaust at
  √(2·0.004)·c ≈ 8.9% c. The Epstein drive sits comfortably *under* that
  ceiling. It's impossibly good engineering, not impossible physics.
- **Thrust:** at 1 g, simply weight — ~10 MN wet for our 1,000 t corvette,
  tapering to 2.5 MN as tanks drain (a real ship would throttle to hold
  constant g; the sim's constant-`a` model matches that behavior exactly).
- **Jet power:** P = ½·F·v_e ≈ **24 TW** at departure — one warship's engine
  briefly outputs more power than present-day human civilization (~19 TW).
  That's the gasp number, and why the drive plume in the visualizer is not
  exaggerating.
- **Propellant flow:** F/v_e ≈ 2 kg/s of reaction mass at full thrust.

Each row above is checkable against the live sim: the peak velocities come
straight out of `Brach.peakVel` and appear in the visualizer's telemetry panel
as **% of light speed** (fly Ceres→Saturn at 5 g and watch it cross 2.5% c at
the flip).

## 4. Caveats the sim inherits from these values

- **No relativity:** at 2.5% c, γ ≈ 1.0003 — classical mechanics is off by
  less than 0.1%, fine for a talk, noted in
  [`PHYSICS.md §5`](PHYSICS.md#5-whats-exact-whats-approximated).
- **Constant mass:** the sim holds `a` constant rather than modeling tank
  drain; since canon ships throttle to a target g, this is the *right*
  simplification, but it means the sim cannot answer "how big are the tanks?"
  — that's what §3's rocket-equation table is for.
- **Δv shown as "n/a" for Epstein missions** in the catalog: against
  thousands of km/s, the chemical-style Δv budget stops being a meaningful
  comparison axis — time is the Epstein currency.

## 5. Try it

```bash
# add/edit a drive in config/missions.json, then:
lake exe lean-testing     # regenerates visualizer/trajectory.json + prints catalog
lake exe tests            # 38 Lean assertions (counts adapt to the config)
npx playwright test       # 21 browser tests against the visualizer
./run.sh                  # serve the visualizer; press C for the catalog overlay
```
