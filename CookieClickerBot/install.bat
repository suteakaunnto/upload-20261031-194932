@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Cookie Clicker Bot - Setup

echo ============================================================
echo   Cookie Clicker Bot   セットアップ (追加ライブラリの導入)
echo ============================================================
echo.

rem ---------------------------------------------------------- Python 確認
where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python が見つかりません。
  echo.
  echo   1^) https://www.python.org/downloads/ から Python 3.9 以上を入手
  echo   2^) インストール時に必ず「Add python.exe to PATH」にチェック
  echo   3^) この install.bat をもう一度実行
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [OK] Python を確認しました: %PYVER%
echo.

rem ---------------------------------------------------------- 仮想環境
if not exist ".venv\Scripts\python.exe" (
  echo [1/4] 仮想環境 .venv を作成しています...
  python -m venv .venv
  if errorlevel 1 (
    echo [ERROR] 仮想環境の作成に失敗しました。
    pause
    exit /b 1
  )
) else (
  echo [1/4] 仮想環境 .venv は既にあります ^(スキップ^)
)
call ".venv\Scripts\activate.bat"
if errorlevel 1 (
  echo [ERROR] 仮想環境の有効化に失敗しました。
  pause
  exit /b 1
)
echo.

rem ---------------------------------------------------------- pip / ライブラリ
echo [2/4] pip を最新化しています...
python -m pip install --upgrade pip --quiet
echo.

echo [3/4] 追加ライブラリをインストールしています... ^(playwright^)
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [ERROR] ライブラリのインストールに失敗しました。
  echo   ネットワーク接続を確認して、もう一度 install.bat を実行してください。
  pause
  exit /b 1
)
echo.

rem ---------------------------------------------------------- ブラウザ
echo [4/4] 操作用ブラウザ Chromium をダウンロードしています... ^(初回のみ 約 150MB^)
python -m playwright install chromium
if errorlevel 1 (
  echo.
  echo [WARN] Chromium のダウンロードに失敗しました。
  echo        Google Chrome / Microsoft Edge がインストール済みなら、
  echo        それでも動作します。config.json の browser.channel を
  echo        "chrome" または "msedge" に変更してください。
) else (
  echo [OK] Chromium の準備ができました。
)
echo.

rem ---------------------------------------------------------- 診断
echo ------------------------------------------------------------
echo   環境診断を実行します...
echo ------------------------------------------------------------
python run.py --doctor
echo.
echo ============================================================
echo   セットアップ完了
echo.
echo   起動     :  start_bot.bat
echo   管理画面 :  http://127.0.0.1:8765/
echo   削除     :  uninstall.bat
echo ============================================================
echo.
pause
endlocal
