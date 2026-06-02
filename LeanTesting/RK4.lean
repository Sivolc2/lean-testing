import LeanTesting.Vec2
import LeanTesting.Body
import LeanTesting.Forces

-- Flat state: [x0,y0,vx0,vy0, x1,y1,vx1,vy1, ...]
-- template bodies provide mass/name; state provides positions/velocities

def stateFromBodies (bodies : Array Body) : Array Float :=
  bodies.foldl (init := #[]) fun acc b =>
    acc ++ #[b.pos.x, b.pos.y, b.vel.x, b.vel.y]

def bodiesFromState (template : Array Body) (state : Array Float) : Array Body :=
  template.mapIdx fun i b =>
    let base := i * 4
    { b with
      pos := ⟨state[base]!, state[base + 1]!⟩
      vel := ⟨state[base + 2]!, state[base + 3]!⟩ }

def derivative (template : Array Body) (state : Array Float) : Array Float :=
  let bodies := bodiesFromState template state
  let n := template.size
  Id.run do
    let mut deriv := Array.replicate (n * 4) (0.0 : Float)
    for i in [:n] do
      let base := i * 4
      let body := bodies[i]!
      -- dx/dt = vx, dy/dt = vy
      deriv := deriv.set! base body.vel.x
      deriv := deriv.set! (base + 1) body.vel.y
      -- dvx/dt = ax, dvy/dt = ay
      let accel := totalAccel bodies i
      deriv := deriv.set! (base + 2) accel.x
      deriv := deriv.set! (base + 3) accel.y
    return deriv

def stateAdd (a b : Array Float) : Array Float :=
  Array.zipWith (· + ·) a b

def stateScale (s : Float) (a : Array Float) : Array Float :=
  a.map (· * s)

def rk4Step (template : Array Body) (dt : Float) (state : Array Float) : Array Float :=
  let f := derivative template
  let k1 := f state
  let k2 := f (stateAdd state (stateScale (dt / 2) k1))
  let k3 := f (stateAdd state (stateScale (dt / 2) k2))
  let k4 := f (stateAdd state (stateScale dt k3))
  stateAdd state (stateScale (dt / 6) (stateAdd (stateAdd k1 (stateScale 2.0 k2)) (stateAdd (stateScale 2.0 k3) k4)))
