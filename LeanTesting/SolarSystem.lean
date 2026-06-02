import LeanTesting.Vec2
import LeanTesting.Body

-- Solar system initial conditions at approximate J2000 epoch
-- All distances in meters, velocities in m/s, masses in kg

def gmSun : Float := 1.32712440018e20  -- m^3/s^2
def auMeters : Float := 1.495978707e11  -- 1 AU in meters

def piVal : Float := 3.14159265358979323846

def degToRad (d : Float) : Float := d * piVal / 180.0

-- Build a body from orbital elements (circular orbit approximation)
-- a: semi-major axis in meters, L: mean longitude in degrees
def makeBody (name : String) (mass : Float) (a : Float) (lDeg : Float) : Body :=
  let l := degToRad lDeg
  let pos : Vec2 := ⟨a * Float.cos l, a * Float.sin l⟩
  let vel : Vec2 :=
    if a == 0.0 then ⟨0.0, 0.0⟩
    else
      let vc := Float.sqrt (gmSun / a)
      ⟨-(vc * Float.sin l), vc * Float.cos l⟩
  { name := name, pos := pos, vel := vel, mass := mass }

def initialBodies : Array Body :=
  #[ makeBody "Sun"     1.989e30  0.0          0.0
   , makeBody "Mercury" 3.301e23  5.791e10     252.25
   , makeBody "Venus"   4.867e24  1.082e11     181.98
   , makeBody "Earth"   5.972e24  1.496e11     100.46
   , makeBody "Mars"    6.417e23  2.279e11     355.45
   , makeBody "Jupiter" 1.899e27  7.783e11     34.40
   , makeBody "Saturn"  5.685e26  1.432e12     49.94
   , makeBody "Uranus"  8.682e25  2.867e12     313.23
   , makeBody "Neptune" 1.024e26  4.515e12     304.88
   , makeBody "Ceres"   9.393e20  4.140e11     95.0
   ]

-- Body indices for easy reference
def sunIdx     : Nat := 0
def mercuryIdx : Nat := 1
def venusIdx   : Nat := 2
def earthIdx   : Nat := 3
def marsIdx    : Nat := 4
def jupiterIdx : Nat := 5
def saturnIdx  : Nat := 6
def uranusIdx  : Nat := 7
def neptuneIdx : Nat := 8
def ceresIdx   : Nat := 9

-- Semi-major axes (meters) for reference
def a_Mercury : Float := 5.791e10
def a_Venus   : Float := 1.082e11
def a_Earth   : Float := 1.496e11
def a_Mars    : Float := 2.279e11
def a_Jupiter : Float := 7.783e11
def a_Saturn  : Float := 1.432e12
def a_Uranus  : Float := 2.867e12
def a_Neptune : Float := 4.515e12
def a_Ceres   : Float := 4.140e11
