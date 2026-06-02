import LeanTesting.Vec2
import LeanTesting.Body
import LeanTesting.Forces
import LeanTesting.RK4
import LeanTesting.SolarSystem
import LeanTesting.Transfer

-- Simulation parameters
def simDt : Float := 21600.0           -- 6 hours in seconds
-- Extended to 10 years to cover Ceres-Mars round trip (~8.3 years with first window)
def simTotalTime : Float := 10.0 * 365.25 * 86400.0
def simSteps : Nat := (simTotalTime / simDt).toUInt64.toNat

-- Helper: format float for JSON (avoid NaN/Inf issues)
def floatToJson (f : Float) : String :=
  if f.isNaN || f.isInf then "0.0"
  else toString f

-- Run the full simulation and export to JSON
def runSimulation : IO Unit := do
  -- Create visualizer directory
  try IO.FS.createDir "visualizer" catch _ => pure ()

  IO.println "Starting simulation..."
  IO.println s!"Steps: {simSteps}, dt: {simDt}s"

  -- Print transfer summary
  printTransferSummary

  let bodies := initialBodies
  let template := bodies

  -- Ship starts at Ceres (last body, index 9)
  -- We track ship as an 11th "body" in the state
  -- Ship body: same pos/vel as Ceres initially
  let ceresBod := bodies[ceresIdx]!
  let shipBody : Body := {
    name  := "Ship"
    pos   := ceresBod.pos
    vel   := ceresBod.vel
    mass  := 1.0e6   -- ship mass (tiny, doesn't affect planets)
    : Body
  }

  -- Full template including ship
  let fullTemplate := template.push shipBody
  let mut fullState := stateFromBodies fullTemplate

  -- Event times (in seconds)
  let tDepart    := t_depart_ceres
  let tArriveMars := t_arrive_mars
  let tDepartMars := t_depart_mars
  let tArriveCeres := t_arrive_ceres

  -- Compute dv vectors (tangential to orbit, in direction of motion or opposite)
  -- At Ceres departure: ship velocity is ceresToMars.v_depart in tangential direction
  -- We need to apply dv_depart (negative = retrograde) in the tangential direction
  -- Tangential direction at departure = perpendicular to position, in direction of motion
  -- For circular orbit at angle theta: vel = vc * (-sin(theta), cos(theta))
  -- After dv_depart: new_speed = v_depart + dv_depart = v_t_depart

  -- Phase tracking
  -- "at_ceres" until t_depart, "ceres_to_mars" until t_arrive_mars,
  -- "at_mars" until t_depart_mars, "mars_to_ceres" until t_arrive_ceres,
  -- then "at_ceres" again

  let h ← IO.FS.Handle.mk "visualizer/trajectory.json" IO.FS.Mode.write

  -- Write header
  h.putStr "{\n"
  h.putStr "  \"bodies\": [\"Sun\",\"Mercury\",\"Venus\",\"Earth\",\"Mars\",\"Jupiter\",\"Saturn\",\"Uranus\",\"Neptune\",\"Ceres\"],\n"
  h.putStr s!"  \"ship\": \u007b\"departTime\": {floatToJson tDepart}, \"arriveMarsTime\": {floatToJson tArriveMars}, \"departMarsTime\": {floatToJson tDepartMars}, \"arriveCeresTime\": {floatToJson tArriveCeres}\u007d,\n"
  h.putStr "  \"frames\": [\n"

  let mut t := 0.0
  let mut frameIdx := 0
  let mut burnApplied_depart := false
  let mut burnApplied_arriveMars := false
  let mut burnApplied_departMars := false
  let mut burnApplied_arriveCeres := false
  let mut shipPhase := "at_ceres"
  let mut firstFrame := true

  -- Pre-compute some values for burn directions
  -- We'll compute burn direction from ship velocity at burn time

  for _step in [:simSteps] do
    -- Apply burns at appropriate times
    -- Departure from Ceres: apply retrograde burn
    if !burnApplied_depart && t >= tDepart then
      burnApplied_depart := true
      shipPhase := "ceres_to_mars"
      -- Get ship velocity direction from current state
      let shipBase := ceresIdx.succ * 4  -- ship is index 10 (after 10 bodies 0-9)
      let svx := fullState[shipBase + 2]!
      let svy := fullState[shipBase + 3]!
      let speed := Float.sqrt (svx * svx + svy * svy)
      if speed > 0.0 then
        -- New speed = v_t_depart (from Ceres at apoapsis of transfer ellipse)
        let newSpeed := ceresToMars.v_t_depart
        let scale := newSpeed / speed
        fullState := fullState.set! (shipBase + 2) (svx * scale)
        fullState := fullState.set! (shipBase + 3) (svy * scale)
      IO.println s!"  Departure burn applied at t={t/86400.0} days"

    if !burnApplied_arriveMars && t >= tArriveMars then
      burnApplied_arriveMars := true
      shipPhase := "at_mars"
      -- Circularize at Mars: set ship velocity to circular Mars orbit speed
      let shipBase := ceresIdx.succ * 4
      let svx := fullState[shipBase + 2]!
      let svy := fullState[shipBase + 3]!
      let speed := Float.sqrt (svx * svx + svy * svy)
      if speed > 0.0 then
        let newSpeed := ceresToMars.v_arrive
        let scale := newSpeed / speed
        fullState := fullState.set! (shipBase + 2) (svx * scale)
        fullState := fullState.set! (shipBase + 3) (svy * scale)
      IO.println s!"  Mars arrival burn applied at t={t/86400.0} days"

    if !burnApplied_departMars && t >= tDepartMars then
      burnApplied_departMars := true
      shipPhase := "mars_to_ceres"
      -- Departure from Mars: accelerate to v_t_arrive of return transfer
      let shipBase := ceresIdx.succ * 4
      let svx := fullState[shipBase + 2]!
      let svy := fullState[shipBase + 3]!
      let speed := Float.sqrt (svx * svx + svy * svy)
      if speed > 0.0 then
        let newSpeed := marsToCtransfer.v_t_depart
        let scale := newSpeed / speed
        fullState := fullState.set! (shipBase + 2) (svx * scale)
        fullState := fullState.set! (shipBase + 3) (svy * scale)
      IO.println s!"  Mars departure burn applied at t={t/86400.0} days"

    if !burnApplied_arriveCeres && t >= tArriveCeres then
      burnApplied_arriveCeres := true
      shipPhase := "at_ceres"
      -- Circularize at Ceres
      let shipBase := ceresIdx.succ * 4
      let svx := fullState[shipBase + 2]!
      let svy := fullState[shipBase + 3]!
      let speed := Float.sqrt (svx * svx + svy * svy)
      if speed > 0.0 then
        let newSpeed := marsToCtransfer.v_arrive
        let scale := newSpeed / speed
        fullState := fullState.set! (shipBase + 2) (svx * scale)
        fullState := fullState.set! (shipBase + 3) (svy * scale)
      IO.println s!"  Ceres arrival burn applied at t={t/86400.0} days"

    -- Write frame
    if !firstFrame then h.putStr ",\n"
    firstFrame := false

    -- Build frame JSON
    let mut posArr := "["
    for i in [:10] do
      let base := i * 4
      let px := fullState[base]!
      let py := fullState[base + 1]!
      if i > 0 then posArr := posArr ++ ","
      posArr := posArr ++ s!"[{floatToJson px},{floatToJson py}]"
    posArr := posArr ++ "]"

    -- Ship position (null before departure and after final arrival)
    let shipBase := 10 * 4
    let shipPosStr :=
      if shipPhase == "at_ceres" && !burnApplied_depart then
        "null"
      else if shipPhase == "at_ceres" && burnApplied_arriveCeres then
        "null"
      else
        let sx := fullState[shipBase]!
        let sy := fullState[shipBase + 1]!
        s!"[{floatToJson sx},{floatToJson sy}]"

    h.putStr s!"    \u007b\"t\": {floatToJson t}, \"positions\": {posArr}, \"shipPos\": {shipPosStr}, \"shipPhase\": \"{shipPhase}\"\u007d"

    -- Advance state
    fullState := rk4Step fullTemplate simDt fullState
    t := t + simDt
    frameIdx := frameIdx + 1

    if frameIdx % 500 == 0 then
      IO.println s!"  Progress: {frameIdx}/{simSteps} frames ({t / 86400.0 / 365.25} years)"

  h.putStr "\n  ]\n}\n"
  IO.println s!"Simulation complete. {frameIdx} frames written."
  IO.println s!"Output: visualizer/trajectory.json"
