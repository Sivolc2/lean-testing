# The Physics Behind the Sim — Presenter Notes

Everything the visualizer shows is computed by the Lean program (`LeanTesting/`)
and validated by `lake exe tests` (38 assertions). This page is your cheat sheet
for the talk: the equations, the approximations, and the numbers to quote.

---

## 1. The one idea: constant thrust changes everything

Today's rockets burn hard for a few minutes, then **coast** for months on an
ellipse (a *Hohmann transfer*). You're a thrown ball — physics carries you the
rest of the way.

The **Epstein Drive** (The Expanse) is a fusion drive efficient enough to thrust
the *entire* trip. You **accelerate the whole way to the midpoint, flip the ship
180°, and decelerate the rest of the way** — a "flip and burn." You're never
coasting; you're always under power. That single change turns months into days.

---

## 2. Flip-and-burn (brachistochrone) math

For constant acceleration `a` over straight-line distance `d`:

| Quantity | Formula | Why |
|---|---|---|
| Transit time | **t = 2·√(d / a)** | accelerate over d/2, decelerate over d/2 |
| Peak velocity (at flip) | **v_peak = √(a · d)** | reached at the midpoint |

**Why a straight line is fair here.** The Sun's gravity at 1 AU is ~0.006 m/s².
Even a *gentle* 0.3 g Epstein burn is ~2.94 m/s² — about **500×** stronger. The
drive utterly dominates gravity, so the ship flies very nearly straight to where
the destination *will be* (we solve for that intercept point — "leading the
target"). `LeanTesting/Brachistochrone.lean`.

**The "g" is also the gravity onboard.** Burning at 1 g means the crew feels
Earth-normal gravity the whole trip, floor "down" toward the engines. Flip =
brief freefall. This is why The Expanse has no spinning habitats on warships.

---

## 3. Hohmann transfer (today's tech), for contrast

Two impulsive burns and a long coast along half an ellipse that just kisses both
orbits. Transit time is half the period of that transfer ellipse:

> **t = π · √(a_t³ / μ)**,  where a_t = (r₁ + r₂)/2 and μ = GM_sun.

We compute the Δv with the *vis-viva* equation and render the actual ellipse by
solving Kepler's equation (so the ship correctly slows down near aphelion).
`LeanTesting/Hohmann.lean`, `LeanTesting/Transfer.lean`.

Hohmann is **fuel-optimal** but **time-expensive**, and it only works during a
narrow **launch window** when the planets line up. The Epstein drive needs no
window — leave whenever you like.

---

## 4. The numbers (validated by the sim)

| Route | Chemical (Hohmann) | Epstein 1 g | Speed-up |
|---|---|---|---|
| **Earth → Mars** | **259 days**, Δv 5.6 km/s | **~4 days**, peak 1,700 km/s | **~64×** |
| **Mars → Ceres** | ~1.6 years | ~5 days | ~108× |
| **Earth → Ceres** *(the Belter run)* | ~1.3 years, Δv 11.2 km/s | ~3 days | ~124× |
| **Earth → Jupiter** | ~2.7 years | ~6 days | ~158× |
| **Ceres → Saturn** *(the Canterbury's ice run, S1E1)* | **~7.7 years** | **~8 days** | **~349×** |

At a 3 g "hard burn," Ceres→Saturn drops to **~4 days**. (The catalog prints the
full table every run; tweak `config/missions.json` and re-run to change it.)

The famous **259-day Earth→Mars** figure is a great anchor: that's a real NASA
number, and the sim reproduces it from first principles (258.8 d) — then shows
the Epstein drive doing it over a long weekend.

**On stage:** press **C** in the visualizer for this full table as an overlay
(click any row to fly that mission). The **race strip** along the bottom shows,
on the same clock, how far the chemical baseline has gotten while the Epstein
ship flies — it's the "months vs. days" argument in one glance. The **live
telemetry** panel shows the ship's current speed as a percentage of light speed
(an Epstein 3 g hard burn tops 1.9% c — a nice gasp moment).

---

## 5. What's exact, what's approximated

**Exact / first-principles**
- Newtonian gravity; orbital periods *emerge* from an N-body RK4 integrator
  (Earth's year comes out at ~364 days from the simulation, not hard-coded).
- Flip-and-burn time, peak velocity, intercept geometry.
- Hohmann transit time, Δv (vis-viva), and the Kepler-solved transfer ellipse.

**Approximated (deliberately, for speed + clarity)**
- **Planet orbits are circular and coplanar** for rendering. Real eccentricities
  are small (Mars's 0.09 is the worst); this keeps every mission generating in
  milliseconds. The N-body core is kept as the higher-fidelity reference and is
  energy-conservation tested.
- **Gravity ignored during the Epstein burn** (justified in §2).
- **No relativity.** At 3 g for a week the math gives ~6,000 km/s (~2% of light) —
  high enough that real relativistic corrections would start to matter, but we
  keep classical mechanics for clarity. Worth a one-line caveat on stage.
- **Idealized Hohmann launch window:** we place the destination at its arrival
  point so the transfer always "connects" (a perfectly-timed launch).

---

## 6. Where each piece lives

| Concept | File |
|---|---|
| Vectors, N-body gravity, RK4 | `Vec2.lean`, `Forces.lean`, `RK4.lean` |
| Circular orbit model | `Orbit.lean` |
| Epstein flip-and-burn | `Brachistochrone.lean` |
| Hohmann transfer + Kepler | `Hohmann.lean`, `Transfer.lean` |
| Drives & routes config | `Config.lean` + `config/missions.json` |
| Mission assembly | `Mission.lean` |
| JSON export | `Export.lean` → `visualizer/trajectory.json` |
| Tests (38 assertions) | `Tests.lean` |
