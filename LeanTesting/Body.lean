import LeanTesting.Vec2

structure Body where
  name  : String
  pos   : Vec2
  vel   : Vec2
  mass  : Float
  deriving Repr, Inhabited

structure Ship where
  pos    : Vec2
  vel    : Vec2
  thrust : Float
  facing : Vec2
  active : Bool
  deriving Repr
