/-
  LeanTesting/Orbit.lean

  Closed-form circular-orbit model used to render mission backgrounds cheaply.
  Planet position at time t is θ(t) = θ₀ + ω·t with ω = √(μ/a³). This is the
  "efficient but not too approximate" model: it reproduces orbital periods
  exactly and ignores eccentricity (Mars e≈0.09 is the worst case). The N-body
  RK4 core (Forces/RK4) remains as the higher-fidelity validation reference.
-/
import LeanTesting.Vec2
import LeanTesting.SolarSystem

namespace Orbit

/-- Orbital element record for the circular model. -/
structure Elem where
  name   : String
  mass   : Float
  a      : Float      -- semi-major axis (m)
  theta0 : Float      -- initial heliocentric longitude (rad)
deriving Repr, Inhabited

/-- The bodies, with the same masses / axes / longitudes as `initialBodies`. -/
def elems : Array Elem := #[
  ⟨"Sun",     1.989e30, 0.0,      degToRad 0.0⟩,
  ⟨"Mercury", 3.301e23, 5.791e10, degToRad 252.25⟩,
  ⟨"Venus",   4.867e24, 1.082e11, degToRad 181.98⟩,
  ⟨"Earth",   5.972e24, 1.496e11, degToRad 100.46⟩,
  ⟨"Mars",    6.417e23, 2.279e11, degToRad 355.45⟩,
  ⟨"Jupiter", 1.899e27, 7.783e11, degToRad 34.40⟩,
  ⟨"Saturn",  5.685e26, 1.432e12, degToRad 49.94⟩,
  ⟨"Uranus",  8.682e25, 2.867e12, degToRad 313.23⟩,
  ⟨"Neptune", 1.024e26, 4.515e12, degToRad 304.88⟩,
  ⟨"Ceres",   9.393e20, 4.140e11, degToRad 95.0⟩
]

def find? (name : String) : Option Elem := elems.find? (·.name == name)

/-- Mean motion (rad/s) for a circular orbit of semi-major axis `a`. -/
def omegaOf (a : Float) : Float := Float.sqrt (gmSun / (a * a * a))

/-- Orbital period (s). -/
def periodOf (a : Float) : Float := 2.0 * piVal / omegaOf a

/-- Circular orbital speed (m/s). -/
def circularVel (a : Float) : Float := Float.sqrt (gmSun / a)

/-- Heliocentric longitude of a body at time t. -/
def angleAt (e : Elem) (t : Float) : Float := e.theta0 + omegaOf e.a * t

/-- Position of a body at time t. The Sun (a=0) stays at the origin. -/
def posAt (e : Elem) (t : Float) : Vec2 :=
  if e.a == 0.0 then ⟨0.0, 0.0⟩
  else
    let th := angleAt e t
    ⟨e.a * Float.cos th, e.a * Float.sin th⟩

end Orbit
