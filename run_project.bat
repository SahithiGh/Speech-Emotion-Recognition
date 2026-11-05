@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\.venv\Scripts\python.exe" goto need_setup
if not exist "frontend\node_modules" goto need_setup

netstat -ano | findstr ":8000 " | findstr LISTENING >nul
if not errorlevel 1 goto port_busy
netstat -ano | findstr ":5173 " | findstr LISTENING >nul
if not errorlevel 1 goto port_busy

if not exist "models\emotion_model.joblib" echo NOTE: no trained model yet. The website will say so. Run train_model.bat to train.
set SER_TRANSCRIBER=faster-whisper
echo Starting backend  at http://127.0.0.1:8000 ...
start "SER Backend" /D "%~dp0backend" cmd /k "set SER_TRANSCRIBER=faster-whisper && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
echo Starting website  at http://localhost:5173 ...
start "SER Frontend" /D "%~dp0frontend" cmd /k "npm run dev"
echo Waiting for the servers to start ...
timeout /t 8 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo The app is running in two windows named SER Backend and SER Frontend.
echo To stop it, run stop_project.bat or close those two windows.
exit /b 0

:need_setup
echo [ERROR] Setup has not been run. Double-click setup_windows.bat first.
pause
exit /b 1

:port_busy
echo [ERROR] Port 8000 or 5173 is already in use. The app may already be running.
echo         Open http://localhost:5173 or run stop_project.bat first.
pause
exit /b 1
