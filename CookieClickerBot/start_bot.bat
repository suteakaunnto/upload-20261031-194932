@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Cookie Clicker Bot

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] 仮想環境 .venv が見つかりません。
  echo         先に install.bat を実行してください。
  echo.
  pause
  exit /b 1
)

call ".venv\Scripts\activate.bat"

echo ============================================================
echo   Cookie Clicker Bot を起動します
echo.
echo     管理画面 : http://127.0.0.1:8765/
echo     ログ     : logs\ フォルダ
echo     停止     : このウィンドウで Ctrl+C  または  管理画面の [停止]
echo ============================================================
echo.

python run.py %*
set RC=%errorlevel%

echo.
if not "%RC%"=="0" (
  echo [!] ボットが終了コード %RC% で停止しました。
  echo     原因は logs\ccbot.log と logs\error.log を確認してください。
  echo     よくある原因:
  echo       - install.bat を実行していない
  echo       - ネットワークに繋がらずゲームを読み込めない
  echo       - ポート 8765 が他のプログラムに使われている
  echo         ^(→  start_bot.bat --port 8766  で変更できます^)
  echo.
  pause
)
endlocal
exit /b %RC%
