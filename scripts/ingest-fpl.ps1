param(
  [string]$OutputDir = "data/fpl/latest",
  [string]$Season = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$arguments = @("--filter", "@fpl-optimizer/api", "run", "ingest:fpl", "--", "--out", $OutputDir)

if ($Season -ne "") {
  $arguments += @("--season", $Season)
}

Push-Location $repoRoot
try {
  pnpm.cmd @arguments
}
finally {
  Pop-Location
}
