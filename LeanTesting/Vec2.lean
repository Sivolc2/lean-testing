structure Vec2 where
  x : Float
  y : Float
  deriving Repr, Inhabited

namespace Vec2
def add (a b : Vec2) : Vec2 := ⟨a.x + b.x, a.y + b.y⟩
def sub (a b : Vec2) : Vec2 := ⟨a.x - b.x, a.y - b.y⟩
def scale (v : Vec2) (s : Float) : Vec2 := ⟨v.x * s, v.y * s⟩
def dot (a b : Vec2) : Float := a.x * b.x + a.y * b.y
def normSq (v : Vec2) : Float := v.x * v.x + v.y * v.y
def norm (v : Vec2) : Float := Float.sqrt (normSq v)
def normalize (v : Vec2) : Vec2 :=
  let n := norm v
  if n == 0.0 then ⟨0.0, 0.0⟩ else scale v (1.0 / n)
def dist (a b : Vec2) : Float := norm (sub b a)
end Vec2
