#!/usr/bin/env python3
"""Cookie Clicker Bot 起動エントリポイント.

使い方:
    python run.py                 # 普通に起動
    python run.py --headless      # 画面を出さない
    python run.py --no-server     # 管理画面を出さない
    python run.py --port 9000     # 管理画面のポート変更
    python run.py --doctor        # 動作環境の診断だけ行う
"""
from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import threading
import time
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ccbot import __version__  # noqa: E402
from ccbot.config import Config  # noqa: E402
from ccbot.engine import Engine  # noqa: E402
from ccbot.log import ActionLogger, StatsLogger, cleanup_old_logs, setup_logging  # noqa: E402
from ccbot.paths import BASE_DIR, ensure_dirs  # noqa: E402
from ccbot.server import AdminServer  # noqa: E402

log = logging.getLogger("ccbot")

BANNER = r"""
   ____              _   ____                      _
  / ___|___   ___   | |_/ ___|  ___  ___ _ __ ___ | |_ ___  _ __
 | |   / _ \ / _ \  | '_ \___ \ / _ \/ __| '_ ` _ \| __/ _ \| '__|
 | |__| (_) | (_) | | (_) |__) |  __/ (__| | | | | | || (_) | |
  \____\___/ \___/  |_.__/____/ \___|\___|_| |_| |_|\__\___/|_|
                        A U T O M A T I O N   B O T
"""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Cookie Clicker 自動化ボット")
    p.add_argument("--config", default=None, help="設定ファイルのパス (既定: ./config.json)")
    p.add_argument("--host", default=None, help="管理画面のバインド先 (既定: 127.0.0.1)")
    p.add_argument("--port", type=int, default=None, help="管理画面のポート (既定: 8765)")
    p.add_argument("--headless", action="store_true", help="ブラウザを非表示で動かす")
    p.add_argument("--no-server", action="store_true", help="管理画面を起動しない")
    p.add_argument("--no-open", action="store_true", help="管理画面を自動で開かない")
    p.add_argument("--url", default=None, help="ゲームの URL")
    p.add_argument("--channel", default=None, help="ブラウザチャネル (chrome / msedge / auto)")
    p.add_argument("--profile", default=None, help="ブラウザプロファイルの保存先")
    p.add_argument("--doctor", action="store_true", help="動作環境の診断のみ")
    p.add_argument("--version", action="version", version=f"ccbot {__version__}")
    return p.parse_args(argv)


def doctor() -> int:
    print("=" * 60)
    print(" Cookie Clicker Bot - 環境診断")
    print("=" * 60)
    ok = True

    print(f"[1] Python       : {sys.version.split()[0]}  ({sys.executable})")
    if sys.version_info < (3, 9):
        print("    -> Python 3.9 以上が必要です")
        ok = False

    try:
        import playwright  # noqa: F401
        from playwright.sync_api import sync_playwright  # noqa: F401
        print("[2] Playwright   : インストール済み")
    except Exception as exc:  # noqa: BLE001
        print(f"[2] Playwright   : 未インストール ({exc})")
        print("    -> install.bat を実行してください (pip install -r requirements.txt)")
        return 1

    # ブラウザの実体を確認
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            exe = pw.chromium.executable_path
            exists = bool(exe) and Path(exe).exists()
            print(f"[3] Chromium     : {'見つかりました' if exists else '見つかりません'}")
            if not exists:
                print("    -> python -m playwright install chromium  が必要です")
                print("       (install.bat を再実行してください)")
                ok = False
            else:
                print(f"    path: {exe}")
    except Exception as exc:  # noqa: BLE001
        print(f"[3] Chromium     : 確認に失敗 ({exc})")
        ok = False

    for name in ("chrome", "msedge"):
        found = _find_channel(name)
        print(f"[4] {name:11s}: {'利用可能' if found else '見つからず'}" + (f" ({found})" if found else ""))

    ensure_dirs()
    from ccbot.paths import CONFIG_FILE, JS_DIR, WEB_DIR
    print(f"[5] プロジェクト   : {BASE_DIR}")
    print(f"    config.json  : {'あり' if CONFIG_FILE.exists() else 'なし (初回起動時に作成)'}")
    print(f"    JS エンジン  : {len(list(JS_DIR.glob('*.js')))} ファイル")
    print(f"    管理画面     : {'あり' if (WEB_DIR / 'index.html').exists() else 'なし'}")
    if not (WEB_DIR / "index.html").exists():
        ok = False

    print("=" * 60)
    print(" 結果:", "問題ありません。start_bot.bat で起動できます。" if ok else "上記の問題を解決してください。")
    print("=" * 60)
    return 0 if ok else 2


def _find_channel(name: str) -> str:
    candidates = {
        "chrome": [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
            "/usr/bin/google-chrome",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ],
        "msedge": [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            "/usr/bin/microsoft-edge",
        ],
    }
    for c in candidates.get(name, []):
        if c and Path(c).exists():
            return c
    return ""


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.doctor:
        return doctor()

    ensure_dirs()
    cfg = Config(args.config)
    cfg.load()

    # CLI 引数で設定を上書き
    patch: dict = {}
    if args.headless:
        patch.setdefault("browser", {})["headless"] = True
    if args.url:
        patch.setdefault("browser", {})["url"] = args.url
    if args.channel:
        patch.setdefault("browser", {})["channel"] = args.channel
    if args.profile:
        patch.setdefault("browser", {})["userDataDir"] = args.profile
    if args.host or args.port or args.no_server or args.no_open:
        s = patch.setdefault("server", {})
        if args.host:
            s["host"] = args.host
        if args.port:
            s["port"] = int(args.port)
        if args.no_server:
            s["enabled"] = False
        if args.no_open:
            s["openBrowser"] = False
    if patch:
        cfg.update(patch)

    setup_logging(cfg.data)
    print(BANNER)

    actions = ActionLogger(
        ring_size=int(cfg.get("logging", "ringBuffer", default=3000)),
        jsonl=bool(cfg.get("logging", "actionJsonl", default=True)),
        text=bool(cfg.get("logging", "actionText", default=True)),
    )
    stats = StatsLogger()

    removed = cleanup_old_logs(int(cfg.get("logging", "keepDays", default=30)))
    if removed:
        log.info("古いログを %d 件削除しました", removed)

    engine = Engine(cfg, actions, stats)

    server: AdminServer | None = None
    if cfg.get("server", "enabled", default=True):
        server = AdminServer(
            engine, cfg, actions,
            host=str(cfg.get("server", "host", default="127.0.0.1")),
            port=int(cfg.get("server", "port", default=8765)),
        )
        if not server.start():
            log.warning("管理画面を起動できませんでした。ボット自体は動作を続けます。")
            server = None

    def _sig(signum, _frame):  # noqa: ANN001
        log.info("シグナル %s を受け取りました", signum)
        engine.request_stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _sig)
        except (ValueError, OSError):
            pass

    if server and cfg.get("server", "openBrowser", default=True):
        threading.Timer(2.5, lambda: _open_browser(server.url)).start()

    log.info("管理画面: %s", server.url if server else "(無効)")
    log.info("ログ出力先: %s", BASE_DIR / "logs")
    log.info("停止するには Ctrl+C を押すか、管理画面の [停止] を使ってください")

    try:
        rc = engine.run()
    finally:
        if server:
            server.stop()
    return rc


def _open_browser(url: str) -> None:
    try:
        webbrowser.open(url)
        log.info("ブラウザで管理画面を開きました: %s", url)
    except Exception as exc:  # noqa: BLE001
        log.warning("管理画面を自動で開けませんでした (%s) - %s を手動で開いてください", exc, url)


if __name__ == "__main__":
    sys.exit(main())
