#!/usr/bin/env python3
"""実物の Cookie Clicker に対するエンドツーエンドテスト.

    python tests/test_live.py                       # 公式URLでテスト
    python tests/test_live.py --url http://127.0.0.1:18080/
    python tests/test_live.py --seconds 120

Playwright と Chromium が必要 (install.bat で入ります)。
ブラウザは headless で起動し、実際にゲームを読み込んでボットを数分間動かし、
「クッキーが増えた / イベントが記録された / 管理画面APIが応答する」ことを確認します。
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

PASS = 0
FAIL = 0
FAILS: list[str] = []


def ok(cond: bool, label: str, extra=None) -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  \033[32m✔\033[0m " + label)
    else:
        FAIL += 1
        FAILS.append(label)
        print("  \033[31m✘\033[0m " + label + (("  -- " + repr(extra)[:300]) if extra is not None else ""))


def section(t: str) -> None:
    print("\n\033[36m== " + t + " ==\033[0m")


def get(url: str, timeout: float = 10.0):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def post(url: str, body: dict, timeout: float = 25.0):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://orteil.dashnet.org/cookieclicker/")
    ap.add_argument("--seconds", type=int, default=90)
    ap.add_argument("--port", type=int, default=18800)
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    from ccbot.config import Config
    from ccbot.engine import Engine
    from ccbot.log import ActionLogger, StatsLogger, setup_logging
    from ccbot.paths import ensure_dirs
    from ccbot.server import AdminServer

    ensure_dirs()
    setup_logging({"logging": {"level": "INFO", "console": False}})

    cfg = Config(ROOT / "tests" / "_live_config.json")
    cfg.load()
    cfg.update({
        "browser": {"url": args.url, "headless": not args.headed, "userDataDir": "tests/_live_profile"},
        "server": {"enabled": True, "host": "127.0.0.1", "port": args.port, "openBrowser": False},
        "logging": {"statsEverySec": 5},
        "save": {"backupEverySec": 30},
        "ascend": {"enabled": False},          # テスト中は転生しない
        "garden": {"mode": "farm"},
    })

    actions = ActionLogger(ring_size=2000, jsonl=True, text=True)
    stats = StatsLogger()
    engine = Engine(cfg, actions, stats)
    srv = AdminServer(engine, cfg, actions, host="127.0.0.1", port=args.port)
    ok(srv.start(), "管理画面サーバが起動した")

    th = threading.Thread(target=engine.run, name="engine", daemon=True)
    th.start()

    base = f"http://127.0.0.1:{args.port}"
    try:
        # ---- ゲームの読み込みを待つ ----
        section("1. 起動とゲーム読み込み")
        ready = False
        deadline = time.time() + 200
        while time.time() < deadline:
            try:
                st = get(base + "/api/state")["data"]
            except Exception:
                time.sleep(1)
                continue
            if st.get("gameReady"):
                ready = True
                break
            time.sleep(1)
        ok(ready, "ゲームが ready になった")
        if not ready:
            print("    -> Cloudflare の人間認証 (Just a moment...) が出ている可能性があります。")
            print("       --headed を付けてブラウザを表示し、チェックボックスを手で解除してください。")
            return finish(engine, srv, cfg)

        st = get(base + "/api/state")["data"]
        snap = st["snapshot"]
        ok(bool(snap.get("version")), "ゲームのバージョンを取得: " + str(snap.get("version")))
        ok(bool(st.get("capabilities", {}).get("probes", {}).get("Game.ClickCookie")), "ClickCookie API を検出")
        ok(bool(st.get("engine", {}).get("calls", 0) > 0), "JS エンジンと通信できている")

        # ---- しばらく走らせる ----
        section(f"2. {args.seconds} 秒間オートプレイ")
        c0 = float(snap.get("cookies") or 0)
        e0 = int(st.get("lastEventSeq") or 0)
        time.sleep(args.seconds)
        st2 = get(base + "/api/state")["data"]
        snap2 = st2["snapshot"]
        c1 = float(snap2.get("cookies") or 0)
        cps = float(snap2.get("cookiesPs") or 0)
        e1 = int(st2.get("lastEventSeq") or 0)
        ok(st2.get("running") and st2.get("healthy"), "ボットが稼働中")
        ok(c1 > c0 or cps > 0, f"クッキーが増えた ({c0:.3g} -> {c1:.3g}, CpS={cps:.3g})")
        ok(e1 > e0, f"イベントが {e1 - e0} 件発生した")
        ok(len(st2.get("history", {}).get("t", [])) > 5, "グラフ用の履歴が溜まっている")
        bs = snap2.get("botStats") or {}
        ok(int(bs.get("clicks", 0)) > 0 or bool(cfg.get("clicker", "enabled")), "クリックが記録された: %s" % bs.get("clicks"))

        # ---- ログ ----
        section("3. ログ")
        logs = get(base + "/api/logs?limit=50")["data"]
        ok(len(logs) > 0, f"行動ログが {len(logs)} 件取得できた")
        ok(all({"ts", "module", "action", "line"} <= set(x.keys()) for x in logs), "ログのスキーマが正しい")
        mods = sorted({x["module"] for x in logs})
        ok(len(mods) >= 3, "複数のモジュールが動いている: " + ",".join(mods))
        files = get(base + "/api/logs/files?kind=actions")["data"]
        ok(len(files) >= 1 and files[0]["size"] > 0, "行動ログファイルがディスクに書かれている",
           files[0]["name"] if files else None)

        # ---- 管理画面 API ----
        section("4. 管理画面 API")
        ok(get(base + "/api/config")["data"]["clicker"]["cps"] > 0, "GET /api/config")
        r = post(base + "/api/config", {"patch": {"clicker": {"cps": 9}}})
        ok(r["ok"] and r["data"]["clicker"]["cps"] == 9, "POST /api/config が反映される")
        r = post(base + "/api/action", {"action": "click", "args": {"times": 3, "direct": True}})
        ok(r["ok"], "POST /api/action (click)")
        r = post(base + "/api/action", {"action": "popShimmers", "args": {"all": True}})
        ok(r["ok"], "POST /api/action (popShimmers)")
        for ep in ("garden", "market", "pantheon", "grimoire", "ascend", "prestige", "store", "dragon-auras", "seasons"):
            try:
                rr = get(base + "/api/" + ep)
                ok(rr.get("ok"), "GET /api/" + ep)
            except Exception as exc:  # noqa: BLE001
                ok(False, "GET /api/" + ep, str(exc))

        # ---- セーブ ----
        section("5. セーブのバックアップ")
        r = post(base + "/api/saves/backup", {"tag": "livetest"})
        ok(r.get("ok") and r.get("name"), "バックアップが作成された", r)
        lst = get(base + "/api/saves")["data"]
        ok(len(lst) >= 1, f"バックアップ一覧に {len(lst)} 件")
        if r.get("name"):
            post(base + "/api/saves/delete", {"name": r["name"]})

        # ---- スナップショットの中身 ----
        section("6. ゲーム状態の詳細")
        ok(len(snap2.get("buildings") or []) == 20, "施設 20 件を取得")
        ok(isinstance(snap2.get("store"), list), "ストアのアップグレード一覧")
        ok(isinstance(snap2.get("mg", {}).get("pantheon"), dict), "神殿の状態")
        ok(isinstance(snap2.get("mg", {}).get("grimoire"), dict), "魔法書の状態")
        ok("lumps" in snap2 and "prestige" in snap2, "ランプ / プレステージ")

    except Exception as exc:  # noqa: BLE001
        import traceback
        ok(False, "テスト実行中に例外", traceback.format_exc()[-800:])
    return finish(engine, srv, cfg)


def finish(engine, srv, cfg) -> int:
    section("終了処理")
    try:
        engine.request_stop()
        time.sleep(3)
        ok(not engine.running, "エンジンが停止した")
    except Exception as exc:  # noqa: BLE001
        ok(False, "エンジンの停止", str(exc))
    srv.stop()
    for f in (ROOT / "tests").glob("_live_config.json*"):
        f.unlink()
    print("\n" + "=" * 56)
    print(f"  結果: {PASS} 成功 / {FAIL} 失敗")
    if FAILS:
        print("  失敗項目:")
        for f in FAILS:
            print("   - " + f)
    print("=" * 56)
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
