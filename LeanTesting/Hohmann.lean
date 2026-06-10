/-
  LeanTesting/Hohmann.lean

  Generalized Hohmann transfer (today's chemical-rocket technology): two
  impulsive burns and a long coast along a transfer ellipse. Transit time and
  Δv reuse `computeTransfer` from Transfer.lean. For rendering we sample the
  transfer half-ellipse at uniform time using Kepler's equation, and phase the
  destination body so it is met at arrival (an idealized launch window).
-/
import LeanTesting.Vec2
import LeanTesting.Orbit
import LeanTesting.Transfer

namespace Hohmann

/-- Solve Kepler's equation M = E − e·sin E for E via Newton iteration. -/
partial def solveKepler (M e E : Float) (iters : Nat) : Float :=
  match iters with
  | 0 => E
  | n + 1 =>
    let f  := E - e * Float.sin E - M
    let f' := 1.0 - e * Float.cos E
    solveKepler M e (E - f / f') n

/-- Geometry of a transfer between two circular orbits. -/
structure Geo where
  aFrom    : Float
  aTo      : Float
  aT       : Float       -- transfer semi-major axis
  ecc      : Float       -- transfer eccentricity
  tTransit : Float       -- half-period of the transfer ellipse (s)
  outward  : Bool        -- true if going to a larger orbit
  phiPeri  : Float       -- world angle of the transfer ellipse periapsis (rad)
deriving Repr

/-- Build transfer geometry. `phiA` is the heliocentric angle of the departure
    body at departure (t=0); the apse line is aligned to it. -/
def geo (aFrom aTo phiA : Float) : Geo :=
  let aT  := (aFrom + aTo) / 2.0
  let rp  := min aFrom aTo
  let ra  := max aFrom aTo
  let ecc := (ra - rp) / (ra + rp)
  let tT  := piVal * Float.sqrt (aT * aT * aT / gmSun)
  let outward := aTo > aFrom
  -- Outward: departure is at periapsis (angle φA). Inward: departure is at
  -- apoapsis, so periapsis is on the opposite side (φA + π).
  let phiPeri := if outward then phiA else phiA + piVal
  { aFrom, aTo, aT, ecc, tTransit := tT, outward, phiPeri }

/-- Mean motion (rad/s) of the transfer ellipse. -/
def meanMotion (g : Geo) : Float := Float.sqrt (gmSun / (g.aT * g.aT * g.aT))

/-- Ship position at elapsed transit time τ ∈ [0, tTransit]. -/
def shipPosAt (g : Geo) (τ : Float) : Vec2 :=
  let n := meanMotion g
  -- Mean anomaly measured from periapsis. Outward goes periapsis→apoapsis
  -- (M: 0→π); inward goes apoapsis→periapsis (M: π→2π).
  let m := if g.outward then n * τ else piVal + n * τ
  let e := g.ecc
  let bigE := solveKepler m e m 12
  let r := g.aT * (1.0 - e * Float.cos bigE)
  -- true anomaly
  let nu := Float.atan2 (Float.sqrt (1.0 - e * e) * Float.sin bigE) (Float.cos bigE - e)
  let ang := g.phiPeri + nu
  ⟨r * Float.cos ang, r * Float.sin ang⟩

/-- The destination longitude θ₀ override so body B is met at arrival.
    Arrival point is diametrically opposite the departure (angle φA + π). -/
def destTheta0 (phiA omegaB tTransit : Float) : Float :=
  phiA + piVal - omegaB * tTransit

/-- Plan a Hohmann transfer A→B departing at t=0. Returns geometry plus the
    transfer parameters (Δv, transit time). -/
structure Plan where
  g        : Geo
  params   : TransferParams
  destE0   : Float       -- phased θ₀ for the destination body
deriving Repr

def plan (eA eB : Orbit.Elem) : Plan :=
  let phiA := Orbit.angleAt eA 0.0
  let g := geo eA.a eB.a phiA
  let params := computeTransfer eA.a eB.a
  let destE0 := destTheta0 phiA (Orbit.omegaOf eB.a) g.tTransit
  { g, params, destE0 }

/-- Total Δv magnitude (m/s) for the transfer. -/
def totalDeltaV (p : Plan) : Float :=
  Float.abs p.params.dv_depart + Float.abs p.params.dv_arrive

end Hohmann
