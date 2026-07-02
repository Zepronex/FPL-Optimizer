param(
  [string]$InputDir = "data/fpl/latest"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
  pnpm.cmd --filter @fpl-optimizer/api run db:load:fpl -- --input $InputDir
}
finally {
  Pop-Location
}
