$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
  pnpm.cmd --filter @fpl-optimizer/api run db:migrate
}
finally {
  Pop-Location
}
