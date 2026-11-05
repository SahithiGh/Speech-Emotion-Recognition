@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\.venv\Scripts\python.exe" (
  echo [ERROR] Setup has not been run. Double-click setup_windows.bat first.
  pause
  exit /b 1
)
if not exist "models\emotion_model.joblib" (
  echo [ERROR] No trained model found. Run train_model.bat first.
  pause
  exit /b 1
)
echo Re-scoring the saved model on the saved held-out test speakers ...
pushd "backend"
".venv\Scripts\python.exe" evaluate.py
set RESULT=%ERRORLEVEL%
popd
echo.
if %RESULT%==0 ( echo Evaluation finished. Results are in outputs\metrics.json ) else ( echo Evaluation did NOT finish. Read the message above. )
pause
exit /b %RESULT%
