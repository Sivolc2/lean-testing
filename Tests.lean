import LeanTesting

/-!
  Assertion test-suite for the Lean physics core. Run with `lake exe tests`.
  Exits non-zero if any check fails.
-/

open SimJson

def sampleConfig : String :=
  "{ \"drives\": [ {\"id\":\"chem\",\"label\":\"Chemical\",\"accelG\":0.0}, {\"id\":\"ep1\",\"label\":\"Epstein 1g\",\"accelG\":1.0} ], \"routes\": [ {\"from\":\"Earth\",\"to\":\"Mars\"} ] }"

def main : IO Unit := do
  let pass ← IO.mkRef 0
  let fail ← IO.mkRef 0
  let check (name : String) (cond : Bool) : IO Unit := do
    if cond then pass.modify (·+1); IO.println s!"  ✓ {name}"
    else fail.modify (·+1); IO.println s!"  ✗ FAIL: {name}"
  let approx (name : String) (got expected tol : Float) : IO Unit :=
    check s!"{name} (got {got}, want {expected}±{tol})" (Float.abs (got - expected) ≤ tol)

  IO.println "=== Vec2 & integrator ==="
  check "Vec2.norm (3,4) = 5" (Vec2.norm ⟨3.0,4.0⟩ == 5.0)
  -- RK4 on a simple harmonic oscillator: energy conserved <0.01% over 100 periods
  let omega := 1.0; let dt := 0.01
  let steps := (100.0 * 2.0 * piVal / dt).toUInt64.toNat
  let mut x := 1.0; let mut v := 0.0
  let E0 := 0.5 * (x*x + v*v)
  for _ in [:steps] do
    let k1x := v;              let k1v := -(omega*omega*x)
    let k2x := v + dt/2*k1v;   let k2v := -(omega*omega*(x + dt/2*k1x))
    let k3x := v + dt/2*k2v;   let k3v := -(omega*omega*(x + dt/2*k2x))
    let k4x := v + dt*k3v;     let k4v := -(omega*omega*(x + dt*k3x))
    x := x + dt/6*(k1x + 2*k2x + 2*k3x + k4x)
    v := v + dt/6*(k1v + 2*k2v + 2*k3v + k4v)
  let Ef := 0.5 * (x*x + v*v)
  check "RK4 SHO energy conserved <0.01% over 100 periods" (Float.abs (Ef - E0) / E0 < 0.0001)
  -- N-body RK4: 2-body Sun+Earth orbit stays circular & returns after one period
  let template := #[initialBodies[sunIdx]!, initialBodies[earthIdx]!]
  let period := Orbit.periodOf a_Earth
  let nSteps := (period / 21600.0).toUInt64.toNat
  let mut st := stateFromBodies template
  let p0x := st[4]!; let p0y := st[5]!
  let mut minR := a_Earth; let mut maxR := a_Earth
  for _ in [:nSteps] do
    st := rk4Step template 21600.0 st
    let r := Float.sqrt (st[4]!*st[4]! + st[5]!*st[5]!)
    minR := min minR r; maxR := max maxR r
  let backDist := Float.sqrt ((st[4]!-p0x)*(st[4]!-p0x) + (st[5]!-p0y)*(st[5]!-p0y))
  check "N-body: Earth orbit stays circular (maxR/minR-1 < 2%)" (maxR/minR - 1.0 < 0.02)
  check "N-body: Earth returns near start after 1 period (<3% of a)" (backDist < 0.03 * a_Earth)

  IO.println "\n=== Brachistochrone (Epstein) ==="
  approx "transitTime d=a ⇒ 2" (Brach.transitTime 1.0 1.0) 2.0 1e-9
  approx "peakVel d=4,a=1 ⇒ 2" (Brach.peakVel 4.0 1.0) 2.0 1e-9
  -- Earth→Mars at 1g
  let eEarth := Orbit.find? "Earth" |>.get!
  let eMars  := Orbit.find? "Mars"  |>.get!
  let a1g := 9.80665
  let bp := Brach.plan eEarth eMars a1g
  let emDays := bp.tArrive / 86400.0
  check s!"Earth→Mars @1g transit 1-6 days (got {emDays})" (emDays > 1.0 && emDays < 6.0)
  check s!"Earth→Mars @1g peak vel 200-2000 km/s (got {bp.peakVel/1000.0})" (bp.peakVel/1000.0 > 200.0 && bp.peakVel/1000.0 < 2000.0)
  -- intercept fixed point converged: transitTime of the final distance equals tArrive
  approx "intercept converged" (Brach.transitTime bp.distance a1g) bp.tArrive (bp.tArrive * 1e-6)
  -- path endpoints and midpoint
  let s0 := Brach.shipPosAt bp a1g 0.0
  let sT := Brach.shipPosAt bp a1g bp.tArrive
  check "brach path starts at A" (Vec2.dist s0 bp.depart < 1.0)
  check "brach path ends at B" (Vec2.dist sT bp.target < bp.distance * 1e-6 + 1.0)
  approx "brach midpoint distance = d/2" (Vec2.dist (Brach.shipPosAt bp a1g (bp.tArrive/2.0)) bp.depart) (bp.distance/2.0) (bp.distance*1e-3)

  IO.println "\n=== Hohmann (chemical) ==="
  approx "Earth→Mars Hohmann ≈ 259 d" ((computeTransfer a_Earth a_Mars).T_transfer / 86400.0) 259.0 3.0
  approx "Ceres→Mars Hohmann ≈ 574 d" ((computeTransfer a_Ceres a_Mars).T_transfer / 86400.0) 574.0 5.0
  approx "Ceres→Saturn Hohmann ≈ 7.7 yr" ((computeTransfer a_Ceres a_Saturn).T_transfer / 86400.0 / 365.25) 7.66 0.2
  let hEM := Hohmann.plan eEarth eMars
  approx "Earth→Mars Hohmann total Δv ≈ 5.6 km/s" (Hohmann.totalDeltaV hEM / 1000.0) 5.6 0.6
  -- Kepler solver: M = E - e sin E
  let e := 0.3; let M := 1.0
  let bigE := Hohmann.solveKepler M e M 20
  check "Kepler solver residual < 1e-9" (Float.abs (bigE - e * Float.sin bigE - M) < 1e-9)
  -- Hohmann path: start near A, end radius ≈ a_to
  let hp0 := Hohmann.shipPosAt hEM.g 0.0
  let hpT := Hohmann.shipPosAt hEM.g hEM.g.tTransit
  approx "Hohmann path start radius = a_Earth" (Vec2.norm hp0) a_Earth (a_Earth*1e-3)
  approx "Hohmann path end radius = a_Mars" (Vec2.norm hpT) a_Mars (a_Mars*1e-3)

  IO.println "\n=== Orbit model ==="
  approx "Earth period ≈ 365.25 d" (Orbit.periodOf a_Earth / 86400.0) 365.25 2.0
  approx "ω·T = 2π" (Orbit.omegaOf a_Earth * Orbit.periodOf a_Earth) (2.0*piVal) 1e-9
  let pStart := Orbit.posAt eEarth 0.0
  let pBack := Orbit.posAt eEarth (Orbit.periodOf a_Earth)
  check "posAt returns to start after one period" (Vec2.dist pStart pBack < a_Earth * 1e-3)

  IO.println "\n=== JSON parser ==="
  approx "floatOfString 1.234e11" ((SimJson.floatOfString "1.234e11").getD 0.0) 1.234e11 1e3
  approx "floatOfString -2.5" ((SimJson.floatOfString "-2.5").getD 0.0) (-2.5) 1e-9
  approx "floatOfString 0.3" ((SimJson.floatOfString "0.3").getD 0.0) 0.3 1e-12
  approx "floatOfString 1e3" ((SimJson.floatOfString "1e3").getD 0.0) 1000.0 1e-9
  check "floatOfString rejects junk" ((SimJson.floatOfString "1.2.3").isNone)
  match Config.ofString sampleConfig with
  | .error e => check s!"parse sample config (error: {e})" false
  | .ok cfg =>
    check "config: 2 drives, 1 route" (cfg.drives.size == 2 && cfg.routes.size == 1)
    check "config: drive accelG values" (cfg.drives[0]!.accelG == 0.0 && cfg.drives[1]!.accelG == 1.0)
    check "config: route Earth→Mars" (cfg.routes[0]!.fromBody == "Earth" && cfg.routes[0]!.toBody == "Mars")
  check "malformed JSON ⇒ error" ((Config.ofString "{ bad").toOption.isNone)

  IO.println "\n=== Missions & speedup ==="
  match Config.ofString sampleConfig with
  | .error _ => check "build sample missions" false
  | .ok cfg =>
    match buildMissions cfg with
    | .error e => check s!"buildMissions (error {e})" false
    | .ok ms =>
      check "mission count = drives × routes" (ms.size == cfg.drives.size * cfg.routes.size)
      check "all transitDays finite & positive" (ms.all (fun m => m.transitDays > 0.0 && !m.transitDays.isNaN && !m.transitDays.isInf))
      let epm := ms.find? (·.driveId == "ep1") |>.get!
      check s!"Epstein 1g Earth→Mars speedup 40-120x (got {epm.speedupFactor})" (epm.speedupFactor > 40.0 && epm.speedupFactor < 120.0)
      check "Epstein transit < Hohmann transit" (epm.transitDays < epm.hohmannDays)
      check "every frame has 10 body positions" (epm.frames.all (·.positions.size == 10))
      check "frames non-empty" (epm.frames.size > 0)
      -- export round-trip
      let js := catalogToJson cfg ms
      match SimJson.parse js with
      | .error e => check s!"exported JSON re-parses (error {e})" false
      | .ok j =>
        match j.get? "missions" >>= Json.getArr? with
        | some arr => check "exported JSON has missions array" (arr.size == ms.size)
        | none => check "exported JSON has missions array" false

  let nf ← fail.get
  let np ← pass.get
  IO.println s!"\n========================================\n{np} passed, {nf} failed"
  if nf > 0 then IO.Process.exit 1 else IO.println "ALL TESTS PASSED"
