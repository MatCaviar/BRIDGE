@echo off
REM Quick Test Script for E2E Test Runner
REM Runs automated tests without interactive input

echo ========================================
echo MCP E2E Quick Tests
echo ========================================
echo.
echo Testing with model: %QWEN_MODEL:qwen3.6-flash%
echo.

REM Change to e2e-test-runner directory
cd /d "%~dp0e2e-test-runner"

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if PyYAML is installed
python -c "import yaml" >nul 2>&1
if errorlevel 1 (
    echo Installing PyYAML dependency...
    pip install pyyaml
)

REM Test 1: Initialization
echo [1/2] Running initialization test...
python test_init.py
if errorlevel 1 (
    echo FAILED: Initialization test
    pause
    exit /b 1
)
echo PASSED: Initialization test
echo.

REM Test 2: Full E2E flow
echo [2/2] Running full E2E flow test...
python test_e2e.py
if errorlevel 1 (
    echo FAILED: E2E flow test
    pause
    exit /b 1
)
echo PASSED: E2E flow test
echo.

echo ========================================
echo All tests PASSED!
echo ========================================
echo.
echo Run 'run-e2e.bat' for interactive testing.
pause
