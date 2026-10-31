@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Cookie Clicker Bot - Uninstall

echo ============================================================
echo   Cookie Clicker Bot   アンインストール
echo ============================================================
echo.
echo   削除されるもの:
echo     [1] 仮想環境 .venv  ^(追加インストールしたライブラリ一式^)
echo     [2] Playwright がダウンロードしたブラウザ本体 ^(任意^)
echo.
echo   残るもの ^(後で確認します^):
echo     - config.json ^(設定^)
echo     - logs\       ^(ログ^)
echo     - saves\      ^(セーブのバックアップ^)
echo     - browser_profile\ ^(ゲームの進行データ / localStorage^)
echo.
echo   ※ ボットが起動中の場合は、先にそのウィンドウを閉じてください。
echo.

choice /c YN /n /m "アンインストールを実行しますか? [Y=はい / N=やめる] "
if errorlevel 2 (
  echo.
  echo 中止しました。何も削除していません。
  pause
  exit /b 0
)
echo.

set DELBROWSER=N
if exist "%LOCALAPPDATA%\ms-playwright" (
  choice /c YN /n /m "Playwright のブラウザ本体も削除しますか? ^(数百MB 解放されます^) [Y=削除 / N=残す] "
  if not errorlevel 2 set DELBROWSER=Y
)
echo.

rem ---------------------------------------------------------- 仮想環境内での処理
if exist ".venv\Scripts\python.exe" (
  call ".venv\Scripts\activate.bat"

  if "!DELBROWSER!"=="Y" (
    echo [1/4] Playwright のブラウザを削除しています...
    python -m playwright uninstall --all
    if errorlevel 1 echo        ^(uninstall コマンド非対応のバージョンのため、フォルダを直接削除します^)
  ) else (
    echo [1/4] ブラウザ本体は残します
  )

  echo [2/4] ライブラリをアンインストールしています...
  python -m pip uninstall -y playwright
  python -m pip uninstall -y greenlet pyee
  python -m pip uninstall -y -r requirements.txt 2>nul
  call deactivate 2>nul
) else (
  echo [1/4] 仮想環境が見つからないためスキップします
  echo [2/4] ライブラリのアンインストールはスキップします
)

echo [3/4] 仮想環境フォルダ .venv を削除しています...
if exist ".venv" rmdir /s /q ".venv"

echo [4/4] ブラウザキャッシュフォルダを削除しています...
if "!DELBROWSER!"=="Y" if exist "%LOCALAPPDATA%\ms-playwright" rmdir /s /q "%LOCALAPPDATA%\ms-playwright"

rem ---------------------------------------------------------- Python のキャッシュ
if exist "__pycache__" rmdir /s /q "__pycache__"
if exist "ccbot\__pycache__" rmdir /s /q "ccbot\__pycache__"

echo.
echo ------------------------------------------------------------
echo   追加ライブラリのアンインストールが完了しました。
echo ------------------------------------------------------------
echo.
choice /c YN /n /m "設定・ログ・セーブ・ゲーム進行データも全て削除しますか? [Y=全部消す / N=残す] "
if errorlevel 2 (
  echo.
  echo データは残しました。もう一度このボットを使うときは install.bat を実行してください。
  goto :end
)

echo.
echo データを削除しています...
if exist "logs" rmdir /s /q "logs"
if exist "saves" rmdir /s /q "saves"
if exist "browser_profile" rmdir /s /q "browser_profile"
if exist "config.json" del /q "config.json"
echo 全てのデータを削除しました。完全にクリーンな状態です。

:end
echo.
pause
endlocal
