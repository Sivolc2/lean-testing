import LeanTesting

/-- Generate the mission catalog from `config/missions.json` and export it for
    the visualizer. Run the assertion test-suite with `lake exe tests`. -/
def main : IO Unit := do
  IO.println "Epstein-drive orbital transit simulator"
  IO.println "========================================"
  runSimulation
