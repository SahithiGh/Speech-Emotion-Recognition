@echo off
setlocal
cd /d "%~dp0"
set "PY=backend\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" scripts\doctor.py
pause
