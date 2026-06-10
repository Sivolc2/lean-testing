/-
  LeanTesting/Json.lean

  A small, dependency-free JSON parser (objects, arrays, strings, numbers,
  bools, null). Used to read `config/missions.json` and to re-parse the
  exported `trajectory.json` in tests. The schema we consume is tiny, but the
  number parser handles full scientific notation because exported positions are
  ~1e11 and serialized as e.g. "1.234e11".
-/

set_option linter.unusedVariables false

namespace SimJson

inductive Json where
  | null
  | bool (b : Bool)
  | num  (n : Float)
  | str  (s : String)
  | arr  (a : Array Json)
  | obj  (fields : Array (String × Json))
deriving Inhabited, Repr

namespace Json

/-- Look up a key in an object node. -/
def get? : Json → String → Option Json
  | obj fs, k => (fs.find? (fun p => p.1 == k)).map (·.2)
  | _, _ => none

def getStr? : Json → Option String
  | str s => some s
  | _ => none

def getNum? : Json → Option Float
  | num n => some n
  | _ => none

def getArr? : Json → Option (Array Json)
  | arr a => some a
  | _ => none

/-- Convenience: object field as string. -/
def field? (j : Json) (k : String) : Option Json := j.get? k

end Json

-- ── Number parsing ──────────────────────────────────────────────────────────

private def isDigit (c : Char) : Bool := '0' ≤ c && c ≤ '9'
private def dval (c : Char) : Float := Float.ofNat (c.toNat - '0'.toNat)

private partial def fpow10 (e : Int) : Float :=
  if e == 0 then 1.0
  else if e > 0 then 10.0 * fpow10 (e - 1)
  else 0.1 * fpow10 (e + 1)

/-- Read leading decimal digits as a Float; returns (value, count, rest). -/
private partial def readDigitsF (cs : List Char) (acc : Float) (cnt : Nat) : (Float × Nat × List Char) :=
  match cs with
  | c :: tl => if isDigit c then readDigitsF tl (acc * 10.0 + dval c) (cnt + 1) else (acc, cnt, cs)
  | [] => (acc, cnt, cs)

/-- Read leading decimal digits as a Nat; returns (value, count, rest). -/
private partial def readDigitsN (cs : List Char) (acc : Nat) (cnt : Nat) : (Nat × Nat × List Char) :=
  match cs with
  | c :: tl => if isDigit c then readDigitsN tl (acc * 10 + (c.toNat - '0'.toNat)) (cnt + 1) else (acc, cnt, cs)
  | [] => (acc, cnt, cs)

/-- Parse a Float from a JSON number literal (handles sign, fraction, exponent). -/
def floatOfString (s : String) : Option Float :=
  let cs0 := s.toList
  let (sign, cs1) := match cs0 with
    | '-' :: r => (-1.0, r)
    | '+' :: r => (1.0, r)
    | _ => (1.0, cs0)
  let (intVal, intCnt, cs2) := readDigitsF cs1 0.0 0
  let (fracVal, fracCnt, cs3) := match cs2 with
    | '.' :: r =>
      let (fv, fc, rest) := readDigitsF r 0.0 0
      (fv * fpow10 (- Int.ofNat fc), fc, rest)
    | _ => (0.0, 0, cs2)
  if intCnt == 0 && fracCnt == 0 then none
  else
    let mantissa := intVal + fracVal
    match cs3 with
    | e :: r =>
      if e == 'e' || e == 'E' then
        let (esign, r1) := match r with
          | '-' :: r2 => (-1, r2)
          | '+' :: r2 => (1, r2)
          | _ => (1, r)
        let (expVal, expCnt, r2) := readDigitsN r1 0 0
        if expCnt == 0 || !r2.isEmpty then none
        else some (sign * mantissa * fpow10 (esign * Int.ofNat expVal))
      else none
    | [] => some (sign * mantissa)

-- ── Tokenizer-ish helpers over a Char array ─────────────────────────────────

abbrev PResult (α : Type) := Except String (α × Nat)

private def isWs (c : Char) : Bool := c == ' ' || c == '\n' || c == '\t' || c == '\r'

private partial def skipWs (cs : Array Char) (i : Nat) : Nat :=
  if h : i < cs.size then
    if isWs cs[i]! then skipWs cs (i + 1) else i
  else i

private partial def scanNumEnd (cs : Array Char) (j : Nat) : Nat :=
  if h : j < cs.size then
    let c := cs[j]!
    if isDigit c || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E'
    then scanNumEnd cs (j + 1) else j
  else j

private def subStr (cs : Array Char) (a b : Nat) : String :=
  (cs.extract a b).foldl (fun s c => s.push c) ""

private def matchLit (cs : Array Char) (i : Nat) (lit : String) : Bool := Id.run do
  let ls := lit.toList.toArray
  if i + ls.size > cs.size then return false
  for k in [:ls.size] do
    if cs[i + k]! != ls[k]! then return false
  return true

private partial def pString (cs : Array Char) (j : Nat) (acc : String) : PResult String :=
  if h : j < cs.size then
    let c := cs[j]!
    if c == '"' then .ok (acc, j + 1)
    else if c == '\\' then
      if h2 : j + 1 < cs.size then
        let e := cs[j + 1]!
        let ch := match e with
          | 'n' => '\n' | 't' => '\t' | 'r' => '\r'
          | '"' => '"'  | '\\' => '\\' | '/' => '/'
          | other => other
        pString cs (j + 2) (acc.push ch)
      else .error "unterminated escape in string"
    else pString cs (j + 1) (acc.push c)
  else .error "unterminated string"

mutual
  partial def pValue (cs : Array Char) (i0 : Nat) : PResult Json :=
    let i := skipWs cs i0
    if h : i < cs.size then
      let c := cs[i]!
      if c == '"' then
        match pString cs (i + 1) "" with
        | .ok (s, i') => .ok (.str s, i')
        | .error e => .error e
      else if c == '{' then pObject cs i
      else if c == '[' then pArray cs i
      else if matchLit cs i "true" then .ok (.bool true, i + 4)
      else if matchLit cs i "false" then .ok (.bool false, i + 5)
      else if matchLit cs i "null" then .ok (.null, i + 4)
      else
        let e := scanNumEnd cs i
        if e == i then .error s!"unexpected character '{c}' at {i}"
        else match floatOfString (subStr cs i e) with
          | some n => .ok (.num n, e)
          | none => .error s!"invalid number '{subStr cs i e}' at {i}"
    else .error "unexpected end of input"

  partial def pArray (cs : Array Char) (i : Nat) : PResult Json :=
    -- cs[i] == '['
    let j := skipWs cs (i + 1)
    if h : j < cs.size then
      if cs[j]! == ']' then .ok (.arr #[], j + 1)
      else pArrayElems cs j #[]
    else .error "unterminated array"

  partial def pArrayElems (cs : Array Char) (i : Nat) (acc : Array Json) : PResult Json :=
    match pValue cs i with
    | .error e => .error e
    | .ok (v, i') =>
      let acc := acc.push v
      let j := skipWs cs i'
      if h : j < cs.size then
        let c := cs[j]!
        if c == ',' then pArrayElems cs (j + 1) acc
        else if c == ']' then .ok (.arr acc, j + 1)
        else .error s!"expected ',' or ']' in array at {j}"
      else .error "unterminated array"

  partial def pObject (cs : Array Char) (i : Nat) : PResult Json :=
    -- cs[i] == '{'
    let j := skipWs cs (i + 1)
    if h : j < cs.size then
      if cs[j]! == '}' then .ok (.obj #[], j + 1)
      else pObjectFields cs j #[]
    else .error "unterminated object"

  partial def pObjectFields (cs : Array Char) (i : Nat) (acc : Array (String × Json)) : PResult Json :=
    let j := skipWs cs i
    if h : j < cs.size then
      if cs[j]! != '"' then .error s!"expected string key at {j}"
      else match pString cs (j + 1) "" with
        | .error e => .error e
        | .ok (key, j') =>
          let k := skipWs cs j'
          if h2 : k < cs.size then
            if cs[k]! != ':' then .error s!"expected ':' at {k}"
            else match pValue cs (k + 1) with
              | .error e => .error e
              | .ok (v, v') =>
                let acc := acc.push (key, v)
                let m := skipWs cs v'
                if h3 : m < cs.size then
                  let c := cs[m]!
                  if c == ',' then pObjectFields cs (m + 1) acc
                  else if c == '}' then .ok (.obj acc, m + 1)
                  else .error s!"expected ',' or '}}' in object at {m}"
                else .error "unterminated object"
          else .error "unterminated object after key"
    else .error "unterminated object"
end

/-- Parse a complete JSON document. -/
def parse (s : String) : Except String Json :=
  let cs := s.toList.toArray
  match pValue cs 0 with
  | .error e => .error e
  | .ok (v, i) =>
    let j := skipWs cs i
    if j == cs.size then .ok v
    else .error s!"trailing characters after JSON value at {j}"

end SimJson
