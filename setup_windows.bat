@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo  Speech Emotion Recognition - one-time setup
echo  Needs about 2 GB of free disk space (Python packages,
echo  website packages) plus 0.6 GB later for the dataset.
echo ============================================================

set "PYCMD="
where python >nul 2>&1 && set "PYCMD=python"
if not defined PYCMD ( where py >nul 2>&1 && set "PYCMD=py -3" )
if not defined PYCMD (
  echo [ERROR] Python was not found. Install Python 3.11 or 3.12 from https://www.python.org/downloads/
  echo         During install, tick "Add python.exe to PATH". Then run this file again.
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install the LTS version from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
%PYCMD% -c "import sys; sys.exit(0 if (3,10)<=sys.version_info[:2]<=(3,13) else 1)"
if errorlevel 1 (
  echo [WARNING] Your Python version is outside 3.10 to 3.13, the range this project was prepared for.
  echo           If package installation fails, install Python 3.12 and try again.
)

echo.
echo [1/3] Creating the Python virtual environment in backend\.venv ...
if not exist "backend\.venv\Scripts\python.exe" (
  %PYCMD% -m venv "backend\.venv"
  if errorlevel 1 (
    echo [ERROR] Could not create the virtual environment.
    pause
    exit /b 1
  )
)

echo.
echo [2/3] Installing Python packages. This can take a few minutes ...
"backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
"backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements-dev.txt"
"backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements-transcription.txt"
if errorlevel 1 (
  echo [ERROR] Python package installation failed. See the README troubleshooting section.
  pause
  exit /b 1
)

echo.
echo [3/3] Installing website packages ...
pushd "frontend"
call npm install --no-audit --no-fund
if errorlevel 1 (
  popd
  echo [ERROR] npm install failed. See the README troubleshooting section.
  pause
  exit /b 1
)
popd

echo.
echo ============================================================
echo  Setup finished. Next steps:
echo    1. download_dataset.bat   (downloads and verifies CREMA-D)
echo    2. train_model.bat
echo    3. run_project.bat
echo  Run doctor.bat at any time to check your installation.
echo ============================================================
pause
