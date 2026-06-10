/-
  LeanTesting/Brachistochrone.lean

  The Epstein drive: a constant-thrust "flip and burn" (brachistochrone)
  trajectory. The ship accelerates at constant proper acceleration `a` to the
  midpoint, flips 180°, and decelerates the rest of the way.

  Straight-line approximation: the Sun's gravity at 1 AU (~0.006 m/s²) is tiny
  next to even a 0.3g Epstein burn (~2.94 m/s²), so we ignore it for the
  high-thrust transit and treat the path as a straight line between the
  departure point and the (moving) target's intercept point.

    t_transit = 2·√(d/a)        v_peak = √(a·d)
-/
import LeanTesting.Vec2
import LeanTesting.Orbit

namespace Brach

/-- Total transit time for a flip-and-burn over straight-line distance `d` at accel `a`. -/
def transitTime (d a : Float) : Float := 2.0 * Float.sqrt (d / a)

/-- Peak (midpoint) velocity. -/
def peakVel (d a : Float) : Float := Float.sqrt (a * d)

/-- Distance covered along the line at elapsed time τ (0 ≤ τ ≤ T); flip at T/2. -/
def distAt (a T τ : Float) : Float :=
  let half := T / 2.0
  if τ ≤ half then 0.5 * a * τ * τ
  else
    let total := a * half * half           -- = a·T²/4 = d
    total - 0.5 * a * (T - τ) * (T - τ)

/-- "accel" before the flip, "flip" at the midpoint, "decel" after. -/
def phaseAt (T τ : Float) : String :=
  let half := T / 2.0
  if Float.abs (τ - half) < (T * 0.02) then "flip"
  else if τ < half then "accel"
  else "decel"

/-- Lead the moving target: fixed-point iteration on arrival time.
    `pa` is the (fixed) departure point; `eB` the destination body. -/
partial def solveIntercept (pa : Vec2) (eB : Orbit.Elem) (a : Float) (tArr : Float) (iters : Nat) : Float :=
  match iters with
  | 0 => tArr
  | n + 1 =>
    let pb := Orbit.posAt eB tArr
    let d  := Vec2.dist pa pb
    solveIntercept pa eB a (transitTime d a) n

/-- Result of planning an Epstein hop. -/
structure Plan where
  tArrive   : Float       -- transit time (s)
  distance  : Float       -- straight-line intercept distance (m)
  peakVel   : Float       -- m/s
  depart    : Vec2        -- departure point (A at t=0)
  target    : Vec2        -- intercept point (B at arrival)
deriving Repr

/-- Plan an Epstein hop from body A to body B departing at t=0. -/
def plan (eA eB : Orbit.Elem) (a : Float) : Plan :=
  let pa := Orbit.posAt eA 0.0
  let t0 := transitTime (Vec2.dist pa (Orbit.posAt eB 0.0)) a
  let tArr := solveIntercept pa eB a t0 12
  let pb := Orbit.posAt eB tArr
  let d  := Vec2.dist pa pb
  { tArrive := tArr, distance := d, peakVel := peakVel d a, depart := pa, target := pb }

/-- Ship position at elapsed time τ along the planned hop. -/
def shipPosAt (p : Plan) (a τ : Float) : Vec2 :=
  let dir := Vec2.normalize (Vec2.sub p.target p.depart)
  Vec2.add p.depart (Vec2.scale dir (distAt a p.tArrive τ))

end Brach
