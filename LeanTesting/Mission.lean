/-
  LeanTesting/Mission.lean

  Ties the config, the orbital model, and the two drive models together. For
  every (route × drive) pair it produces a self-contained `Mission`: the numbers
  the presenter quotes (transit time, peak velocity, Δv, "N× faster than
  chemical") plus a time-uniform sequence of frames (all planet positions + the
  ship position) ready for the visualizer.
-/
import LeanTesting.Vec2
import LeanTesting.Orbit
import LeanTesting.Brachistochrone
import LeanTesting.Hohmann
import LeanTesting.Config

/-- One animation frame: time, every body's position, the ship, and its phase. -/
structure Frame where
  t         : Float
  positions : Array Vec2
  shipPos   : Vec2
  phase     : String
deriving Inhabited

/-- A fully-computed mission for one route and one drive. -/
structure Mission where
  id            : String
  route         : String
  fromBody      : String
  toBody        : String
  driveId       : String
  driveLabel    : String
  accelG        : Float
  isHohmann     : Bool
  transitDays   : Float
  peakVelKms    : Float
  deltaVKms     : Float          -- 0.0 for Epstein
  hohmannDays   : Float          -- baseline for the same route
  speedupFactor : Float          -- hohmannDays / transitDays
  frames        : Array Frame
deriving Inhabited

def gEarth : Float := 9.80665     -- m/s² per "g"
def framesPerMission : Nat := 240

/-- Sample every body's position at time t, optionally overriding one body's θ₀
    (used to phase the Hohmann destination into its launch window). -/
def sampleBodies (t : Float) (overrideName : String) (overrideTheta0 : Float) : Array Vec2 :=
  Orbit.elems.map fun e =>
    let e := if e.name == overrideName then { e with theta0 := overrideTheta0 } else e
    Orbit.posAt e t

/-- Peak heliocentric speed of a Hohmann transfer (at periapsis), in m/s. -/
def hohmannPeakVel (g : Hohmann.Geo) : Float :=
  let rp := min g.aFrom g.aTo
  Float.sqrt (gmSun * (2.0 / rp - 1.0 / g.aT))

def lookupElem (name : String) : Except String Orbit.Elem :=
  match Orbit.find? name with
  | some e => .ok e
  | none   => .error s!"unknown body '{name}' (known: Sun..Ceres)"

/-- Build a single mission for a route and drive. -/
def buildMission (route : RouteSpec) (drive : DriveSpec) : Except String Mission := do
  let eA ← lookupElem route.fromBody
  let eB ← lookupElem route.toBody
  let hplan := Hohmann.plan eA eB
  let hohmannDays := hplan.g.tTransit / 86400.0
  let routeStr := s!"{route.fromBody} → {route.toBody}"
  let mkId := s!"{route.fromBody}-{route.toBody}-{drive.id}"
  if drive.accelG <= 0.0 then
    -- Chemical / Hohmann transfer.
    let g := hplan.g
    let tT := g.tTransit
    let frames := (Array.range (framesPerMission + 1)).map fun k =>
      let τ := (Float.ofNat k / Float.ofNat framesPerMission) * tT
      { t := τ
      , positions := sampleBodies τ route.toBody hplan.destE0
      , shipPos := Hohmann.shipPosAt g τ
      , phase := "coast" : Frame }
    return {
      id := mkId, route := routeStr,
      fromBody := route.fromBody, toBody := route.toBody,
      driveId := drive.id, driveLabel := drive.label, accelG := 0.0,
      isHohmann := true,
      transitDays := hohmannDays,
      peakVelKms := hohmannPeakVel g / 1000.0,
      deltaVKms := Hohmann.totalDeltaV hplan / 1000.0,
      hohmannDays := hohmannDays,
      speedupFactor := 1.0,
      frames := frames }
  else
    -- Epstein flip-and-burn.
    let a := drive.accelG * gEarth
    let bp := Brach.plan eA eB a
    let tArr := bp.tArrive
    let transitDays := tArr / 86400.0
    let frames := (Array.range (framesPerMission + 1)).map fun k =>
      let τ := (Float.ofNat k / Float.ofNat framesPerMission) * tArr
      { t := τ
      , positions := sampleBodies τ "" 0.0
      , shipPos := Brach.shipPosAt bp a τ
      , phase := Brach.phaseAt tArr τ : Frame }
    return {
      id := mkId, route := routeStr,
      fromBody := route.fromBody, toBody := route.toBody,
      driveId := drive.id, driveLabel := drive.label, accelG := drive.accelG,
      isHohmann := false,
      transitDays := transitDays,
      peakVelKms := bp.peakVel / 1000.0,
      deltaVKms := 0.0,
      hohmannDays := hohmannDays,
      speedupFactor := hohmannDays / transitDays,
      frames := frames }

/-- Build every mission (route × drive) from a config. -/
def buildMissions (cfg : MissionConfig) : Except String (Array Mission) := do
  let mut out : Array Mission := #[]
  for route in cfg.routes do
    for drive in cfg.drives do
      let m ← buildMission route drive
      out := out.push m
  return out
