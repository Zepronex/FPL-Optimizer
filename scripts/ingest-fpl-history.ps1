param(
  [string]$InputDir = "data/fpl/latest",
  [string]$OutputFile = "data/fpl/history/player_gameweek_history.json",
  [int]$Concurrency = 8
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$arguments = @(
  "--filter",
  "@fpl-optimizer/api",
  "run",
  "ingest:fpl:history",
  "--",
  "--input",
  $InputDir,
  "--output",
  $OutputFile,
  "--concurrency",
  "$Concurrency"
)

Push-Location $repoRoot
try {
  pnpm.cmd @arguments
}
finally {
  Pop-Location
}
