: << 'CMDBLOCK'
@echo off
REM Polyglot: runs .sh cross-platform. Usage: run-hook.cmd <script.sh> [args]
set "BASH="
for /f "delims=" %%G in ('where bash 2^>nul') do (set "BASH=%%G" & goto :found)
if exist "C:\Program Files\Git\bin\bash.exe" set "BASH=C:\Program Files\Git\bin\bash.exe"
:found
if not defined BASH (echo [im-mcp] bash not found on PATH or Git install dir >&2 & exit /b 1)
"%BASH%" -l "%~dp0%~1" %2 %3 %4 %5
exit /b
CMDBLOCK
# Unix shell runs from here
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"; shift
"${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
