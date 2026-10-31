"""セーブデータのバックアップ / 復元."""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .paths import SAVE_DIR, ensure_dirs

log = logging.getLogger("ccbot.save")

_STAMP = "%Y%m%d-%H%M%S"


def _safe_name(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9_\-.]", "_", str(name or ""))[:80]
    if not name or name in (".", ".."):
        raise ValueError("invalid name")
    if "/" in name or "\\" in name or ".." in name:
        raise ValueError("invalid name")
    return name


class SaveManager:
    def __init__(self, keep: int = 60) -> None:
        ensure_dirs()
        self.dir = SAVE_DIR
        self.keep = max(1, int(keep))

    # ------------------------------------------------------------ 保存
    def write(self, code: str, tag: str = "auto") -> Optional[Path]:
        if not code:
            log.warning("空のセーブコードは保存しません")
            return None
        tag = re.sub(r"[^A-Za-z0-9_\-]", "", str(tag))[:24] or "auto"
        name = f"save-{datetime.now().strftime(_STAMP)}-{tag}.txt"
        p = self.dir / name
        try:
            p.write_text(code, encoding="ascii", errors="replace")
        except Exception as exc:  # noqa: BLE001
            log.error("セーブの書き出しに失敗: %s", exc)
            return None
        meta = {
            "file": p.name,
            "tag": tag,
            "at": time.time(),
            "length": len(code),
        }
        try:
            (self.dir / "backups.jsonl").open("a", encoding="utf-8").write(json.dumps(meta, ensure_ascii=False) + "\n")
        except Exception:  # noqa: BLE001, S110
            pass
        log.info("セーブをバックアップしました: %s (%d bytes)", p.name, len(code))
        self.prune()
        return p

    def prune(self) -> int:
        files = sorted(self.dir.glob("save-*.txt"), key=lambda p: p.stat().st_mtime, reverse=True)
        removed = 0
        for p in files[self.keep:]:
            try:
                p.unlink()
                removed += 1
            except OSError:
                pass
        if removed:
            log.info("古いバックアップを %d 件削除しました", removed)
        return removed

    # ------------------------------------------------------------ 一覧 / 読み込み
    def list(self) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for p in sorted(self.dir.glob("save-*.txt"), key=lambda x: x.stat().st_mtime, reverse=True):
            st = p.stat()
            tag = ""
            m = re.match(r"save-\d{8}-\d{6}-(.+)\.txt$", p.name)
            if m:
                tag = m.group(1)
            out.append({
                "name": p.name,
                "tag": tag,
                "size": st.st_size,
                "mtime": st.st_mtime,
                "mtimeStr": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            })
        return out

    def read(self, name: str) -> str:
        p = self.dir / _safe_name(name)
        if not p.exists() or not p.is_file():
            raise FileNotFoundError(name)
        return p.read_text(encoding="ascii", errors="replace").strip()

    def delete(self, name: str) -> bool:
        p = self.dir / _safe_name(name)
        if p.exists():
            p.unlink()
            return True
        return False

    def latest(self) -> Optional[str]:
        items = self.list()
        if not items:
            return None
        return items[0]["name"]
