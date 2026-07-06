[CmdletBinding()]
param(
  [string]$CommandName = "claude"
)

$ErrorActionPreference = "Stop"

function Test-LaunchableExecutable([string]$Path) {
  if (-not $Path -or -not [System.IO.Path]::IsPathRooted($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $global:LASTEXITCODE = -12345
    & $Path --version *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

# npm global installs ship .cmd/.ps1/sh shims that wrap a real .exe under
# node_modules\@anthropic-ai\claude-code\bin\claude.exe. Node's spawn(shell:false)
# cannot execute the shims directly on Windows (EFTYPE for .ps1, EINVAL for .cmd),
# so follow a shim to the .exe it wraps and return that instead.
function Resolve-NpmShimExe([string]$ShimPath) {
  if (-not $ShimPath) { return $null }
  $dir = Split-Path -Parent $ShimPath

  # 1. Standard npm global layout.
  $standard = Join-Path $dir "node_modules\@anthropic-ai\claude-code\bin\claude.exe"
  if (Test-Path -LiteralPath $standard -PathType Leaf) { return $standard }

  # 2. Parse the shim for any referenced .exe (resilient to package renames).
  if (Test-Path -LiteralPath $ShimPath -PathType Leaf) {
    $content = Get-Content -LiteralPath $ShimPath -Raw -ErrorAction SilentlyContinue
    if ($content) {
      foreach ($m in [regex]::Matches($content, '[A-Za-z0-9@_./\\\-]+\.exe')) {
        $rel = ($m.Value -replace '/', '\').TrimStart('\', '/')
        if (-not $rel) { continue }
        $candidate = if ([System.IO.Path]::IsPathRooted($rel)) { $rel } else { Join-Path $dir $rel }
        try { $candidate = [System.IO.Path]::GetFullPath($candidate) } catch { continue }
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
      }
    }
  }
  return $null
}

function Get-Candidates {
  $list = [System.Collections.Generic.List[string]]::new()
  $explicit = $env:CLAUDE_EXECUTABLE
  if ($explicit) {
    $commands = Get-Command -Name $explicit -CommandType Application, ExternalScript -ErrorAction SilentlyContinue
    if ($commands) { foreach ($c in @($commands)) { $list.Add($(if ($c.Source) { $c.Source } else { $c.Path })) } }
    else { $list.Add($explicit) }
  } else {
    $commands = Get-Command -Name $CommandName -CommandType Application, ExternalScript -ErrorAction SilentlyContinue
    if ($commands) { foreach ($c in @($commands)) { $list.Add($(if ($c.Source) { $c.Source } else { $c.Path })) } }
  }
  return $list
}

$checked = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$found = $null
foreach ($candidate in (Get-Candidates)) {
  if (-not $candidate) { continue }
  $targets = @()
  $shimExe = Resolve-NpmShimExe $candidate
  if ($shimExe) { $targets += $shimExe }
  $targets += $candidate
  foreach ($target in $targets) {
    if (-not $target -or -not $checked.Add($target)) { continue }
    if (Test-LaunchableExecutable $target) { $found = $target; break }
  }
  if ($found) { break }
}

if ($found) { Write-Output $found; exit 0 }
if ($checked.Count -gt 0) {
  throw "Claude Code CLI candidates were found but none could be started. Set CLAUDE_EXECUTABLE to a launchable .exe."
}
throw "Claude Code CLI was not found. Install Claude Code (npm i -g @anthropic-ai/claude-code) or set CLAUDE_EXECUTABLE to an absolute .exe path."
