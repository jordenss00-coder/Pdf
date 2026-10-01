@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv || goto :error
)
".venv\Scripts\python.exe" -m pip install -r requirements-desktop.txt || goto :error
start "" ".venv\Scripts\pythonw.exe" desktop.py
exit /b 0
:error
echo Masaustu kurulumu tamamlanamadi. Python 3.12 x64 onerilir.
pause
