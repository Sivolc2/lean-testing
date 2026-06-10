/-
  LeanTesting/Export.lean

  Serialize the mission catalog to `visualizer/trajectory.json` and print a
  human-readable summary table (the numbers the presenter can quote on stage).
  Also runs the N-body RK4 core once as a validation credential (emergent
  orbital period) — the "real physics under the hood".
-/
import LeanTesting.Vec2
import LeanTesting.Body
import LeanTesting.Forces
import LeanTesting.RK4
import LeanTesting.SolarSystem
import LeanTesting.Orbit
import LeanTesting.Config
import LeanTesting.Mission

-- ── JSON building helpers (avoids brace-escaping in s! strings) ─────────────

/-- Format a float for JSON, guarding against NaN/Inf. -/
def floatToJson (f : Float) : String :=
  if f.isNaN || f.isInf then "0.0" else toString f

def jstr (s : String) : String := "\"" ++ s ++ "\""
def jfield (k v : String) : String := jstr k ++ ":" ++ v
def jobj (fields : List String) : String := "{" ++ String.intercalate "," fields ++ "}"
def jarr (items : List String) : String := "[" ++ String.intercalate "," items ++ "]"

def vec2ToJson (v : Vec2) : String := jarr [floatToJson v.x, floatToJson v.y]

def frameToJson (fr : Frame) : String :=
  jobj [ jfield "t" (floatToJson fr.t)
       , jfield "positions" (jarr (fr.positions.map vec2ToJson).toList)
       , jfield "shipPos" (vec2ToJson fr.shipPos)
       , jfield "phase" (jstr fr.phase) ]

def missionToJson (m : Mission) : String :=
  jobj [ jfield "id" (jstr m.id)
       , jfield "route" (jstr m.route)
       , jfield "from" (jstr m.fromBody)
       , jfield "to" (jstr m.toBody)
       , jfield "driveId" (jstr m.driveId)
       , jfield "driveLabel" (jstr m.driveLabel)
       , jfield "accelG" (floatToJson m.accelG)
       , jfield "isHohmann" (if m.isHohmann then "true" else "false")
       , jfield "transitDays" (floatToJson m.transitDays)
       , jfield "peakVelKms" (floatToJson m.peakVelKms)
       , jfield "deltaVKms" (if m.isHohmann then floatToJson m.deltaVKms else "null")
       , jfield "hohmannDays" (floatToJson m.hohmannDays)
       , jfield "speedupFactor" (floatToJson m.speedupFactor)
       , jfield "frames" (jarr (m.frames.map frameToJson).toList) ]

def driveToJson (d : DriveSpec) : String :=
  jobj [ jfield "id" (jstr d.id), jfield "label" (jstr d.label), jfield "accelG" (floatToJson d.accelG) ]

def bodyMetaToJson (e : Orbit.Elem) : String :=
  jobj [ jfield "name" (jstr e.name)
       , jfield "mass" (floatToJson e.mass)
       , jfield "aAU" (floatToJson (e.a / auMeters)) ]

/-- Serialize the whole catalog. -/
def catalogToJson (cfg : MissionConfig) (missions : Array Mission) : String :=
  jobj [ jfield "bodies"   (jarr (Orbit.elems.map bodyMetaToJson).toList)
       , jfield "drives"   (jarr (cfg.drives.map driveToJson).toList)
       , jfield "missions" (jarr (missions.map missionToJson).toList) ] ++ "\n"

-- ── Reporting & validation ──────────────────────────────────────────────────

/-- Round a float to `n` decimals for display. -/
def round2 (f : Float) : Float := (f * 100.0).toUInt64.toNat.toFloat / 100.0

/-- Pretty transit-time string. -/
def fmtTransit (days : Float) : String :=
  if days < 2.0 then s!"{round2 (days * 24.0)} h"
  else if days < 400.0 then s!"{days.toUInt64.toNat} d"
  else s!"{round2 (days / 365.25)} yr"

/-- Print the per-mission numbers table. -/
def printSummary (missions : Array Mission) : IO Unit := do
  IO.println "\n=== Transit Catalog (numbers to quote) ==="
  for m in missions do
    let dv := if m.isHohmann then s!"Δv {round2 m.deltaVKms} km/s" else "Δv n/a"
    let speed := if m.isHohmann then "baseline" else s!"{m.speedupFactor.toUInt64.toNat}x vs chemical"
    IO.println s!"  {m.route} | {m.driveLabel}: {fmtTransit m.transitDays}, peak {m.peakVelKms.toUInt64.toNat} km/s, {dv}, {speed}"

/-- N-body RK4 validation: integrate the real system and report Earth's
    emergent orbital period (~365 d) — proves the physics core works. -/
def validateNBody : IO Unit := do
  let template := initialBodies
  let dt := 21600.0
  let earth0 := template[earthIdx]!
  let p0x := earth0.pos.x; let p0y := earth0.pos.y
  let mut state := stateFromBodies template
  let mut t := 0.0
  let mut periodGuess := 0.0
  let mut movedAway := false
  let total := (1.2 * 365.25 * 86400.0 / dt).toUInt64.toNat
  for _ in [:total] do
    state := rk4Step template dt state
    t := t + dt
    let ex := state[earthIdx * 4]!
    let ey := state[earthIdx * 4 + 1]!
    let d := Float.sqrt ((ex - p0x)*(ex - p0x) + (ey - p0y)*(ey - p0y))
    if d > 0.5 * a_Earth then movedAway := true
    if periodGuess == 0.0 && movedAway && d < 0.02 * a_Earth then periodGuess := t
  IO.println s!"\n[N-body RK4] Earth emergent period ≈ {periodGuess / 86400.0 |>.toUInt64.toNat} d (expected ~365)"
  IO.println s!"[analytic ]  Earth = {Orbit.periodOf a_Earth / 86400.0 |>.toUInt64.toNat} d, Mars = {Orbit.periodOf a_Mars / 86400.0 |>.toUInt64.toNat} d"

/-- Main entry: read config → build missions → export + summary. -/
def runSimulation : IO Unit := do
  try IO.FS.createDir "visualizer" catch _ => pure ()
  IO.println "Loading config/missions.json ..."
  let cfg ← Config.load "config/missions.json"
  IO.println s!"  {cfg.drives.size} drives × {cfg.routes.size} routes = {cfg.drives.size * cfg.routes.size} missions"
  let missions ← match buildMissions cfg with
    | .ok ms => pure ms
    | .error e => throw (IO.userError s!"mission build error: {e}")
  let json := catalogToJson cfg missions
  IO.FS.writeFile "visualizer/trajectory.json" json
  let totalFrames := missions.foldl (fun acc m => acc + m.frames.size) 0
  IO.println s!"Wrote visualizer/trajectory.json ({missions.size} missions, {totalFrames} frames)"
  printSummary missions
  validateNBody
