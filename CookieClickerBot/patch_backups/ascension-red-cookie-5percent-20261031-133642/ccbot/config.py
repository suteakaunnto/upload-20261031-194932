"""設定の読み書き / デフォルト値.

Python 側が設定の唯一の source of truth で、起動時にまるごとページ内エンジンへ送る。
config.json が無い場合は DEFAULT_CONFIG から生成する。
"""
from __future__ import annotations

import copy
import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict

from .paths import CONFIG_FILE, GAME_URL_DEFAULT

log = logging.getLogger("ccbot.config")

DEFAULT_CONFIG: Dict[str, Any] = {
    # ---------------------------------------------------------- ブラウザ
    "browser": {
        "url": GAME_URL_DEFAULT,
        "headless": False,
        "channel": "auto",            # auto | chrome | msedge | chromium
        "userDataDir": "browser_profile",
        "windowSize": [1440, 900],
        "slowMoMs": 0,
        "extraArgs": [],
        "stealthFlags": True,         # バックグラウンドスロットリング無効化など
        "waitTimeoutSec": 300,     # ゲーム起動(人間認証の解除含む)を待つ秒数
        "startRetries": 3,
        "reloadOnCrashSec": 30,
    },
    # ---------------------------------------------------------- 管理画面
    "server": {
        "enabled": True,
        "host": "127.0.0.1",
        "port": 8765,
        "openBrowser": True,
        "historyPoints": 720,
    },
    # ---------------------------------------------------------- ループ
    "loop": {
        "pollMs": 400,                # イベント回収の間隔
        "snapshotMs": 1000,           # 状態取得の間隔
        "commandTimeoutSec": 20,
    },
    # ---------------------------------------------------------- マスター
    "master": True,
    # ---------------------------------------------------------- モジュール
    "clicker": {
        "enabled": True, "cps": 12, "direct": False,
        "boostOnFrenzy": True, "boostMult": 3, "maxPerTick": 2,
    },
    "golden": {
        "enabled": True, "popGolden": True, "popWrath": True,
        "popReindeer": True, "popOthers": True, "minLifeMs": 0,
    },
    "wrinkler": {
        "enabled": True, "popShiny": True, "popAboveSucked": 0, "keep": 10,
    },
    "upgrade": {
        "enabled": True, "strategy": "cheapest", "reserveCookies": 0, "reserveRatio": 0,
        "buyToggles": False, "buyTech": True, "buyLumpUpgrades": True, "maxPerTick": 8,
        "blacklist": [], "whitelist": [], "grandmapocalypse": "ignore",
    },
    "building": {
        "enabled": True, "strategy": "payback", "reserveCookies": 0, "reserveRatio": 0,
        "maxPerTick": 25, "maxPaybackSec": 0, "ignore": [],
        "measureEveryMs": 1500, "maxMeasure": 10,
    },
    "lump": {
        "enabled": True, "autoHarvest": True, "autoLevel": True, "reserve": 0, "maxLevel": 10,
        "priority": [
            "Farm", "Temple", "Wizard tower", "Bank", "Cursor", "Grandma", "Mine", "Factory",
            "Shipment", "Alchemy lab", "Portal", "Time machine", "Antimatter condenser", "Prism",
            "Chancemaker", "Fractal engine", "Javascript console", "Idleverse", "Cortex baker", "You",
        ],
    },
    "garden": {
        "enabled": True, "mode": "auto", "farmSeed": "bakerWheat",
        "harvestMature": False, "soil": "auto", "unlockAll": True, "lumpFarm": True,
        "maxPlantPerTick": 6, "weedControl": True, "freezeWhenDone": False,
    },
    "market": {
        "enabled": True, "strategy": "swing", "buyBelowRatio": 0.80, "sellAboveRatio": 1.35,
        "momentum": True, "spendRatio": 0.6, "minProfitCpsSec": 60, "stopLossRatio": 0.55,
        "minProfitRatio": 0.25, "partialSellRatio": 1.0, "maxStockRatio": 1.0,
        "maxBuyPerTick": 500, "minBuyQty": 1, "tradeHidden": False,
        "autoBrokers": True, "brokerReserveMult": 1.5, "autoOffice": True,
        "useLoans": False, "goods": {},
    },
    "grimoire": {
        "enabled": True, "spells": ["conjure baked goods", "hand of fate"],
        "minMagicRatio": 1.0, "reserve": 0, "allowBackfire": False,
    },
    "pantheon": {
        "enabled": True, "autoSlot": True,
        "loadout": ["creation", "scorn", "order"], "respectSwaps": True,
    },
    "dragon": {
        "enabled": True, "autoTrain": True,
        "aura1": "Dragon God", "aura2": "Reality Bending",
    },
    "santa": {"enabled": True, "autoUpgrade": True, "maxLevel": 14, "maxCostRatio": 1.0},
    "season": {"enabled": False, "preferred": "", "maxCostRatio": 0.02, "autoSwitch": False},
    "ascend": {
        "enabled": True, "mode": "percent", "percent": 50, "minGain": 1,
        "minAbsolutePrestige": 0, "cooldownSec": 0, "maxPerDay": 0,
        "backupFirst": True, "backupTimeoutSec": 60,
        "autoReincarnate": True, "reincarnateDelaySec": 3,
        "prestigeOnAscend": True, "challengeMode": 0,
    },
    "prestige": {
        "enabled": True, "strategy": "priority", "reserveChips": 0, "maxPerTick": 12,
        "blacklist": [], "permanentUpgrades": [], "autoAssignPermanent": True,
        "priorityList": [],
    },
    "housekeep": {
        "enabled": True, "closePrompts": True, "muteSound": True, "muteMusic": True,
        "reduceParticles": True, "keepAwake": True, "autoResume": True, "autosaveSec": 60,
    },
    # ---------------------------------------------------------- セーブ
    "save": {
        "enabled": True,
        "backupEverySec": 900,          # ユーザー一覧向けの通常バックアップ間隔
        "safetyCheckpointEverySec": 60, # ページ終了に備えた内部チェックポイント間隔 (秒)
        "backupOnAscend": True,
        "backupOnExit": True,
        "keepBackups": 60,
    },
    # ---------------------------------------------------------- ログ
    "logging": {
        "level": "INFO",
        "console": True,
        "mainLogMaxBytes": 8 * 1024 * 1024,
        "mainLogBackups": 6,
        "actionJsonl": True,
        "actionText": True,
        "statsEverySec": 60,
        "ringBuffer": 3000,
        "logConsoleEvents": True,
        "keepDays": 30,
    },
}

# 管理画面で「モジュール」として扱うキー
MODULE_KEYS = [
    "clicker", "golden", "wrinkler", "upgrade", "building", "lump", "garden",
    "market", "grimoire", "pantheon", "dragon", "santa", "season",
    "ascend", "prestige", "housekeep",
]

# JS 側エンジンへ渡す設定キー (browser / server / loop / save / logging 以外は全部)
ENGINE_KEYS = ["master"] + MODULE_KEYS


def deep_merge(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in (src or {}).items():
        if isinstance(v, dict):
            if not isinstance(dst.get(k), dict):
                dst[k] = {}
            deep_merge(dst[k], v)
        else:
            dst[k] = copy.deepcopy(v)
    return dst


class Config:
    """スレッドセーフな設定コンテナ."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path or CONFIG_FILE)
        self._lock = threading.RLock()
        self._data: Dict[str, Any] = copy.deepcopy(DEFAULT_CONFIG)
        self._dirty = False

    # ------------------------------------------------------------ IO
    def load(self) -> "Config":
        with self._lock:
            self._data = copy.deepcopy(DEFAULT_CONFIG)
            if self.path.exists():
                try:
                    raw = json.loads(self.path.read_text(encoding="utf-8"))
                    deep_merge(self._data, raw)
                    log.info("設定を読み込みました: %s", self.path)
                except Exception as exc:  # noqa: BLE001
                    log.error("設定ファイルの読み込みに失敗 (%s) - デフォルト値を使います", exc)
            else:
                self.save()
                log.info("設定ファイルを作成しました: %s", self.path)
        return self

    def save(self) -> None:
        with self._lock:
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                tmp = self.path.with_suffix(".json.tmp")
                tmp.write_text(json.dumps(self._data, indent=2, ensure_ascii=False, sort_keys=False), encoding="utf-8")
                tmp.replace(self.path)
                self._dirty = False
            except Exception as exc:  # noqa: BLE001
                log.error("設定の保存に失敗: %s", exc)

    # ------------------------------------------------------------ access
    @property
    def data(self) -> Dict[str, Any]:
        with self._lock:
            return copy.deepcopy(self._data)

    def get(self, *keys: str, default: Any = None) -> Any:
        with self._lock:
            cur: Any = self._data
            for k in keys:
                if not isinstance(cur, dict) or k not in cur:
                    return default
                cur = cur[k]
            return copy.deepcopy(cur)

    def update(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        """部分的に更新して保存する。返り値は更新後の全体."""
        with self._lock:
            deep_merge(self._data, patch or {})
            self._dirty = True
        self.save()
        return self.data

    def set(self, dotted: str, value: Any) -> None:
        keys = dotted.split(".")
        with self._lock:
            cur = self._data
            for k in keys[:-1]:
                if not isinstance(cur.get(k), dict):
                    cur[k] = {}
                cur = cur[k]
            cur[keys[-1]] = value
            self._dirty = True
        self.save()

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            self._data = copy.deepcopy(DEFAULT_CONFIG)
        self.save()
        return self.data

    # ------------------------------------------------------------ エンジン向け
    def engine_config(self) -> Dict[str, Any]:
        """ページ内エンジンへ渡す設定 (browser/server などを除く)."""
        with self._lock:
            return {k: copy.deepcopy(self._data[k]) for k in ENGINE_KEYS if k in self._data}
