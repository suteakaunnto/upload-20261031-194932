"""ボットの本体 (メインループ).

Playwright の同期 API を使うため、このループは「メインスレッド」で動かす。
管理画面 (HTTP サーバ) は別スレッドで動き、コマンドは Queue 経由でここに渡される。
"""
from __future__ import annotations

import logging
import queue
import threading
import time
import traceback
from concurrent.futures import Future
from typing import Any, Dict, List, Optional, Tuple

from .bridge import BrowserSession, BridgeError, GameBridge
from .config import Config
from .log import ActionLogger, StatsLogger
from .saves import SaveManager

log = logging.getLogger("ccbot.engine")


class Engine:
    def __init__(self, cfg: Config, actions: ActionLogger, stats: StatsLogger) -> None:
        self.cfg = cfg
        self.actions = actions
        self.stats = stats
        self.saves = SaveManager(keep=int(cfg.get("save", "keepBackups", default=60)))

        self.session: Optional[BrowserSession] = None
        self.bridge: Optional[GameBridge] = None

        self._lock = threading.RLock()
        self._cmds: "queue.Queue[Tuple[str, Dict[str, Any], Future]]" = queue.Queue()
        self._stop = threading.Event()

        self.running = False
        self.started_at = 0.0
        self._engine_thread: Optional[threading.Thread] = None
        self.snapshot: Dict[str, Any] = {}
        self.caps: Dict[str, Any] = {}
        self.modules: List[Dict[str, Any]] = []
        self.history: Dict[str, List[float]] = {"t": [], "cookies": [], "cps": [], "prestige": []}
        self.last_event_seq = 0
        self.last_backup_at = 0.0
        self.last_backup_name = ""
        self.last_stats_at = 0.0
        self.last_error = ""
        self.pending_ascend_handled_at = 0.0
        self.healthy = False
        self.game_ready = False
        self._shutdown_done = False

    # ================================================================ 状態
    def public_state(self) -> Dict[str, Any]:
        with self._lock:
            snap = dict(self.snapshot or {})
            br = self.bridge
            hist_points = int(self.cfg.get("server", "historyPoints", default=720))
            hist = {k: list(v)[-hist_points:] for k, v in self.history.items()}
            return {
                "running": self.running,
                "healthy": self.healthy,
                "gameReady": self.game_ready,
                "startedAt": self.started_at,
                "uptimeSec": (time.time() - self.started_at) if self.started_at else 0,
                "snapshot": snap,
                "capabilities": self.caps,
                "modules": self.modules,
                "history": hist,
                "engine": {
                    "calls": br.calls if br else 0,
                    "errors": br.errors if br else 0,
                    "consecutiveErrors": br.consecutive_errors if br else 0,
                    "lastOk": br.last_ok if br else 0,
                    "reloads": self.session.reloads if self.session else 0,
                },
                "loadState": (self.session.load_state if self.session else "idle"),
                "lastEventSeq": self.last_event_seq,
                "lastBackup": {"at": self.last_backup_at, "name": self.last_backup_name},
                "lastError": self.last_error,
                "botStats": snap.get("botStats") or {},
            }

    # ================================================================ コマンド
    def submit(self, action: str, args: Optional[Dict[str, Any]] = None, timeout: Optional[float] = None) -> Dict[str, Any]:
        """管理画面スレッドからエンジンへ処理を依頼する."""
        if action in ("__status",):
            return {"ok": True, "data": self.public_state()}
        fut: Future = Future()
        self._cmds.put((action, args or {}, fut))
        t = timeout if timeout is not None else float(self.cfg.get("loop", "commandTimeoutSec", default=20))
        try:
            return fut.result(timeout=t)
        except queue.Empty:  # pragma: no cover
            return {"ok": False, "error": "command timeout"}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    def request_stop(self) -> None:
        self._stop.set()

    # ================================================================ 起動
    def start_browser(self) -> bool:
        bcfg = self.cfg.get("browser", default={})
        self.session = BrowserSession(bcfg, self._stop)
        try:
            self.bridge = self.session.start()
        except Exception as exc:  # noqa: BLE001
            log.error("ブラウザの起動に失敗しました: %s", exc)
            log.error(traceback.format_exc())
            self.last_error = f"browser start failed: {exc}"
            return False

        # 設定をエンジンへ送る
        if not self.bridge.push_config(self.cfg.engine_config()):
            log.warning("設定の反映に失敗しました")
        self.actions.system("engine", "config-push", {"keys": sorted(self.cfg.engine_config().keys())})

        try:
            self.caps = self.bridge.call_data("capabilities") or {}
            log.info("機能プローブ: %s", {k: v for k, v in (self.caps.get("probes") or {}).items() if v})
        except Exception as exc:  # noqa: BLE001
            log.warning("機能プローブに失敗: %s", exc)

        self.game_ready = bool(self.caps.get("game"))
        self.healthy = True
        return True

    # ================================================================ メインループ
    def run(self) -> int:
        self.running = True
        self.started_at = time.time()
        self._engine_thread = threading.current_thread()
        self.actions.system("engine", "start", {"pid": _pid(), "config": str(self.cfg.path)})
        log.info("=" * 62)
        log.info(" Cookie Clicker Bot 起動")
        log.info("=" * 62)

        retries = max(1, int(self.cfg.get("browser", "startRetries", default=3)))
        started = False
        for attempt in range(1, retries + 1):
            try:
                if self.start_browser():
                    started = True
                    break
            except Exception as exc:  # noqa: BLE001
                self.last_error = f"{type(exc).__name__}: {exc}"
                log.error("ブラウザの起動に失敗しました (%d/%d): %s", attempt, retries, self.last_error)
                log.debug("%s", traceback.format_exc())
            try:
                if self.session:
                    self.session.stop()
            except Exception:  # noqa: BLE001, S110
                pass
            self.session = None
            self.bridge = None
            if attempt < retries and not self._stop.is_set():
                log.warning("10 秒後に再試行します (%d/%d)", attempt + 1, retries)
                self._stop.wait(10)
        if not started:
            log.error("ブラウザを起動できませんでした。install.bat を実行したか、doctor.bat で環境を確認してください。")
            self.actions.system("engine", "fatal", {"error": self.last_error, "attempts": retries})
            self.shutdown()
            return 1
        if not self.game_ready:
            log.warning("ゲームが ready になりませんでした (人間認証や回線の問題の可能性があります)。監視は続けます。")

        poll = max(0.05, float(self.cfg.get("loop", "pollMs", default=400)) / 1000.0)
        snap_every = max(0.2, float(self.cfg.get("loop", "snapshotMs", default=1000)) / 1000.0)
        stats_every = max(5.0, float(self.cfg.get("logging", "statsEverySec", default=60)))
        backup_every = max(30.0, float(self.cfg.get("save", "backupEverySec", default=900)))
        last_snap = 0.0
        last_health = 0.0
        fail_streak = 0

        try:
            while not self._stop.is_set():
                t0 = time.time()
                try:
                    self._process_commands()
                    self._drain_events()

                    if t0 - last_snap >= snap_every:
                        last_snap = t0
                        self._take_snapshot()

                    if self.snapshot.get("pendingAscend"):
                        self._handle_ascend_backup()

                    if backup_every > 0 and t0 - self.last_backup_at >= backup_every:
                        self.backup_save("periodic")

                    if t0 - self.last_stats_at >= stats_every and self.snapshot:
                        self.last_stats_at = t0
                        self.stats.write(self.snapshot)

                    if not self.game_ready:
                        self._poll_for_ready()

                    if t0 - last_health >= 5.0:
                        last_health = t0
                        self._health_check()

                    fail_streak = 0
                except BridgeError as exc:
                    fail_streak += 1
                    self.last_error = str(exc)
                    log.warning("ブリッジエラー(%d): %s", fail_streak, exc)
                    if self.session and getattr(self.session, "load_state", "") == "challenge":
                        fail_streak = 0        # 人間認証の待ち中はリロードしない
                    if fail_streak >= 8:
                        self.actions.system("engine", "recover", {"reason": "too many bridge errors"})
                        self._recover()
                        fail_streak = 0
                except Exception as exc:  # noqa: BLE001
                    self.last_error = f"{type(exc).__name__}: {exc}"
                    log.exception("ループ内で予期しないエラー")
                    self.actions.system("engine", "error", {"error": self.last_error})

                dt = time.time() - t0
                self._stop.wait(max(0.01, poll - dt))
        except KeyboardInterrupt:
            log.info("Ctrl+C を受け取りました")
        finally:
            self.shutdown()
        return 0

    # ---------------------------------------------------------------- 内部
    def _process_commands(self) -> None:
        br = self.bridge
        for _ in range(64):
            try:
                action, args, fut = self._cmds.get_nowait()
            except queue.Empty:
                return
            if fut.done():
                continue
            try:
                if action == "__reload_page":
                    ok = self.session.reload("manual") if self.session else False
                    fut.set_result({"ok": ok})
                    continue
                if action == "__push_config":
                    pushed = bool(br and br.push_config(self.cfg.engine_config()))
                    if pushed:
                        log.debug("設定をページ内エンジンへ反映しました")
                    fut.set_result({"ok": pushed, "data": pushed})
                    continue
                if action == "__backup":
                    p = self.backup_save(str(args.get("tag", "manual")))
                    fut.set_result({"ok": bool(p), "name": p.name if p else None})
                    continue
                if action == "__restore":
                    fut.set_result(self.restore_save(str(args.get("name", ""))))
                    continue
                if action == "__list_saves":
                    fut.set_result({"ok": True, "data": self.saves.list()})
                    continue
                if action == "__read_save":
                    try:
                        fut.set_result({"ok": True, "data": {"code": self.saves.read(str(args.get("name", "")))}})
                    except Exception as exc:  # noqa: BLE001
                        fut.set_result({"ok": False, "error": str(exc)})
                    continue
                if action == "__delete_save":
                    fut.set_result({"ok": self.saves.delete(str(args.get("name", "")))})
                    continue
                if action == "__import_code":
                    fut.set_result(self._raw("importSave", {"code": args.get("code", "")}))
                    continue
                if action == "__stop":
                    fut.set_result({"ok": True})
                    self._stop.set()
                    continue
                if action == "__eval":
                    # デバッグ/テスト用の生 JS 実行。HTTP からは既定で呼び出せない。
                    if not self.bridge:
                        fut.set_result({"ok": False, "error": "bridge not ready"})
                        continue
                    try:
                        fut.set_result({"ok": True, "data": self.bridge.page.evaluate(str(args.get("code", "null")))})
                    except Exception as exc:  # noqa: BLE001
                        fut.set_result({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
                    continue
                fut.set_result(self._raw(action, args))
            except Exception as exc:  # noqa: BLE001
                if not fut.done():
                    fut.set_result({"ok": False, "error": f"{type(exc).__name__}: {exc}"})

    def _raw(self, action: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if not self.bridge:
            return {"ok": False, "error": "bridge not ready"}
        res = self.bridge.call(action, args)
        if not res.get("ok"):
            self.actions.system("engine", "action-failed", {"action": action, "args": _trim(args)}, {"error": res.get("error")})
        return res

    def _drain_events(self) -> None:
        if not self.bridge:
            return
        data = self.bridge.drain_events(self.last_event_seq, 2000)
        events = data.get("events") or []
        if events:
            self.actions.record_many(events)
        self.last_event_seq = int(data.get("seq") or self.last_event_seq)
        if int(data.get("dropped") or 0):
            log.debug("エンジン側で %s 件のイベントが破棄されました", data.get("dropped"))

    def _take_snapshot(self) -> None:
        if not self.bridge:
            return
        snap = self.bridge.snapshot({"store": True, "garden": True, "market": True})
        snap["botStats"] = self._bot_stats()
        snap["ascendInfo"] = self._ascend_info()
        snap["moduleSchedule"] = self._module_schedule()
        with self._lock:
            self.snapshot = snap
            self.game_ready = bool(snap.get("ready"))
            self.modules = snap.get("moduleSchedule") or self.modules
            h = self.history
            h["t"].append(time.time())
            h["cookies"].append(float(snap.get("cookies") or 0))
            h["cps"].append(float(snap.get("cookiesPs") or 0))
            h["prestige"].append(float(snap.get("prestige") or 0))
            limit = max(200, int(self.cfg.get("server", "historyPoints", default=720)) * 2)
            for k in list(h.keys()):
                if len(h[k]) > limit:
                    del h[k][: len(h[k]) - limit]

    def _bot_stats(self) -> Dict[str, Any]:
        try:
            return self.bridge.call_data("stats") or {}
        except Exception:  # noqa: BLE001
            return {}

    def _ascend_info(self) -> Dict[str, Any]:
        try:
            return self.bridge.call_data("ascendInfo") or {}
        except Exception:  # noqa: BLE001
            return {}

    def _module_schedule(self) -> List[Dict[str, Any]]:
        try:
            return self.bridge.call_data("schedule") or []
        except Exception:  # noqa: BLE001
            return []

    def _poll_for_ready(self) -> None:
        """ゲームがまだ ready でない間、認証解除や読み込み完了を待つ."""
        if not self.session:
            return
        try:
            st = self.session.detect_state()
        except Exception:  # noqa: BLE001
            return
        self.session.load_state = st
        if st == "challenge":
            now = time.time()
            if now - getattr(self, "_challenge_logged_at", 0) > 60:
                self._challenge_logged_at = now
                log.warning("ゲーム側で人間認証 (Cloudflare) の解除待ちです。ブラウザ窓で確認してください。")
                self.actions.system("engine", "waiting-challenge", {"hint": "ブラウザ窓で人間認証を解除してください"})
            return
        if st == "ready":
            try:
                if self.bridge:
                    self.bridge.inject()
                    self.bridge.push_config(self.cfg.engine_config())
                    self.caps = self.bridge.call_data("capabilities") or {}
                self.game_ready = True
                self.actions.system("engine", "game-ready", {"version": (self.snapshot or {}).get("version", "")})
                log.info("ゲームが ready になりました。自動化を開始します。")
            except Exception as exc:  # noqa: BLE001
                log.warning("ready 検出後の初期化に失敗: %s", exc)

    def _health_check(self) -> None:
        if not self.session or not self.bridge:
            self.healthy = False
            return
        if not self.session.ensure_alive():
            self.healthy = False
            self.actions.system("engine", "page-closed", {})
            self._recover()
            return
        try:
            ping = self.bridge.call("ping", timeout=8000)
            self.healthy = bool(ping.get("ok"))
        except Exception as exc:  # noqa: BLE001
            self.healthy = False
            self.last_error = f"ping failed: {exc}"

    def _recover(self) -> None:
        try:
            if self.session and self.session.reload("auto recovery"):
                self.bridge = self.session.bridge
                if self.bridge:
                    self.bridge.push_config(self.cfg.engine_config())
                    self.caps = self.bridge.call_data("capabilities") or {}
                self.actions.system("engine", "recovered", {})
                return
        except Exception as exc:  # noqa: BLE001
            log.error("復旧に失敗: %s", exc)
        # ブラウザごと作り直す
        try:
            if self.session:
                self.session.stop()
            self.actions.system("engine", "restart-browser", {})
            self.start_browser()
        except Exception as exc:  # noqa: BLE001
            log.error("ブラウザの再起動に失敗: %s", exc)
            self.last_error = str(exc)

    # ---------------------------------------------------------------- セーブ
    def backup_save(self, tag: str = "manual") -> Optional[Any]:
        if not self.bridge:
            return None
        if not self.cfg.get("save", "enabled", default=True):
            return None
        try:
            code = self.bridge.call_data("exportSaveCode") or {}
            data = code.get("code") if isinstance(code, dict) else None
            if not data:
                log.warning("セーブコードを取得できませんでした")
                return None
            p = self.saves.write(data, tag)
            if p:
                self.last_backup_at = time.time()
                self.last_backup_name = p.name
                self.actions.system("save", "backup", {"tag": tag, "file": p.name}, {"bytes": len(data)})
            return p
        except Exception as exc:  # noqa: BLE001
            log.error("バックアップに失敗: %s", exc)
            self.last_error = str(exc)
            return None

    def restore_save(self, name: str) -> Dict[str, Any]:
        try:
            code = self.saves.read(name)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}
        # 復元前に現在の状態を退避
        self.backup_save("before-restore")
        res = self._raw("importSave", {"code": code})
        if res.get("ok"):
            self.actions.system("save", "restore", {"file": name})
            time.sleep(1.0)
            if self.session:
                self.session.reload("after restore")
                self.bridge = self.session.bridge
                if self.bridge:
                    self.bridge.push_config(self.cfg.engine_config())
        return res

    def _handle_ascend_backup(self) -> None:
        """転生前にセーブをバックアップし、JS 側へ許可を出す."""
        pending = (self.snapshot or {}).get("pendingAscend") or {}
        if not pending:
            return
        now = time.time()
        if now - self.pending_ascend_handled_at < 2.0:
            return
        self.pending_ascend_handled_at = now
        if self.cfg.get("save", "backupOnAscend", default=True):
            p = self.backup_save("pre-ascend")
            self.actions.system("ascend", "backup", {"file": p.name if p else None, "gain": pending.get("gain")})
        try:
            self.bridge.call("clearAscendBackup", {})
            self.actions.system("ascend", "backup-approved", {"gain": pending.get("gain")})
        except Exception as exc:  # noqa: BLE001
            log.warning("転生承認の送信に失敗: %s", exc)

    # ---------------------------------------------------------------- 設定
    def apply_config(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        """設定を更新し、ページ内エンジンへ反映する.

        Playwright の同期 API は生成スレッドからしか呼べないため、
        管理画面スレッドから来た場合はコマンドキュー経由でエンジンに渡す。
        """
        data = self.cfg.update(patch)
        self.saves.keep = int(data.get("save", {}).get("keepBackups", 60))
        if self.bridge:
            if self._engine_thread is not None and threading.current_thread() is self._engine_thread:
                try:
                    self.bridge.push_config(self.cfg.engine_config())
                    self.actions.system("engine", "config-updated", {"patch": _trim(patch, 3)})
                except Exception as exc:  # noqa: BLE001
                    log.warning("設定の反映に失敗: %s", exc)
            else:
                res = self.submit("__push_config", {}, timeout=float(self.cfg.get("loop", "commandTimeoutSec", default=20)))
                if res.get("ok") and res.get("data"):
                    self.actions.system("engine", "config-updated", {"patch": _trim(patch, 3)})
                else:
                    log.warning("設定をエンジンへ反映できませんでした: %s", res)
        return data

    # ---------------------------------------------------------------- 終了
    def shutdown(self) -> None:
        if self._shutdown_done:
            return
        self._shutdown_done = True
        self.running = False
        log.info("シャットダウン処理を開始します")
        self.actions.system("engine", "stopping", {})
        try:
            if self.cfg.get("save", "backupOnExit", default=True):
                self.backup_save("exit")
        except Exception as exc:  # noqa: BLE001
            log.warning("終了時バックアップに失敗: %s", exc)
        try:
            if self.session:
                self.session.stop()
        except Exception as exc:  # noqa: BLE001
            log.warning("ブラウザの終了処理: %s", exc)
        try:
            self.actions.close()
            self.stats.close()
        except Exception:  # noqa: BLE001, S110
            pass
        self.actions.system("engine", "stopped", {"uptimeSec": round(time.time() - self.started_at, 1)})
        log.info("終了しました")


def _pid() -> int:
    import os
    return os.getpid()


def _trim(obj: Any, depth: int = 2) -> Any:
    """ログ用に大きな入れ子を間引く."""
    if depth <= 0:
        return "..."
    if isinstance(obj, dict):
        return {k: _trim(v, depth - 1) for k, v in list(obj.items())[:12]}
    if isinstance(obj, (list, tuple)):
        return [_trim(v, depth - 1) for v in list(obj)[:8]]
    if isinstance(obj, str) and len(obj) > 120:
        return obj[:120] + "..."
    return obj
