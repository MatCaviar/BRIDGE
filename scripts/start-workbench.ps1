[CmdletBinding()]
param(
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

$backend = if ($env:AGENT_BACKEND) { $env:AGENT_BACKEND.ToLower() } else { "codex" }
if ($backend -eq "claude") {
  $claudeResolver = Join-Path $PSScriptRoot "resolve-claude-executable.ps1"
  $env:CLAUDE_EXECUTABLE = & $claudeResolver
} else {
  $backend = "codex"
  $codexResolver = Join-Path $PSScriptRoot "resolve-codex-executable.ps1"
  $env:CODEX_EXECUTABLE = & $codexResolver
}

Set-Location $repoRoot

if ($Install) {
  & $npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} elseif (-not (Test-Path (Join-Path $repoRoot "node_modules"))) {
  throw "Dependencies are missing. Run this script once with -Install."
}

Write-Host "BRIDGE Visual Workbench" -ForegroundColor Cyan
Write-Host "Starting one local Electron window (no HTTP server or TCP port)."
if ($backend -eq "claude") {
  Write-Host "Agent backend: claude ($env:CLAUDE_EXECUTABLE)"
} else {
  Write-Host "Agent backend: codex ($env:CODEX_EXECUTABLE)"
}
Write-Host "Close the window to stop Workbench and its child processes."

& $npm run workbench:start
exit $LASTEXITCODE
