#!/usr/bin/env python3
"""Python 側の統合テスト (Playwright 不要).

    python tests/test_python.py
"""
from __future__ import annotations

import json
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ccbot.config import DEFAULT_CONFIG, Config, deep_merge  # noqa: E402
from ccbot.log import ActionLogger, StatsLogger, cleanup_old_logs, log_files, read_log_file, setup_logging  # noqa: E402
from ccbot.paths import LOG_ACTIONS_DIR, LOG_DIR, LOG_STATS_DIR, SAVE_DIR, WEB_DIR, ensure_dirs, js_bundle  # noqa: E402
from ccbot.saves import SaveManager  # noqa: E402
from ccbot.server import AdminServer  # noqa: E402

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
        print("  \033[31m✘\033[0m " + label + (("  -- " + repr(extra)) if extra is not None else ""))


def section(t: str) -> None:
    print("\n\033[36m== " + t + " ==\033[0m")


class FakeEngine:
    """Engine のインタフェースだけを真似る."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.started_at = time.time()
        self.calls: list[tuple[str, dict]] = []
        self.saves = SaveManager(keep=5)
        self.actions: list[str] = []

    def public_state(self) -> dict:
        return {
            "running": True, "healthy": True, "gameReady": True,
            "startedAt": self.started_at, "uptimeSec": 12.3,
            "snapshot": {"cookies": 1234567.0, "cookiesPs": 42.0, "prestige": 3, "heavenlyChips": 5,
                         "lumps": 7, "ready": True, "version": "2.052", "buildings": [], "store": [],
                         "buffs": [], "shimmers": [], "wrinklers": {}, "mg": {}, "permanentUpgrades": [],
                         "fps": 30, "gameT": 100, "mouseCps": 1.2, "buildingsOwned": 10,
                         "upgradesOwned": 4, "ascensions": 1, "botStats": {"clicks": 100}, "ascendInfo": {},
                         "moduleSchedule": [{"name": "clicker", "ms": 0, "enabled": True, "lastRun": 10}],
                         "pendingAscend": None},
            "capabilities": {"game": True, "probes": {"Game.ClickCookie": True}},
            "modules": [], "history": {"t": [1, 2], "cookies": [1, 2], "cps": [1, 2], "prestige": [1, 2]},
            "engine": {"calls": 10, "errors": 0, "consecutiveErrors": 0, "lastOk": time.time(), "reloads": 0},
            "lastEventSeq": 5, "lastBackup": {"at": time.time(), "name": "save-x.txt"},
            "lastError": "", "botStats": {"clicks": 100},
        }

    def submit(self, action: str, args: dict | None = None, timeout: float | None = None) -> dict:
        self.calls.append((action, args or {}))
        if action == "__list_saves":
            return {"ok": True, "data": self.saves.list()}
        if action == "__backup":
            p = self.saves.write("FAKECODE" * 20, str((args or {}).get("tag", "manual")))
            return {"ok": bool(p), "name": p.name if p else None}
        if action == "__restore":
            return {"ok": True, "data": {"ok": True}}
        if action == "__delete_save":
            return {"ok": self.saves.delete(str((args or {}).get("name", "")))}
        if action == "__read_save":
            try:
                return {"ok": True, "data": {"code": self.saves.read(str((args or {}).get("name", "")))}}
            except Exception as exc:  # noqa: BLE001
                return {"ok": False, "error": str(exc)}
        if action == "__reload_page":
            return {"ok": True}
        if action == "__push_config":
            return {"ok": True}
        self.actions.append(action)
        return {"ok": True, "name": action, "data": {"ok": True, "echo": args}}

    def apply_config(self, patch: dict) -> dict:
        return self.cfg.update(patch)

    def request_stop(self) -> None:
        self.actions.append("__stop")


def http(method: str, url: str, body: dict | None = None, raw: bool = False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            text = r.read().decode("utf-8", "replace")
            return r.status, r.headers.get("Content-Type", ""), (text if raw else json.loads(text))
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        try:
            return e.code, e.headers.get("Content-Type", ""), json.loads(text)
        except Exception:  # noqa: BLE001
            return e.code, "", {"raw": text}


def main() -> int:
    ensure_dirs()
    setup_logging({"logging": {"level": "WARNING", "console": False}})

    # ------------------------------------------------------------ 1. パス / バンドル
    section("1. パスと JS バンドル")
    bundle = js_bundle()
    ok(len(bundle) > 40000, "JS バンドルが生成できる (%d bytes)" % len(bundle))
    ok("__CCBOT" in bundle and "Bot.run = function" in bundle, "バンドルに run() が含まれる")
    ok(bundle.count("window.__CCBOT = ") <= 2, "名前空間の定義は 1 箇所")
    for f in sorted((ROOT / "ccbot" / "js").glob("*.js")):
        ok(f.stat().st_size > 500, f.name + " が空でない")
    ok((WEB_DIR / "index.html").exists() and (WEB_DIR / "app.js").exists() and (WEB_DIR / "style.css").exists(),
       "管理画面のファイルが揃っている")
    for bat in ("install.bat", "start_bot.bat", "uninstall.bat", "doctor.bat"):
        p = ROOT / bat
        data = p.read_bytes()
        ok(p.exists() and b"\r\n" in data and not data.startswith(b"\xef\xbb\xbf"),
           bat + " (CRLF / BOMなし)")
        ok(b"chcp 65001" in data, bat + " に UTF-8 設定がある")

    # ------------------------------------------------------------ 2. 設定
    section("2. 設定")
    c = Config(ROOT / "tests" / "_test_config.json")
    c.load()
    ok(c.get("clicker", "cps") == DEFAULT_CONFIG["clicker"]["cps"], "デフォルト値の読み込み")
    c.update({"clicker": {"cps": 7}, "garden": {"mode": "lumpfarm"}})
    ok(c.get("clicker", "cps") == 7, "update での上書き")
    ok(c.get("clicker", "enabled") is True, "未指定キーはデフォルトのまま")
    c2 = Config(ROOT / "tests" / "_test_config.json")
    c2.load()
    ok(c2.get("clicker", "cps") == 7 and c2.get("garden", "mode") == "lumpfarm", "ファイルからの再読み込み")
    ec = c.engine_config()
    ok("browser" not in ec and "server" not in ec and "logging" not in ec, "engine_config にブラウザ設定を含めない")
    ok(set(ec.keys()) == set(DEFAULT_CONFIG.keys()) - {"browser", "server", "loop", "save", "logging"},
       "engine_config のキーが JS 側と一致", sorted(set(ec) ^ (set(DEFAULT_CONFIG) - {"browser", "server", "loop", "save", "logging"})))
    ok(deep_merge({}, {"a": {"b": 1}}) == {"a": {"b": 1}}, "deep_merge")
    c.reset()
    ok(c.get("clicker", "cps") == DEFAULT_CONFIG["clicker"]["cps"], "reset")

    # ------------------------------------------------------------ 3. ログ
    section("3. ログ")
    al = ActionLogger(ring_size=50, jsonl=True, text=True)
    for i in range(5):
        al.record({"i": i + 1, "t": int(time.time() * 1000), "m": "building", "a": "buy",
                   "d": {"count": i, "items": [{"building": "Cursor", "count": 2}]}, "r": {"spent": 1e6 * i}})
    al.system("engine", "start", {"pid": 1})
    tail = al.tail(limit=10)
    ok(len(tail) == 6, "リングバッファに 6 件", len(tail))
    ok(tail[0]["line"].startswith(time.strftime("%Y-%m-%d")), "行にタイムスタンプがある")
    ok("施設" in tail[-1]["line"] and "購入" in tail[-1]["line"], "日本語ラベルが付く: " + tail[-1]["line"])
    ok(len(al.tail(limit=10, module="building")) == 5, "モジュールで絞り込める")
    ok(len(al.tail(limit=10, search="Cursor")) == 5, "全文検索できる")
    today = time.strftime("%Y-%m-%d")
    ok((LOG_ACTIONS_DIR / f"{today}.jsonl").exists(), "行動ログ(jsonl)が書かれた")
    ok((LOG_ACTIONS_DIR / f"{today}.log").exists(), "行動ログ(text)が書かれた")
    lines = (LOG_ACTIONS_DIR / f"{today}.jsonl").read_text(encoding="utf-8").strip().splitlines()
    rec = json.loads(lines[-1])
    ok(set(["ts", "epoch", "module", "action", "detail", "result", "line"]) <= set(rec.keys()),
       "JSONL のスキーマ", sorted(rec.keys()))
    al.close()

    sl = StatsLogger()
    sl.write({"cookies": 1.0, "cookiesPs": 2.0, "prestige": 3})
    sl.write({"cookies": 2.0, "cookiesPs": 3.0, "prestige": 3})
    sl.close()
    ok((LOG_STATS_DIR / f"{today}.jsonl").exists(), "統計ログが書かれた")
    ok(len(sl.history) == 2, "統計のメモリ内履歴")

    ok(len(log_files("actions")) >= 1, "log_files(actions)")
    ok(len(log_files("stats")) >= 1, "log_files(stats)")
    txt = read_log_file("actions", f"{today}.jsonl", tail_lines=2)
    ok(len(txt.strip().splitlines()) == 2, "read_log_file の tail")
    try:
        read_log_file("actions", "../../etc/passwd")
        ok(False, "パストラバーサルを拒否")
    except ValueError:
        ok(True, "パストラバーサルを拒否")
    ok(cleanup_old_logs(0) == 0, "cleanup_old_logs(0) は何もしない")

    # ------------------------------------------------------------ 4. セーブ
    section("4. セーブのバックアップ")
    test_save_dir = ROOT / "tests" / "_temp_saves"
    shutil.rmtree(test_save_dir, ignore_errors=True)
    test_save_dir.mkdir(parents=True, exist_ok=True)
    sm = SaveManager(keep=3)
    sm.dir = test_save_dir
    names = []
    for i in range(5):
        p = sm.write("SAVECODE%d" % i, "tag%d" % i)
        names.append(p.name)
        time.sleep(0.01)
    lst = sm.list()
    ok(len(lst) == 3, "keep=3 で古いものを削除", len(lst))
    ok(lst[0]["mtime"] >= lst[-1]["mtime"], "新しい順に並ぶ")
    ok(lst[0]["tag"] == "tag4", "タグを解析できる", lst[0]["tag"])
    code = sm.read(lst[0]["name"])
    ok(code.startswith("SAVECODE"), "セーブコードを読み出せる")
    ok(sm.delete(lst[0]["name"]) is True, "削除できる")
    ok(len(sm.list()) == 2, "削除後に 2 件")
    try:
        sm.read("../config.json")
        ok(False, "不正な名前は拒否")
    except ValueError:
        ok(True, "不正な名前は拒否")
    shutil.rmtree(test_save_dir, ignore_errors=True)

    # ------------------------------------------------------------ 5. 管理画面サーバ
    section("5. 管理画面 (HTTP API)")
    cfg = Config(ROOT / "tests" / "_test_config.json")
    cfg.load()
    eng = FakeEngine(cfg)
    actions = ActionLogger(ring_size=100, jsonl=False, text=False)
    srv = AdminServer(eng, cfg, actions, host="127.0.0.1", port=18765)
    ok(srv.start(), "サーバが起動した")
    time.sleep(0.4)
    base = "http://127.0.0.1:18765"
    try:
        code, ctype, body = http("GET", base + "/", raw=True)
        ok(code == 200 and "Cookie Clicker Bot" in body and "text/html" in ctype, "GET / (index.html)", code)
        code, ctype, body = http("GET", base + "/static/app.js", raw=True)
        ok(code == 200 and "javascript" in ctype and "__CCBOT" not in body and "renderDash" in body, "GET /static/app.js")
        code, ctype, body = http("GET", base + "/static/style.css", raw=True)
        ok(code == 200 and "css" in ctype, "GET /static/style.css")
        code, _, body = http("GET", base + "/static/../run.py", raw=True)
        ok(code in (403, 404), "静的ファイルのディレクトリトラバーサルを拒否", code)

        code, _, body = http("GET", base + "/api/state")
        ok(code == 200 and body["ok"] and body["data"]["snapshot"]["cookies"] == 1234567.0, "GET /api/state")

        code, _, body = http("GET", base + "/api/config")
        ok(code == 200 and body["data"]["clicker"]["cps"] == 12, "GET /api/config")
        ok("defaults" in body and "modules" in body, "config に defaults/modules を含む")

        code, _, body = http("POST", base + "/api/config", {"patch": {"clicker": {"cps": 9}}})
        ok(code == 200 and body["ok"] and body["data"]["clicker"]["cps"] == 9, "POST /api/config")
        ok(cfg.get("clicker", "cps") == 9, "config.json に保存された")
        ok(cfg.get("clicker", "enabled") is True, "部分的な更新で他キーは保持")

        code, _, body = http("POST", base + "/api/action", {"action": "click", "args": {"times": 5}})
        ok(code == 200 and body["ok"] and body["data"]["echo"]["times"] == 5, "POST /api/action")
        ok(("click", {"times": 5}) in eng.calls, "エンジンにコマンドが渡った")

        code, _, body = http("POST", base + "/api/action", {})
        ok(code == 400 or body.get("ok") is False, "action 無しのリクエストはエラー")

        code, _, body = http("GET", base + "/api/logs?limit=5")
        ok(code == 200 and isinstance(body["data"], list), "GET /api/logs")

        code, _, body = http("GET", base + "/api/logs/files?kind=actions")
        ok(code == 200 and isinstance(body["data"], list), "GET /api/logs/files")

        code, _, body = http("GET", base + "/api/saves")
        ok(code == 200 and body["ok"], "GET /api/saves")
        code, _, body = http("POST", base + "/api/saves/backup", {"tag": "unittest"})
        ok(code == 200 and body["ok"] and body.get("name"), "POST /api/saves/backup", body)
        saved_name = body.get("name")
        code, _, body = http("GET", base + "/api/saves/download?name=" + saved_name, raw=True)
        ok(code == 200 and body.startswith("FAKECODE"), "GET /api/saves/download")
        code, _, body = http("POST", base + "/api/saves/restore", {"name": saved_name})
        ok(code == 200 and body["ok"], "POST /api/saves/restore")
        code, _, body = http("POST", base + "/api/saves/delete", {"name": saved_name})
        ok(code == 200 and body["ok"], "POST /api/saves/delete")

        code, _, body = http("GET", base + "/api/garden")
        ok(code == 200 and body["ok"], "GET /api/garden")
        code, _, body = http("GET", base + "/api/market")
        ok(code == 200 and body["ok"], "GET /api/market")
        code, _, body = http("GET", base + "/api/prestige")
        ok(code == 200 and body["ok"], "GET /api/prestige")
        code, _, body = http("GET", base + "/nope")
        ok(code == 404, "未知のパスは 404")

        code, _, body = http("POST", base + "/api/stop")
        ok(code == 200 and body["ok"] and "__stop" in eng.actions, "POST /api/stop")
    finally:
        srv.stop()
    ok(srv.httpd is None, "サーバを停止できた")

    # ------------------------------------------------------------ 6. スレッド安全性
    section("6. 同時アクセス")
    cfg3 = Config(ROOT / "tests" / "_test_config.json")
    cfg3.load()
    eng3 = FakeEngine(cfg3)
    srv3 = AdminServer(eng3, cfg3, ActionLogger(ring_size=10, jsonl=False, text=False), host="127.0.0.1", port=18766)
    srv3.start()
    time.sleep(0.3)
    errors: list[str] = []

    def worker(n: int) -> None:
        for i in range(12):
            try:
                http("GET", "http://127.0.0.1:18766/api/state")
                http("POST", "http://127.0.0.1:18766/api/action", {"action": "ping", "args": {"n": i}})
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc))

    ts = [threading.Thread(target=worker, args=(i,)) for i in range(6)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    srv3.stop()
    ok(not errors, "6スレッド×12リクエストをエラーなく処理", errors[:3])
    ok(len([c for c in eng3.calls if c[0] == "ping"]) == 72, "全コマンドが届いた", len(eng3.calls))

    # ------------------------------------------------------------ 後片付け
    for f in (ROOT / "tests").glob("_test_config.json*"):
        f.unlink()
    shutil.rmtree(test_save_dir, ignore_errors=True)

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
