[CmdletBinding()]
param(
  [string]$CommandName = "codex.exe",
  [string]$VsCodeExtensionsRoot
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

function Add-VsCodeCandidates([System.Collections.Generic.List[string]]$Candidates, [string]$Root) {
  if (-not $Root -or -not (Test-Path -LiteralPath $Root -PathType Container)) { return }
  Get-ChildItem -LiteralPath $Root -Directory -Filter "openai.chatgpt-*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object {
      $Candidates.Add((Join-Path $_.FullName "bin\windows-x86_64\codex.exe"))
      $Candidates.Add((Join-Path $_.FullName "bin\windows-arm64\codex.exe"))
    }
}

$candidates = [System.Collections.Generic.List[string]]::new()
$explicit = $env:CODEX_EXECUTABLE
if ($explicit) {
  $command = Get-Command -Name $explicit -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($command) { $candidates.Add($(if ($command.Source) { $command.Source } else { $command.Path })) }
  else { $candidates.Add($explicit) }
} else {
  if ($PSBoundParameters.ContainsKey("VsCodeExtensionsRoot")) {
    Add-VsCodeCandidates $candidates $VsCodeExtensionsRoot
  } elseif ($CommandName -eq "codex.exe") {
    Add-VsCodeCandidates $candidates (Join-Path $env:USERPROFILE ".vscode\extensions")
    Add-VsCodeCandidates $candidates (Join-Path $env:USERPROFILE ".vscode-insiders\extensions")
  }

  $command = Get-Command -Name $CommandName -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($command) { $candidates.Add($(if ($command.Source) { $command.Source } else { $command.Path })) }

  if ($CommandName -eq "codex.exe") {
    Get-Process -Name codex -ErrorAction SilentlyContinue | ForEach-Object {
      try { if ($_.Path) { $candidates.Add($_.Path) } } catch { }
    }
    if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
      Get-AppxPackage -Name "OpenAI.Codex" -ErrorAction SilentlyContinue |
        Sort-Object Version -Descending |
        ForEach-Object { $candidates.Add((Join-Path $_.InstallLocation "app\resources\codex.exe")) }
    }
  }
}

$checked = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($candidate in $candidates) {
  if (-not $candidate -or -not $checked.Add($candidate)) { continue }
  if (Test-LaunchableExecutable $candidate) {
    Write-Output $candidate
    exit 0
  }
}

if ($checked.Count -gt 0) {
  throw "Codex CLI candidates were found but none could be started. Set CODEX_EXECUTABLE to a launchable CLI, such as the one bundled with the VS Code OpenAI extension."
}
throw "Codex CLI was not found. Install the OpenAI VS Code extension or set CODEX_EXECUTABLE to an absolute executable path."
