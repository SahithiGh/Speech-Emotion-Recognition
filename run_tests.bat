@echo off
setlocal
cd /d "%~dp0"
pushd "backend"
".venv\Scripts\python.exe" -m pytest tests -q
popd
pushd "frontend"
call npm run build
popd
pause
