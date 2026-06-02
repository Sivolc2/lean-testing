import LeanTesting.SolarSystem

-- NOTE: The PLAN.md mentions "8-10 months" for Ceres→Mars transfer.
-- The correct Hohmann transfer from Ceres (2.77 AU) to Mars (1.52 AU)
-- takes ~573 days (~19 months), NOT 259 days.
-- The 259-day figure is for Earth→Mars Hohmann transfer.
-- This implementation uses correct physics.

-- Hohmann transfer parameters: Ceres → Mars (inner transfer, Ceres is apoapsis)
-- Since Ceres is OUTER than Mars, the transfer goes inward:
--   - Decelerate at Ceres (retrograde burn) to lower periapsis to Mars orbit
--   - Decelerate at Mars (retrograde burn) to circularize

structure TransferParams where
  a_depart  : Float   -- departure body semi-major axis
  a_arrive  : Float   -- arrival body semi-major axis
  a_transfer: Float   -- transfer ellipse semi-major axis
  T_transfer: Float   -- transfer time (half-period) in seconds
  v_depart  : Float   -- circular velocity at departure
  v_arrive  : Float   -- circular velocity at arrival
  v_t_depart: Float   -- transfer orbit velocity at departure point
  v_t_arrive: Float   -- transfer orbit velocity at arrival point
  dv_depart : Float   -- delta-v at departure (signed: negative = retrograde)
  dv_arrive : Float   -- delta-v at arrival (signed: negative = retrograde)
  deriving Repr

def computeTransfer (a_from a_to : Float) : TransferParams :=
  let a_t := (a_from + a_to) / 2.0
  let T_t := piVal * Float.sqrt (a_t * a_t * a_t / gmSun)
  let v_from := Float.sqrt (gmSun / a_from)
  let v_to   := Float.sqrt (gmSun / a_to)
  -- Vis-viva: v = sqrt(GM * (2/r - 1/a))
  let v_t_from := Float.sqrt (gmSun * (2.0 / a_from - 1.0 / a_t))
  let v_t_to   := Float.sqrt (gmSun * (2.0 / a_to   - 1.0 / a_t))
  -- Going inward (Ceres→Mars): decelerate at Ceres, decelerate at Mars
  let dv_dep := v_t_from - v_from  -- negative (retrograde deceleration)
  let dv_arr := v_to - v_t_to       -- positive (retrograde deceleration into orbit)
  { a_depart   := a_from
  , a_arrive   := a_to
  , a_transfer := a_t
  , T_transfer := T_t
  , v_depart   := v_from
  , v_arrive   := v_to
  , v_t_depart := v_t_from
  , v_t_arrive := v_t_to
  , dv_depart  := dv_dep
  , dv_arrive  := dv_arr }

-- Transfer parameters
def ceresToMars : TransferParams := computeTransfer a_Ceres a_Mars
def marsToCtransfer : TransferParams := computeTransfer a_Mars a_Ceres

-- Orbital angular velocities (rad/s)
def omega (a : Float) : Float :=
  2.0 * piVal / (2.0 * piVal * Float.sqrt (a * a * a / gmSun))

def omegaMars  : Float := omega a_Mars
def omegaCeres : Float := omega a_Ceres

-- Synodic period
def T_syn_MarsCeres : Float := 2.0 * piVal / Float.abs (omegaMars - omegaCeres)

-- Initial angles (from makeBody longitudes)
def theta0_Mars  : Float := degToRad 355.45
def theta0_Ceres : Float := degToRad 95.0

-- Find departure time for Ceres→Mars transfer
-- At departure t_dep, Ceres is at angle theta0_Ceres + omega_Ceres * t_dep
-- At arrival t_dep + T_t, Mars must be at same angle as Ceres at departure + pi (other side of ellipse)
-- Phase condition: theta_Mars(t_dep + T_t) = theta_Ceres(t_dep) + pi  (mod 2pi)
-- theta0_Mars + omega_Mars*(t_dep + T_t) = theta0_Ceres + omega_Ceres*t_dep + pi  (mod 2pi)
-- (omega_Mars - omega_Ceres)*t_dep = theta0_Ceres - theta0_Mars + pi - omega_Mars*T_t  (mod 2pi)
-- For inward transfer (Ceres apoapsis → Mars periapsis), Mars should be pi ahead
-- Actually for inward transfer: ship travels from apoapsis to periapsis
-- Mars should be at the DESTINATION when ship arrives, so Mars angle at arrival = Ceres angle at departure - pi
-- Wait: for inward transfer, transfer goes from outer orbit (apoapsis) to inner orbit (periapsis)
-- The transfer arc spans pi radians. Mars needs to be pi BEHIND Ceres's departure point (in heliocentric angle).
-- Correct phase condition:
-- theta_Mars(t_dep + T_t) = theta_Ceres(t_dep) + pi  (mod 2pi)  -- for outward (Earth→Mars style)
-- For inward (Ceres→Mars): theta_Mars(t_dep + T_t) = theta_Ceres(t_dep) - pi  (mod 2pi)
-- But since Mars is faster than Ceres (inner orbit), and Ceres is departure:
-- theta0_Mars + omega_Mars*(t_dep + T_t) = theta0_Ceres + omega_Ceres*t_dep - pi  (mod 2pi)
-- (omega_Mars - omega_Ceres)*t_dep = theta0_Ceres - theta0_Mars - pi - omega_Mars*T_t  (mod 2pi)

def findDepartureTime (theta0_from theta0_to : Float) (omega_from omega_to : Float) (T_t : Float) (inward : Bool) : Float :=
  -- inward: from outer to inner orbit
  -- For inward transfer: to body must be pi BEHIND from body (in direction of motion)
  -- Phase condition: theta_to(t + T_t) = theta_from(t) ± pi
  -- Sign: for outward transfer (outer is destination), use +pi; for inward, use -pi
  let sign := if inward then -1.0 else 1.0
  -- (omega_to - omega_from)*t = theta_from - theta_to - sign*pi - omega_to*T_t  (mod 2pi)
  let dOmega := omega_to - omega_from
  let rhs := theta0_from - theta0_to + sign * piVal - omega_to * T_t
  -- Normalize rhs to [0, 2pi)
  let twoPi := 2.0 * piVal
  let t_raw := rhs / dOmega
  -- Find smallest non-negative t
  let t_syn := twoPi / Float.abs dOmega
  let t_mod := t_raw - t_syn * Float.floor (t_raw / t_syn)
  t_mod

-- Compute launch windows
def t_depart_ceres : Float :=
  findDepartureTime theta0_Ceres theta0_Mars omegaCeres omegaMars ceresToMars.T_transfer true

-- After arriving at Mars, find return departure window
-- t_arrive_mars = t_depart_ceres + T_transfer
-- For return: Mars→Ceres (outward), omega_from=Mars, omega_to=Ceres, inward=false
def t_arrive_mars : Float := t_depart_ceres + ceresToMars.T_transfer

def theta_Mars_at_arrive : Float := theta0_Mars + omegaMars * t_arrive_mars
def theta_Ceres_at_arrive : Float := theta0_Ceres + omegaCeres * t_arrive_mars

def t_depart_mars_raw : Float :=
  let t := findDepartureTime theta_Mars_at_arrive theta_Ceres_at_arrive omegaMars omegaCeres marsToCtransfer.T_transfer false
  t

-- t_depart_mars must be >= t_arrive_mars; add synodic periods if needed
def t_depart_mars : Float :=
  t_arrive_mars + t_depart_mars_raw

def t_arrive_ceres : Float := t_depart_mars + marsToCtransfer.T_transfer

-- Delta-v vectors applied to ship
-- At Ceres departure: ship is moving with Ceres; apply dv tangentially
-- For inward transfer: decelerate (retrograde), so dv is negative of velocity direction
-- The actual dv magnitude is |ceresToMars.dv_depart|, direction opposite to velocity

-- Summary function for logging
def printTransferSummary : IO Unit := do
  let secPerDay := 86400.0
  let secPerYear := 365.25 * secPerDay
  IO.println "=== Transfer Summary ==="
  IO.println s!"Ceres semi-major axis: {a_Ceres / 1.496e11} AU"
  IO.println s!"Mars semi-major axis: {a_Mars / 1.496e11} AU"
  IO.println s!"Transfer semi-major axis: {ceresToMars.a_transfer / 1.496e11} AU"
  IO.println s!"Transfer time (Ceres→Mars): {ceresToMars.T_transfer / secPerDay} days"
  IO.println s!"  (NOTE: ~573 days expected for Ceres→Mars, not 259 days which is Earth→Mars)"
  IO.println s!"dv at Ceres departure: {ceresToMars.dv_depart} m/s"
  IO.println s!"dv at Mars arrival: {ceresToMars.dv_arrive} m/s"
  IO.println s!"Departure from Ceres: t = {t_depart_ceres / secPerDay} days"
  IO.println s!"Arrival at Mars: t = {t_arrive_mars / secPerDay} days"
  IO.println s!"Departure from Mars: t = {t_depart_mars / secPerDay} days"
  IO.println s!"Arrival at Ceres: t = {t_arrive_ceres / secPerDay} days"
  IO.println s!"Total mission time: {t_arrive_ceres / secPerDay} days ({t_arrive_ceres / secPerYear} years)"
  IO.println s!"4-year window: {4.0 * secPerYear / secPerDay} days"
