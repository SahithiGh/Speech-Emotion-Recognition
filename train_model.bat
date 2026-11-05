@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\.venv\Scripts\python.exe" (
  echo [ERROR] Setup has not been run. Double-click setup_windows.bat first.
  pause
  exit /b 1
)
echo Training on the verified CREMA-D audio in data\AudioWAV ...
echo The first run extracts features from about 7,400 clips; later runs reuse a cache.
echo Options: train_model.bat --deep-verify   (also check every file hash)
echo          train_model.bat --jobs 2        (use fewer CPU cores)
echo.
pushd "backend"
".venv\Scripts\python.exe" train.py %*
set RESULT=%ERRORLEVEL%
popd
echo.
if %RESULT%==0 (
  echo Training finished. Now run run_project.bat
) else (
  echo Training did NOT finish. Read the message above.
)
pause
exit /b %RESULT%
