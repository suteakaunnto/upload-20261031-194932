"""パス定義. すべての成果物はプロジェクト直下に集約する."""
from __future__ import annotations

import os
from pathlib import Path

# ccbot/paths.py -> ccbot/ -> プロジェクトルート
BASE_DIR: Path = Path(__file__).resolve().parent.parent

JS_DIR: Path = BASE_DIR / "ccbot" / "js"
WEB_DIR: Path = BASE_DIR / "ccbot" / "web"

CONFIG_FILE: Path = BASE_DIR / "config.json"

LOG_DIR: Path = BASE_DIR / "logs"
LOG_ACTIONS_DIR: Path = LOG_DIR / "actions"
LOG_STATS_DIR: Path = LOG_DIR / "stats"
SAVE_DIR: Path = BASE_DIR / "saves"

PROFILE_DIR: Path = BASE_DIR / "browser_profile"

GAME_URL_DEFAULT = "https://orteil.dashnet.org/cookieclicker/"


def ensure_dirs() -> None:
    """必要なディレクトリを作成する."""
    for d in (LOG_DIR, LOG_ACTIONS_DIR, LOG_STATS_DIR, SAVE_DIR, PROFILE_DIR):
        d.mkdir(parents=True, exist_ok=True)


def js_bundle() -> str:
    """ccbot/js/*.js をファイル名の辞書順に連結した文字列を返す."""
    parts = []
    for path in sorted(JS_DIR.glob("*.js")):
        parts.append("/* ==== %s ==== */\n" % path.name)
        parts.append(path.read_text(encoding="utf-8"))
        parts.append("\n")
    return "".join(parts)


def env_flag(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")
