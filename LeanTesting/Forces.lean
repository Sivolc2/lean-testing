import LeanTesting.Vec2
import LeanTesting.Body

def gConst : Float := 6.674e-11
def softeningEps : Float := 1.0e6  -- 1000 km softening

def gravAccel (pos : Vec2) (other : Body) : Vec2 :=
  let r := Vec2.sub other.pos pos
  let rSq := Vec2.normSq r + softeningEps * softeningEps
  let rMag := Float.sqrt rSq
  let f := gConst * other.mass / (rSq * rMag)
  Vec2.scale r f

def totalAccel (bodies : Array Body) (idx : Nat) : Vec2 :=
  let body := bodies[idx]!
  bodies.foldl (init := ⟨0.0, 0.0⟩) fun acc other =>
    if other.name == body.name then acc
    else Vec2.add acc (gravAccel body.pos other)
