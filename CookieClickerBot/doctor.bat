@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Cookie Clicker Bot - Doctor

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] 仮想環境 .venv が見つかりません。先に install.bat を実行してください。
  echo.
  echo   参考: システムの Python で診断する場合は
  echo         python run.py --doctor
  echo   を実行してください。
  echo.
  pause
  exit /b 1
)

call ".venv\Scripts\activate.bat"
python run.py --doctor
echo.
pause
endlocal
