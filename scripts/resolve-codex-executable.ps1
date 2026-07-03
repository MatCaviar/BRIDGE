[CmdletBinding()]
param(
  [string]$CommandName = "codex.exe"
)

$ErrorActionPreference = "Stop"
$candidate = if ($env:CODEX_EXECUTABLE) { $env:CODEX_EXECUTABLE } else { $CommandName }
$command = Get-Command -Name $candidate -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $command) {
  throw "Codex CLI was not found. Install Codex or set CODEX_EXECUTABLE to its absolute executable path."
}

$path = if ($command.Source) { $command.Source } else { $command.Path }
if (-not $path -or -not [System.IO.Path]::IsPathRooted($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
  throw "Codex CLI did not resolve to a readable absolute executable path: $candidate"
}

Write-Output $path
