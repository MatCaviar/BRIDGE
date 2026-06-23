@echo off
cd /d "%~dp0e2e-test-runner"

REM Python interpreter check
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found in PATH. Install Python 3.10+.
    pause & exit /b 1
)

REM Ensure pip exists (some venvs are created without it)
python -m pip --version >nul 2>&1
if errorlevel 1 (
    python -m ensurepip --upgrade >nul 2>&1
)

REM Install dependencies if missing (python -m pip matches the interpreter)
python -c "import yaml, openai, tiktoken, json_repair" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    python -m pip install -r requirements.txt
)

REM Run interactive E2E runner
python interactive.py

if errorlevel 1 (
    echo ERROR: runner exited with code %errorlevel%
    pause
)
