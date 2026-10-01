@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PDF Atolye
if not exist ".venv\Scripts\python.exe" (
    echo Ilk kurulum yapiliyor, bu birkac dakika surebilir...
    python -m venv .venv || goto :error
    ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :error
".venv\Scripts\python.exe" run.py %*
goto :eof

:error
echo.
echo Kurulum basarisiz oldu. Python 3.12 veya ustunun kurulu oldugundan emin ol.
pause
