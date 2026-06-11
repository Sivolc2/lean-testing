# Orbital Mechanics — The Long-Form Page

A one-page tour of the real celestial mechanics behind the simulator: how
coasting spacecraft actually get around (Hohmann transfers), the five places
where gravity balances out (Lagrange points), and the supporting ideas — launch
windows, the Oberth effect, gravity assists — that make today's spaceflight an
exercise in patience. The companion page [`EPSTEIN_DRIVE.md`](EPSTEIN_DRIVE.md)
covers what changes when you can thrust forever; the presenter cheat sheet is
[`PHYSICS.md`](PHYSICS.md).

---

## 1. Orbit = falling, forever

Everything in the Solar System is falling toward the Sun and perpetually
missing. A spacecraft with its engine off is not "parked" — it is on some conic
section (circle, ellipse, parabola, hyperbola) fixed by its position and
velocity at the moment the engine cut out. The single most useful equation for
reasoning about that motion is **vis-viva**, which relates speed to position on
any orbit of semi-major axis `a` around a body with gravitational parameter
`μ = GM`:

> **v² = μ · (2/r − 1/a)**

Every burn a chemical rocket makes is really a vis-viva edit: change `v` at the
point you are, and you've chosen a new `a` — a new ellipse. Travel between
planets is the art of choosing ellipses that intersect both your origin and
your destination. The simulator's Hohmann model is exactly this
(`LeanTesting/Hohmann.lean`), and its planetary motion is verified against a
first-principles N-body integrator (`LeanTesting/RK4.lean`,
`LeanTesting/Forces.lean`) so the periods *emerge* rather than being typed in.

---

## 2. The Hohmann transfer — today's interplanetary workhorse

Walter Hohmann worked it out in 1925: the minimum-energy two-burn path between
two circular, coplanar orbits is **half of an ellipse that just kisses both** —
perihelion at the inner orbit, aphelion at the outer one.

The recipe, going outward from radius `r₁` to radius `r₂`:

1. **Burn 1 (departure):** at `r₁`, add Δv₁ prograde. Your circular speed
   `√(μ/r₁)` becomes the transfer ellipse's perihelion speed
   `√(μ(2/r₁ − 1/a_t))`, with `a_t = (r₁ + r₂)/2`.
2. **Coast** half an orbit — months to years. No propellant, no choice: you are
   a thrown ball, and Kepler's equation dictates your schedule. The ship moves
   fastest at perihelion and crawls near aphelion (the visualizer renders this
   correctly by solving Kepler's equation each frame —
   `LeanTesting/Transfer.lean`).
3. **Burn 2 (arrival):** at `r₂`, add Δv₂ prograde to circularize, matching the
   destination's orbital speed.

Transit time is half the period of the transfer ellipse, straight from
Kepler's third law:

> **t = π · √(a_t³ / μ)**

For Earth → Mars that evaluates to **≈ 259 days**, and the simulator reproduces
it from first principles (258.8 d). Total cost, Earth → Mars, is a heliocentric
**Δv ≈ 5.6 km/s**; Earth → Jupiter is ≈ 14.4 km/s and *2.7 years*. The pattern
to notice in the catalog: going further out costs only ~2.5× more Δv but ~4×
more *time* — with chemical rockets you pay for distance mostly in calendar.

**Launch windows and the synodic period.** A Hohmann transfer only works if the
destination is at the arrival point when you get there, so departure geometry
must be exact: for Earth → Mars, Mars must lead Earth by ≈ 44°. That alignment
recurs once per **synodic period**:

> **1/T_syn = |1/T₁ − 1/T₂|**

Earth–Mars: ≈ 780 days — the famous "Mars window every 26 months." Miss it and
you wait. (The simulator deliberately idealizes this: it *places* the
destination at the arrival point so every mission connects — a perfectly timed
launch. See `destE0` phasing in `LeanTesting/Hohmann.lean`.)

**Refinements real missions use:**

- **Oberth effect.** Kinetic energy grows with v², so a burn is worth more
  energy when you're already moving fast — deep in a gravity well. This is why
  departure burns happen low over a planet, not out in interplanetary space.
- **Bi-elliptic transfers.** For radius ratios above ≈ 11.94, a three-burn
  detour *past* the target and back is cheaper than Hohmann — slower still,
  trading even more time for propellant.
- **Gravity assists.** Steal momentum from a planet by swinging behind it.
  Free Δv, at the price of years of routing (Voyager, Cassini). The entire
  discipline exists because Δv is scarce — which is precisely the premise the
  Epstein drive deletes.

---

## 3. Lagrange points — where gravity balances

Take two bodies in circular orbit — Sun and Jupiter, Sun and Earth, Earth and
Moon — and sit in the frame rotating with them. A third, much smaller object
feels three accelerations: gravity from each body plus the centrifugal term. In
1772 Joseph-Louis Lagrange showed these cancel at exactly **five points**, so a
spacecraft (or asteroid) placed there keeps station with the pair forever, with
no propellant.

```
                . L4  (60° ahead)
              .    .
            .        .
   L3 ·---SUN----·----PLANET--· L2
            .       L1.
              .    .
                · L5  (60° behind)
```

- **L1** — between the two bodies, where their pulls (minus the centrifugal
  term) balance. Sun–Earth L1 is ~1.5 million km sunward: a permanent
  solar-weather lookout (SOHO, ACE, DSCOVR live there).
- **L2** — behind the smaller body, same distance out. Both Sun and Earth pull
  the same way, so you orbit the Sun *faster* than your radius would suggest,
  pacing Earth. The cold, stable sky makes it telescope heaven: **JWST**, Gaia,
  and Planck all chose Sun–Earth L2.
- **L3** — the cartoon "counter-Earth" point opposite the Sun. Dynamically the
  least interesting and the most unstable; no mission has bothered.
- **L4 / L5** — 60° ahead of and behind the smaller body, each forming an
  equilateral triangle with the two masses.

The distance of L1/L2 from the smaller body is the **Hill radius** — the size
of the region where its gravity, rather than the Sun's, dominates:

> **r_H ≈ a · (m / 3M)^⅓**

(Earth: ~0.01 AU; Jupiter: ~0.35 AU.)

**Stability is the punchline.** L1, L2, L3 are saddle points: drift away and
you keep drifting, so spacecraft there fly "halo orbits" and spend a small
station-keeping budget (~1 m/s per year — trivial, which is why they're so
popular). L4 and L5, counterintuitively, sit at *maxima* of the effective
potential yet are **stable**: the Coriolis force curls a drifting object back,
provided the primary outweighs the secondary by at least ≈ 25:1 (true for every
Sun–planet pair and for Earth–Moon). Nature ran the experiment: over 13,000
**Trojan asteroids** sit in Jupiter's L4 ("Greek camp") and L5 ("Trojan camp"),
NASA's *Lucy* probe is touring them now, and even Earth has two known Trojans.

**The Expanse angle.** The Belt-and-Trojans economy of the show is dynamically
honest — L4/L5 swarms are exactly where loose material accumulates, and they're
listed in this repo's stretch goals as future rendering targets. An Epstein
drive devalues Lagrange points as *waypoints* (when any ship can brachistochrone
anywhere, "energetically cheap" stops matter less) but never as *real estate*:
a station at L4 or L5 holds position for free, forever, no drive required.

---

## 4. The two regimes, side by side

| | Coast regime (today) | Thrust regime (Epstein) |
|---|---|---|
| Path | Conic sections, half-ellipses | Near-straight flip-and-burn |
| Currency | Δv (km/s, scarce) | Acceleration sustained (g's) |
| Earth → Mars | 259 d, Δv 5.6 km/s | 4 d at 1 g |
| Schedule | Synodic launch windows | Leave whenever |
| Mid-course | Kepler decides | Flip at the midpoint |
| Where it lives | `Hohmann.lean`, `Transfer.lean` | `Brachistochrone.lean` |

Both regimes run side by side in every catalog entry the simulator produces —
that contrast is the whole talk.
