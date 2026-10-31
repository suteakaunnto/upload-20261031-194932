"""詳細ロギング.

出力先
  logs/ccbot.log            : システム全体のログ (ローテーション)
  logs/error.log            : WARNING 以上のみ
  logs/actions/YYYY-MM-DD.jsonl : bot の全行動 (機械可読)
  logs/actions/YYYY-MM-DD.log   : bot の全行動 (人間可読)
  logs/stats/YYYY-MM-DD.jsonl   : 定期スナップショット (数値の時系列)
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import re
import threading
import time
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Deque, Dict, Iterable, List, Optional

from .paths import LOG_ACTIONS_DIR, LOG_DIR, LOG_STATS_DIR, ensure_dirs

_MAIN_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)-18s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# イベント名 -> 日本語ラベル (人間可読ログ用)
ACTION_LABELS: Dict[str, str] = {
    "click-batch": "自動クリック",
    "manual-click": "手動クリック",
    "pop": "回収",
    "pop-all": "一括回収",
    "buy": "購入",
    "manual-buy": "手動購入",
    "buy-all-affordable": "購入可能なものを一括購入",
    "harvest": "収穫",
    "manual-harvest": "手動収穫",
    "plant": "植栽",
    "soil": "土壌変更",
    "freeze": "庭の凍結",
    "convert": "庭を供儀",
    "seed-unlocked": "種を解放",
    "unlock-start": "種の解放を開始",
    "unlock-complete": "種を全て解放",
    "unlock-spot": "変異スポット決定",
    "unlock-timeout": "変異タイムアウト",
    "weed-control": "雑草除去",
    "level-up": "建物レベルアップ",
    "manual-level-up": "手動レベルアップ",
    "upgrade": "強化",
    "manual-upgrade": "手動強化",
    "train": "ドラゴン育成",
    "manual-train": "手動ドラゴン育成",
    "set-aura": "オーラ変更",
    "switch": "季節切替",
    "manual-switch": "手動季節切替",
    "cast": "魔法詠唱",
    "slot-god": "神の配置",
    "hire-broker": "ブローカー雇用了",
    "office-upgrade": "オフィス拡張",
    "request": "転生要求",
    "ascend": "転生実行",
    "reincarnate": "現世復帰",
    "backup-ok": "バックアップ完了",
    "backup-timeout": "バックアップ待ちタイムアウト",
    "permanent-slot": "恒久スロット設定",
    "summary": "サマリ",
    "config-updated": "設定更新",
    "hook-installed": "エンジン接続",
    "ready": "ゲーム準備完了",
    "resumed": "スリープ復帰",
    "master-switch": "全体スイッチ",
    "module-toggle": "モジュールON/OFF",
    "module-error": "モジュールエラー",
    "js-error": "JSエラー",
    "error": "エラー",
    "save-imported": "セーブ読込",
    "close-prompt": "ダイアログを閉じた",
}

MODULE_LABELS: Dict[str, str] = {
    "clicker": "クリック",
    "golden": "ゴールデン",
    "wrinkler": "シワシワ",
    "upgrade": "アップグレード",
    "building": "施設",
    "lump": "ランプ",
    "garden": "農業",
    "market": "取引所",
    "grimoire": "魔法",
    "pantheon": "神殿",
    "dragon": "ドラゴン",
    "santa": "サンタ",
    "season": "季節",
    "ascend": "転生",
    "prestige": "天界ツリー",
    "housekeep": "保守",
    "core": "コア",
    "engine": "エンジン",
    "server": "管理画面",
    "save": "セーブ",
}


def _compact(obj: Any) -> str:
    """dict を k=v の並びにする."""
    if obj is None:
        return ""
    if isinstance(obj, dict):
        out = []
        for k, v in obj.items():
            if v is None or v == "" or v == [] or v == {}:
                continue
            if isinstance(v, float):
                v = round(v, 4)
            if isinstance(v, (dict, list)):
                v = json.dumps(v, ensure_ascii=False, default=str)
            out.append(f"{k}={v}")
        return " ".join(out)
    return str(obj)


class ActionLogger:
    """bot の行動を JSONL / テキスト / リングバッファに書き出す."""

    def __init__(self, ring_size: int = 3000, jsonl: bool = True, text: bool = True) -> None:
        ensure_dirs()
        self.ring: Deque[Dict[str, Any]] = deque(maxlen=max(100, ring_size))
        self.jsonl = jsonl
        self.text = text
        self._lock = threading.Lock()
        self._day = ""
        self._jsonl_fh = None
        self._text_fh = None
        self._count = 0
        self.log = logging.getLogger("ccbot.action")

    # ------------------------------------------------------------ 内部
    def _files_for_day(self, day: str) -> None:
        if day == self._day and self._jsonl_fh and self._text_fh:
            return
        self._close_files()
        self._day = day
        if self.jsonl:
            p = LOG_ACTIONS_DIR / f"{day}.jsonl"
            self._jsonl_fh = open(p, "a", encoding="utf-8")  # noqa: SIM115
        if self.text:
            p = LOG_ACTIONS_DIR / f"{day}.log"
            self._text_fh = open(p, "a", encoding="utf-8")  # noqa: SIM115

    def _close_files(self) -> None:
        for fh in (self._jsonl_fh, self._text_fh):
            try:
                if fh:
                    fh.flush()
                    fh.close()
            except Exception:  # noqa: BLE001, S110
                pass
        self._jsonl_fh = None
        self._text_fh = None

    def close(self) -> None:
        with self._lock:
            self._close_files()

    # ------------------------------------------------------------ 公開
    def record(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """JS エンジンから来た 1 イベントを記録する."""
        ts_ms = event.get("t") or int(time.time() * 1000)
        dt = datetime.fromtimestamp(ts_ms / 1000.0)
        day = dt.strftime("%Y-%m-%d")
        mod = str(event.get("m") or "?")
        act = str(event.get("a") or "?")
        detail = event.get("d") or {}
        result = event.get("r") or {}

        rec = {
            "ts": dt.strftime("%Y-%m-%d %H:%M:%S.") + f"{dt.microsecond // 1000:03d}",
            "epoch": ts_ms / 1000.0,
            "seq": event.get("i"),
            "module": mod,
            "module_jp": MODULE_LABELS.get(mod, mod),
            "action": act,
            "action_jp": ACTION_LABELS.get(act, act),
            "detail": detail,
            "result": result,
        }
        line = "{ts} [{mod}/{act}] {det} {res}".format(
            ts=rec["ts"],
            mod=rec["module_jp"],
            act=rec["action_jp"],
            det=_compact(detail),
            res=("-> " + _compact(result)) if result else "",
        ).rstrip()
        rec["line"] = line

        with self._lock:
            self.ring.append(rec)
            self._count += 1
            try:
                self._files_for_day(day)
                # クラッシュ時にログを失わないよう、1 件ごとにフラッシュする
                # (イベント数は毎秒数件程度なのでコストは無視できる)
                if self._jsonl_fh:
                    self._jsonl_fh.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
                    self._jsonl_fh.flush()
                if self._text_fh:
                    self._text_fh.write(line + "\n")
                    self._text_fh.flush()
            except Exception as exc:  # noqa: BLE001
                self.log.warning("行動ログの書き込みに失敗: %s", exc)
        return rec

    def record_many(self, events: Iterable[Dict[str, Any]]) -> int:
        n = 0
        for e in events:
            self.record(e)
            n += 1
        return n

    def system(self, module: str, action: str, detail: Any = None, result: Any = None) -> Dict[str, Any]:
        """Python 側で発生したイベントを同じ形式で記録する."""
        return self.record({"t": int(time.time() * 1000), "m": module, "a": action, "d": detail, "r": result})

    def tail(self, limit: int = 300, module: str = "", search: str = "") -> List[Dict[str, Any]]:
        with self._lock:
            items = list(self.ring)
        items.reverse()
        out: List[Dict[str, Any]] = []
        pat = re.compile(re.escape(search), re.I) if search else None
        for it in items:
            if module and it["module"] != module:
                continue
            if pat and not pat.search(it["line"]):
                continue
            out.append(it)
            if len(out) >= limit:
                break
        return out


class StatsLogger:
    """数値スナップショットを日別 JSONL に追記する."""

    def __init__(self) -> None:
        ensure_dirs()
        self._lock = threading.Lock()
        self._day = ""
        self._fh = None
        self.history: Deque[Dict[str, Any]] = deque(maxlen=4096)
        self.log = logging.getLogger("ccbot.stats")

    def _file_for(self, day: str) -> None:
        if day == self._day and self._fh:
            return
        self.close()
        self._day = day
        self._fh = open(LOG_STATS_DIR / f"{day}.jsonl", "a", encoding="utf-8")  # noqa: SIM115

    def write(self, snap: Dict[str, Any]) -> None:
        day = datetime.now().strftime("%Y-%m-%d")
        rec = {
            "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "epoch": time.time(),
            "cookies": snap.get("cookies"),
            "cookiesPs": snap.get("cookiesPs"),
            "cookiesEarned": snap.get("cookiesEarned"),
            "prestige": snap.get("prestige"),
            "heavenlyChips": snap.get("heavenlyChips"),
            "lumps": snap.get("lumps"),
            "buildingsOwned": snap.get("buildingsOwned"),
            "upgradesOwned": snap.get("upgradesOwned"),
            "mouseCps": snap.get("mouseCps"),
            "season": snap.get("season"),
            "onAscend": snap.get("onAscend"),
        }
        with self._lock:
            self.history.append(rec)
            try:
                self._file_for(day)
                if self._fh:
                    self._fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    self._fh.flush()
            except Exception as exc:  # noqa: BLE001
                self.log.warning("統計ログの書き込みに失敗: %s", exc)

    def close(self) -> None:
        try:
            if self._fh:
                self._fh.flush()
                self._fh.close()
        except Exception:  # noqa: BLE001, S110
            pass
        self._fh = None


def setup_logging(cfg: Dict[str, Any]) -> logging.Logger:
    """ロガーを初期化する."""
    ensure_dirs()
    lcfg = cfg.get("logging", {}) if isinstance(cfg, dict) else {}
    level = getattr(logging, str(lcfg.get("level", "INFO")).upper(), logging.INFO)

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    for h in list(root.handlers):
        root.removeHandler(h)

    fmt = logging.Formatter(_MAIN_FORMAT, _DATE_FORMAT)

    main = logging.handlers.RotatingFileHandler(
        LOG_DIR / "ccbot.log",
        maxBytes=int(lcfg.get("mainLogMaxBytes", 8 * 1024 * 1024)),
        backupCount=int(lcfg.get("mainLogBackups", 6)),
        encoding="utf-8",
    )
    main.setLevel(level)
    main.setFormatter(fmt)
    root.addHandler(main)

    err = logging.handlers.RotatingFileHandler(LOG_DIR / "error.log", maxBytes=4 * 1024 * 1024, backupCount=3, encoding="utf-8")
    err.setLevel(logging.WARNING)
    err.setFormatter(fmt)
    root.addHandler(err)

    if lcfg.get("console", True):
        con = logging.StreamHandler()
        con.setLevel(level)
        con.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%H:%M:%S"))
        root.addHandler(con)

    # playwright のうるさいログを抑える
    logging.getLogger("playwright").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)

    return logging.getLogger("ccbot")


def cleanup_old_logs(keep_days: int = 30) -> int:
    """古い日別ログを削除する。削除したファイル数を返す."""
    if keep_days <= 0:
        return 0
    cutoff = datetime.now() - timedelta(days=keep_days)
    removed = 0
    pat = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
    for folder in (LOG_ACTIONS_DIR, LOG_STATS_DIR):
        if not folder.exists():
            continue
        for p in folder.iterdir():
            m = pat.search(p.name)
            if not m:
                continue
            try:
                d = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError:
                continue
            if d < cutoff:
                try:
                    p.unlink()
                    removed += 1
                except OSError:
                    pass
    return removed


def log_files(kind: str = "actions") -> List[Dict[str, Any]]:
    folder = LOG_ACTIONS_DIR if kind == "actions" else LOG_STATS_DIR
    if not folder.exists():
        return []
    out = []
    for p in sorted(folder.glob("*.jsonl"), reverse=True):
        try:
            st = p.stat()
        except OSError:
            continue
        out.append({"name": p.name, "path": str(p), "size": st.st_size, "mtime": st.st_mtime})
    return out


def read_log_file(kind: str, name: str, tail_lines: int = 0) -> str:
    folder = LOG_ACTIONS_DIR if kind == "actions" else LOG_STATS_DIR
    # ディレクトリトラバーサル防止
    if "/" in name or "\\" in name or ".." in name:
        raise ValueError("invalid log name")
    p = folder / name
    if not p.exists():
        raise FileNotFoundError(name)
    text = p.read_text(encoding="utf-8", errors="replace")
    if tail_lines > 0:
        text = "\n".join(text.splitlines()[-tail_lines:])
    return text


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
