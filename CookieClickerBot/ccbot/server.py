"""管理画面 (ローカル HTTP サーバ).

標準ライブラリのみで実装。127.0.0.1 にバインドし、外部からはアクセスできない。
"""
from __future__ import annotations

import json
import logging
import mimetypes
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import parse_qs, urlparse

from .config import DEFAULT_CONFIG, MODULE_KEYS
from .log import ActionLogger, log_files, read_log_file
from .paths import WEB_DIR

log = logging.getLogger("ccbot.server")

JSON_TYPE = "application/json; charset=utf-8"


def unwrap(res: Any) -> Any:
    """bridge.call() の {ok,name,data} ラッパを剥がして data を返す.

    管理画面からは 1 段だけで扱えるようにする (二重ラップ防止)。
    """
    if isinstance(res, dict) and res.get("ok") and "data" in res:
        return res["data"]
    return res


class Handler(BaseHTTPRequestHandler):
    server_version = "CCBot/1.0"
    protocol_version = "HTTP/1.1"

    # ---- 親から注入される ----
    engine: Any = None
    actions: Optional[ActionLogger] = None
    cfg: Any = None

    # ------------------------------------------------------------ helpers
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        log.debug("%s - %s", self.address_string(), fmt % args)

    def _send(self, code: int, body: bytes, ctype: str, extra: Optional[Dict[str, str]] = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, obj: Any, code: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        self._send(code, body, JSON_TYPE)

    def _err(self, msg: str, code: int = 400) -> None:
        self._json({"ok": False, "error": msg}, code)

    def _body(self) -> Dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        raw = self.rfile.read(min(length, 20 * 1024 * 1024))
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
            return data if isinstance(data, dict) else {"value": data}
        except Exception:  # noqa: BLE001
            return {}

    # ------------------------------------------------------------ routing
    def do_GET(self) -> None:  # noqa: N802
        try:
            self._route("GET")
        except Exception as exc:  # noqa: BLE001
            log.exception("GET 処理エラー")
            self._err(f"{type(exc).__name__}: {exc}", 500)

    def do_POST(self) -> None:  # noqa: N802
        try:
            self._route("POST")
        except Exception as exc:  # noqa: BLE001
            log.exception("POST 処理エラー")
            self._err(f"{type(exc).__name__}: {exc}", 500)

    def _route(self, method: str) -> None:
        u = urlparse(self.path)
        path = u.path or "/"
        qs = {k: v[0] for k, v in parse_qs(u.query or "").items()}

        if method == "GET":
            if path in ("/", "/index.html"):
                return self._file(WEB_DIR / "index.html")
            if path.startswith("/static/"):
                rel = path[len("/static/"):]
                target = (WEB_DIR / rel).resolve()
                if not str(target).startswith(str(WEB_DIR.resolve())):
                    return self._err("forbidden", 403)
                return self._file(target)
            if path == "/api/state":
                return self._json({"ok": True, "data": self.engine.public_state()})
            if path == "/api/config":
                return self._json({"ok": True, "data": self.cfg.data, "defaults": DEFAULT_CONFIG, "modules": MODULE_KEYS})
            if path == "/api/logs":
                limit = int(qs.get("limit") or 250)
                mod = qs.get("module") or ""
                search = qs.get("q") or ""
                return self._json({"ok": True, "data": self.actions.tail(limit=limit, module=mod, search=search)})
            if path == "/api/logs/files":
                kind = qs.get("kind") or "actions"
                return self._json({"ok": True, "data": log_files(kind)})
            if path == "/api/logs/file":
                kind = qs.get("kind") or "actions"
                name = qs.get("name") or ""
                tail = int(qs.get("tail") or 0)
                try:
                    text = read_log_file(kind, name, tail)
                except Exception as exc:  # noqa: BLE001
                    return self._err(str(exc), 404)
                if qs.get("download"):
                    return self._send(200, text.encode("utf-8"), "text/plain; charset=utf-8",
                                      {"Content-Disposition": f'attachment; filename="{Path(name).name}"'})
                return self._json({"ok": True, "data": {"name": name, "text": text}})
            if path == "/api/saves":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("__list_saves"))})
            if path == "/api/saves/download":
                name = qs.get("name") or ""
                res = self.engine.submit("__read_save", {"name": name})
                if not res.get("ok"):
                    return self._err(str(res.get("error")), 404)
                code = (res.get("data") or {}).get("code", "")
                return self._send(200, code.encode("ascii", "replace"), "text/plain; charset=utf-8",
                                  {"Content-Disposition": f'attachment; filename="{Path(name).name}"'})
            if path == "/api/meta":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("capabilities"))})
            if path == "/api/schedule":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("schedule"))})
            if path == "/api/garden":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("gardenState"))})
            if path == "/api/market":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("marketState"))})
            if path == "/api/pantheon":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("pantheonState"))})
            if path == "/api/grimoire":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("grimoireState"))})
            if path == "/api/ascend":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("ascendInfo"))})
            if path == "/api/prestige":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("prestigeList"))})
            if path == "/api/store":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("snapshot", {"store": True}))})
            if path == "/api/dragon-auras":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("dragonAuras"))})
            if path == "/api/seasons":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("seasons"))})
            if path == "/api/garden-seeds":
                return self._json({"ok": True, "data": unwrap(self.engine.submit("gardenSeeds"))})
            return self._err("not found", 404)

        # ---------------- POST ----------------
        body = self._body()
        if path == "/api/action":
            action = str(body.get("action") or "")
            args = body.get("args") or {}
            if not action:
                return self._err("action required")
            return self._json({"ok": True, "data": unwrap(self.engine.submit(action, args if isinstance(args, dict) else {}))})
        if path == "/api/config":
            patch = body.get("patch") or body
            data = self.engine.apply_config(patch if isinstance(patch, dict) else {})
            return self._json({"ok": True, "data": data})
        if path == "/api/config/reset":
            data = self.cfg.reset()
            self.engine.apply_config({})
            return self._json({"ok": True, "data": data})
        if path == "/api/saves/backup":
            return self._json(unwrap(self.engine.submit("__backup", {"tag": body.get("tag", "manual")})))
        if path == "/api/saves/restore":
            return self._json(unwrap(self.engine.submit("__restore", {"name": body.get("name", "")})))
        if path == "/api/saves/delete":
            return self._json(unwrap(self.engine.submit("__delete_save", {"name": body.get("name", "")})))
        if path == "/api/reload":
            return self._json(unwrap(self.engine.submit("__reload_page")))
        if path == "/api/stop":
            return self._json(unwrap(self.engine.submit("__stop")))
        return self._err("not found", 404)

    # ------------------------------------------------------------ static
    def _file(self, p: Path) -> None:
        p = Path(p)
        if not p.exists() or not p.is_file():
            return self._err("file not found: %s" % p.name, 404)
        ctype = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        data = p.read_bytes()
        self._send(200, data, ctype)


class AdminServer:
    def __init__(self, engine: Any, cfg: Any, actions: ActionLogger, host: str = "127.0.0.1", port: int = 8765) -> None:
        self.engine = engine
        self.cfg = cfg
        self.actions = actions
        self.host = host
        self.port = port
        self.httpd: Optional[ThreadingHTTPServer] = None
        self.thread: Optional[threading.Thread] = None

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}/"

    def start(self) -> bool:
        handler = type("BoundHandler", (Handler,), {"engine": self.engine, "actions": self.actions, "cfg": self.cfg})
        try:
            self.httpd = ThreadingHTTPServer((self.host, self.port), handler)
        except OSError as exc:
            log.error("管理画面の起動に失敗しました (%s:%s) - %s", self.host, self.port, exc)
            return False
        self.httpd.daemon_threads = True
        self.thread = threading.Thread(target=self._serve, name="admin-server", daemon=True)
        self.thread.start()
        log.info("管理画面を起動しました -> %s", self.url)
        self.actions.system("server", "start", {"url": self.url})
        return True

    def _serve(self) -> None:
        try:
            if self.httpd:
                self.httpd.serve_forever(poll_interval=0.4)
        except Exception as exc:  # noqa: BLE001
            log.error("管理画面サーバが停止しました: %s", exc)

    def stop(self) -> None:
        try:
            if self.httpd:
                self.httpd.shutdown()
                self.httpd.server_close()
        except Exception as exc:  # noqa: BLE001
            log.debug("管理画面の停止: %s", exc)
        self.httpd = None
