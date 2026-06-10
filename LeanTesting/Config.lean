/-
  LeanTesting/Config.lean

  Mission configuration: a list of drives (by constant acceleration in g) and a
  list of routes (body pairs). Read from `config/missions.json`.
-/
import LeanTesting.Json

open SimJson

structure DriveSpec where
  id     : String
  label  : String
  accelG : Float        -- constant proper acceleration in Earth g's; 0 ⇒ chemical/Hohmann
deriving Repr, Inhabited

structure RouteSpec where
  fromBody : String
  toBody   : String
deriving Repr, Inhabited

structure MissionConfig where
  drives : Array DriveSpec
  routes : Array RouteSpec
deriving Repr, Inhabited

namespace Config

def optToExcept (o : Option α) (msg : String) : Except String α :=
  match o with
  | some a => .ok a
  | none   => .error msg

def reqStr (j : Json) (k : String) : Except String String :=
  optToExcept (j.get? k >>= Json.getStr?) s!"missing string field '{k}'"

def reqNum (j : Json) (k : String) : Except String Float :=
  optToExcept (j.get? k >>= Json.getNum?) s!"missing number field '{k}'"

def parseDrive (j : Json) : Except String DriveSpec := do
  let id     ← reqStr j "id"
  let label  ← reqStr j "label"
  let accelG ← reqNum j "accelG"
  return { id, label, accelG }

def parseRoute (j : Json) : Except String RouteSpec := do
  let f ← reqStr j "from"
  let t ← reqStr j "to"
  return { fromBody := f, toBody := t }

def parseConfig (root : Json) : Except String MissionConfig := do
  let drivesJ ← optToExcept (root.get? "drives" >>= Json.getArr?) "config: missing 'drives' array"
  let routesJ ← optToExcept (root.get? "routes" >>= Json.getArr?) "config: missing 'routes' array"
  let drives  ← drivesJ.mapM parseDrive
  let routes  ← routesJ.mapM parseRoute
  return { drives, routes }

/-- Parse config from a JSON string (used in tests). -/
def ofString (s : String) : Except String MissionConfig := do
  let j ← SimJson.parse s
  parseConfig j

/-- Read and parse the config file, throwing an IO error on failure. -/
def load (path : String) : IO MissionConfig := do
  let s ← IO.FS.readFile path
  match ofString s with
  | .ok c    => return c
  | .error e => throw (IO.userError s!"config error reading {path}: {e}")

end Config
