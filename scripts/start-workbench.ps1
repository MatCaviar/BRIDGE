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
Write-Host "Starting one local Electron window (no HTTP server or TCP port)."
Write-Host "Close the window to stop Workbench and its child processes."

& $npm run workbench:start
exit $LASTEXITCODE
