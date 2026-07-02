[CmdletBinding()]
param(
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

Set-Location $repoRoot

if ($Install) {
  & $npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} elseif (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
  throw "Dependencies are missing. Run this script once with -Install."
}

Write-Host "BRIDGE Visual Workbench" -ForegroundColor Cyan
Write-Host "UI:  http://127.0.0.1:43141/"
Write-Host "API: http://127.0.0.1:43140/api/health"
Write-Host "Press Ctrl+C to stop both services."

& $npm run workbench:dev
exit $LASTEXITCODE
