@echo off
setlocal
cd /d "%~dp0"
set "PY=backend\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
echo Downloading the official CREMA-D audio (about 610 MB) and verifying every file.
echo You can stop with Ctrl+C and run this file again; it resumes.
echo.
"%PY%" scripts\download_crema_d.py %*
if errorlevel 1 (
  echo.
  echo The download did not finish. Read the message above, then run download_dataset.bat again.
  pause
  exit /b 1
)
echo.
"%PY%" scripts\check_dataset.py --deep
pause
