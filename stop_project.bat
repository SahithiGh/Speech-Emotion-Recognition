@echo off
echo Stopping Speech Emotion Recognition servers ...
taskkill /FI "WINDOWTITLE eq SER Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SER Frontend*" /T /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /PID %%a /T /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr LISTENING') do taskkill /PID %%a /T /F >nul 2>&1
echo Done.
pause
