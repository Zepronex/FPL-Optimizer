param(
  [string]$PredictionsPath = "data/predictions/expected_points_latest.jsonl",
  [string]$ModelPath = "data/models/expected_points_baseline.json",
  [string]$EvaluationPath = "data/evaluation/expected_points_backtest.json",
  [string]$ModelName = "expected_points"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$argsList = @(
  "--filter",
  "@fpl-optimizer/api",
  "run",
  "db:load:predictions",
  "--",
  "--predictions",
  $PredictionsPath,
  "--model",
  $ModelPath,
  "--evaluation",
  $EvaluationPath,
  "--model-name",
  $ModelName
)

Push-Location $repoRoot
try {
  pnpm.cmd @argsList
}
finally {
  Pop-Location
}
