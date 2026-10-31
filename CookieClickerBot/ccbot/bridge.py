"""Playwright 経由でページ内エンジン (__CCBOT) と通信するブリッジ."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import paths

log = logging.getLogger("ccbot.bridge")

# Chromium のバックグラウンドスロットリングを止めるフラグ。
# これが無いとウィンドウが裏に回った瞬間に Game.Logic が止まり bot も止まる。
STEALTH_ARGS: List[str] = [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpTimerThrottling",
    "--autoplay-policy=no-user-gesture-required",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--mute-audio",
    "--start-maximized",
]


class BridgeError(RuntimeError):
    pass


class GameBridge:
    """ページに対する JS 呼び出しを 1 箇所に集約する."""

    def __init__(self, page: Any, timeout_ms: int = 20000) -> None:
        self.page = page
        self.timeout_ms = timeout_ms
        self.calls = 0
        self.errors = 0
        self.last_ok = 0.0
        self.consecutive_errors = 0
        try:
            page.set_default_timeout(timeout_ms)
        except Exception:  # noqa: BLE001, S110
            pass

    # ------------------------------------------------------------ 呼び出し
    def call(self, action: str, args: Optional[Dict[str, Any]] = None, timeout: Optional[float] = None) -> Dict[str, Any]:
        """window.__CCBOT.run(action, args) を呼び、{ok, data|error} を返す.

        注意: Playwright の Page.evaluate() に timeout 引数は無いので、
        既定タイムアウトを一時的に差し替えて対応する。
        """
        expr = "([__n, __a]) => { if (!window.__CCBOT || !window.__CCBOT.run) return {ok:false, error:'engine not injected'}; return window.__CCBOT.run(__n, __a); }"
        restore = None
        try:
            if timeout is not None:
                restore = self.timeout_ms
                self.page.set_default_timeout(float(timeout))
            res = self.page.evaluate(expr, [action, args or {}])
        except Exception as exc:  # noqa: BLE001
            self.errors += 1
            self.consecutive_errors += 1
            raise BridgeError(f"{action} 呼び出し失敗: {exc}") from exc
        finally:
            if restore is not None:
                try:
                    self.page.set_default_timeout(restore)
                except Exception:  # noqa: BLE001, S110
                    pass
        self.calls += 1
        self.last_ok = time.time()
        if isinstance(res, dict) and res.get("ok"):
            self.consecutive_errors = 0
        else:
            self.consecutive_errors += 1
        if not isinstance(res, dict):
            return {"ok": False, "error": f"unexpected result type: {type(res).__name__}", "name": action}
        return res

    def call_data(self, action: str, args: Optional[Dict[str, Any]] = None) -> Any:
        res = self.call(action, args)
        if not res.get("ok"):
            raise BridgeError(str(res.get("error") or res))
        return res.get("data")

    def evaluate(self, expression: str, arg: Any = None) -> Any:
        return self.page.evaluate(expression, arg)

    # ------------------------------------------------------------ エンジン
    @staticmethod
    def bundle() -> str:
        return paths.js_bundle()

    def inject(self) -> None:
        """今のドキュメントにエンジンを注入する (init script は navigation 時に既に走る)."""
        code = self.bundle()
        self.page.evaluate(code)
        ping = self.call("ping")
        if not ping.get("ok"):
            raise BridgeError(f"エンジンの注入に失敗: {ping.get('error')}")
        log.info("ページ内エンジンを注入しました (version=%s)", (ping.get("data") or {}).get("version"))

    def push_config(self, cfg: Dict[str, Any]) -> bool:
        res = self.call("setConfig", cfg)
        return bool(res.get("ok"))

    def drain_events(self, since: int, limit: int = 2000) -> Dict[str, Any]:
        res = self.call("drainEvents", {"since": since, "limit": limit})
        if not res.get("ok"):
            raise BridgeError(str(res.get("error")))
        return res.get("data") or {"events": [], "seq": since}

    def snapshot(self, opts: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        res = self.call("snapshot", opts or {})
        if not res.get("ok"):
            raise BridgeError(str(res.get("error")))
        return res.get("data") or {}


class BrowserSession:
    """ブラウザ + ページ + ブリッジのライフサイクル."""

    def __init__(self, cfg: Dict[str, Any], stop_event: Any = None) -> None:
        self.cfg = cfg
        self.stop_event = stop_event
        self.playwright = None
        self.context = None
        self.page = None
        self.bridge: Optional[GameBridge] = None
        self.started_at = 0.0
        self.reloads = 0
        self.load_state = "idle"
        self.actions_hint = ""

    # ------------------------------------------------------------ 起動
    def _channel(self) -> Optional[str]:
        ch = str(self.cfg.get("channel", "auto")).lower()
        if ch in ("", "auto", "chromium", "default"):
            return None
        return ch

    def _profile_dir(self) -> Path:
        d = self.cfg.get("userDataDir") or "browser_profile"
        p = Path(d)
        if not p.is_absolute():
            p = paths.BASE_DIR / p
        p.mkdir(parents=True, exist_ok=True)
        return p

    def start(self) -> GameBridge:
        from playwright.sync_api import sync_playwright  # 遅延 import

        self.playwright = sync_playwright().start()
        bcfg = self.cfg
        args = list(STEALTH_ARGS) if bcfg.get("stealthFlags", True) else []
        args += list(bcfg.get("extraArgs") or [])
        w, h = (list(bcfg.get("windowSize") or [1440, 900]) + [1440, 900])[:2]

        launch_kwargs: Dict[str, Any] = dict(
            user_data_dir=str(self._profile_dir()),
            headless=bool(bcfg.get("headless", False)),
            args=args,
            viewport={"width": int(w), "height": int(h)},
            locale="ja-JP",
            ignore_default_args=["--enable-automation"],
            no_viewport=False,
        )
        ch = self._channel()
        if ch:
            launch_kwargs["channel"] = ch

        try:
            self.context = self.playwright.chromium.launch_persistent_context(**launch_kwargs)
        except Exception as exc:  # noqa: BLE001
            if ch:
                log.warning("channel=%s で起動できなかったため同梱 Chromium で再試行します (%s)", ch, exc)
                launch_kwargs.pop("channel", None)
                self.context = self.playwright.chromium.launch_persistent_context(**launch_kwargs)
            else:
                raise

        # ページ生成前(= navigation 前)に init script を仕込む
        bundle = GameBridge.bundle()
        self.context.add_init_script(bundle)

        if self.context.pages:
            self.page = self.context.pages[0]
        else:
            self.page = self.context.new_page()

        self._wire_events()

        url = str(bcfg.get("url") or paths.GAME_URL_DEFAULT)
        log.info("ゲームを読み込みます: %s", url)
        try:
            self.page.goto(url, wait_until="domcontentloaded", timeout=90000)
        except Exception as exc:  # noqa: BLE001
            log.warning("goto で例外 (%s) - 読み込み継続を待ちます", exc)

        self.bridge = GameBridge(self.page)
        self.started_at = time.time()

        # ゲーム本体の起動を待つ
        self.wait_for_game(timeout=int(bcfg.get("waitTimeoutSec", 300)))
        # init script が何らかの理由で走らなかった場合に備えて再注入
        try:
            self.bridge.inject()
        except Exception as exc:  # noqa: BLE001
            log.warning("再注入に失敗: %s", exc)
        return self.bridge

    def _wire_events(self) -> None:
        def on_console(msg: Any) -> None:
            try:
                t = msg.type
                text = msg.text
            except Exception:  # noqa: BLE001
                return
            # 画像/音声などリソースの 404 は動作に影響しないので DEBUG に落とす
            low = ("Failed to load resource" in text or "net::ERR_" in text
                   or "404" in text or "ERR_FILE_NOT_FOUND" in text)
            if low:
                log.debug("[page:%s] %s", t, text[:200])
            elif t in ("error", "warning"):
                log.log(logging.WARNING if t == "warning" else logging.ERROR, "[page:%s] %s", t, text[:400])
            else:
                log.debug("[page:%s] %s", t, text[:300])

        def on_crash(page: Any) -> None:
            log.error("ページがクラッシュしました")

        def on_close(page: Any) -> None:
            log.warning("ページが閉じられました")

        try:
            self.page.on("console", on_console)
            self.page.on("crash", on_crash)
            self.page.on("close", on_close)
        except Exception as exc:  # noqa: BLE001
            log.debug("イベント配線に失敗: %s", exc)

    # ------------------------------------------------------------ 待機
    CHALLENGE_PROBE = (
        "() => { try {"
        "  if (window.Game && window.Game.ready && window.Game.Objects && window.Game.Objects['Cursor']) return 'ready';"
        "  var t = (document.title || '').toLowerCase();"
        "  var b = (document.body ? document.body.innerText : '') || '';"
        "  if (t.indexOf('just a moment') !== -1 || document.getElementById('challenge-form')"
        "      || document.querySelector('input[name=cf-turnstile-response]')"
        "      || b.indexOf('Performing security verification') !== -1"
        "      || b.indexOf('security check') !== -1) return 'challenge';"
        "  return 'loading';"
        "} catch (e) { return 'error'; } }"
    )

    def detect_state(self) -> str:
        """'ready' / 'challenge' / 'loading' / 'error' / 'closed' を返す."""
        try:
            if self.page.is_closed():
                return "closed"
            return str(self.page.evaluate(self.CHALLENGE_PROBE) or "loading")
        except Exception:  # noqa: BLE001
            return "error"

    def wait_for_game(self, timeout: int = 300) -> bool:
        """Game オブジェクトが ready になるまで待つ.

        Cloudflare の人間認証 ('Just a moment...') が出た場合は、
        表示されているブラウザ窓でチェックボックスを押してもらう必要があるため、
        わかりやすい案内を出して待ち続ける。
        """
        deadline = time.time() + timeout
        last_err = ""
        warned = False
        st = "loading"
        self.load_state = "loading"
        while time.time() < deadline:
            if self.stop_event is not None and self.stop_event.is_set():
                log.info("停止要求があったためゲームの待機を中断します")
                return False
            st = self.detect_state()
            self.load_state = st
            if st == "ready":
                try:
                    ver = self.page.evaluate("() => (window.Game && window.Game.version) || ''")
                except Exception:  # noqa: BLE001
                    ver = ""
                log.info("ゲーム起動を確認しました (version=%s)", ver)
                return True
            if st == "closed":
                log.error("ページが閉じられています")
                return False
            if st == "challenge":
                if not warned:
                    warned = True
                    log.warning("=" * 58)
                    log.warning(" ゲームサイトが人間認証 (Cloudflare) を表示しています")
                    log.warning(" 開いているブラウザ窓でチェックボックスを押してください。")
                    log.warning(" 認証を通すと以降はプロファイルに保存されます。")
                    log.warning(" (headless 起動では認証を通過できないことがあります。")
                    log.warning("  その場合は headless=false で起動してください)")
                    log.warning("=" * 58)
                    self.actions_hint = "challenge"
            try:
                if self.page.is_closed():
                    return False
            except Exception as exc:  # noqa: BLE001
                last_err = str(exc)
            time.sleep(1.0)
        self.load_state = st + "-timeout"
        log.error("ゲームの起動を %s 秒待って諦めました (状態=%s) %s", timeout, self.load_state, last_err)
        return False

    # ------------------------------------------------------------ 回復
    def reload(self, reason: str = "") -> bool:
        self.reloads += 1
        log.warning("ページを再読み込みします (%s)", reason or "manual")
        try:
            url = str(self.cfg.get("url") or paths.GAME_URL_DEFAULT)
            self.page.reload(wait_until="domcontentloaded", timeout=90000)
            if not self.wait_for_game(timeout=120):
                return False
            self.bridge = GameBridge(self.page)
            self.bridge.inject()
            return True
        except Exception as exc:  # noqa: BLE001
            log.error("再読み込みに失敗: %s", exc)
            return False

    def ensure_alive(self) -> bool:
        try:
            if self.page.is_closed():
                return False
            return True
        except Exception:  # noqa: BLE001
            return False

    # ------------------------------------------------------------ 終了
    def stop(self) -> None:
        for closer in (
            lambda: self.context and self.context.close(),
            lambda: self.playwright and self.playwright.stop(),
        ):
            try:
                closer()
            except Exception as exc:  # noqa: BLE001
                log.debug("終了処理: %s", exc)
        self.page = None
        self.context = None
        self.playwright = None
        self.bridge = None
