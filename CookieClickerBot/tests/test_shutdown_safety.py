from __future__ import annotations
import tempfile
import time
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ccbot.engine import Engine


class FakeConfig:
    def get(self, *keys, default=None):
        data = {"save": {"enabled": True, "keepBackups": 60, "backupOnExit": True,
                         "safetyCheckpointEverySec": 60}}
        cur = data
        for key in keys:
            if not isinstance(cur, dict) or key not in cur:
                return default
            cur = cur[key]
        return cur


class FakeActions:
    def __init__(self): self.events = []
    def system(self, *args, **kwargs): self.events.append((args, kwargs))


class FakeStats:
    def close(self): pass


class FakeBridge:
    def __init__(self, code=None, fail=False): self.code, self.fail = code, fail
    def call_data(self, action):
        if self.fail: raise RuntimeError("page already closed")
        if action == "exportSaveCode": return {"code": self.code}
        return {}


def main() -> int:
    checks = []
    def check(cond, name):
        checks.append((bool(cond), name))
        print(("  PASS " if cond else "  FAIL ") + name)

    with tempfile.TemporaryDirectory(prefix="ccbot-shutdown-test-") as tmp:
        actions = FakeActions()
        engine = Engine(FakeConfig(), actions, FakeStats())
        engine.saves.dir = Path(tmp) / "saves"
        engine.saves.dir.mkdir(parents=True)
        engine.saves.write("OLDER-PERIODIC-CODE", "periodic")
        engine.bridge = FakeBridge("LIVE-CODE-CHECKPOINT-123")
        check(engine.checkpoint_live_save(), "live save is checkpointed while page is alive")
        checkpoint = engine._live_checkpoint_path()
        check(checkpoint.is_file(), "checkpoint file is written atomically to internal subfolder")
        check(checkpoint.read_text(encoding="ascii") == "LIVE-CODE-CHECKPOINT-123", "checkpoint stores the latest save code")
        check(len(engine.saves.list()) == 1, "internal checkpoint is excluded from normal backup list")

        engine.bridge = FakeBridge(fail=True)
        exit_backup = engine.backup_save("exit", fallback_to_last_good=True)
        check(exit_backup is not None, "exit backup falls back when game page is already closed")
        check(engine.saves.read(exit_backup.name) == "LIVE-CODE-CHECKPOINT-123", "exit fallback prefers newer live checkpoint over older periodic backup")
        check(any(args and len(args) > 1 and args[1] == "backup-fallback" for args, _ in actions.events), "fallback is recorded in the action log")

        engine.bridge = FakeBridge("FRESH-LIVE-CODE-456")
        fresh = engine.backup_save("exit", fallback_to_last_good=True)
        check(fresh is not None and engine.saves.read(fresh.name) == "FRESH-LIVE-CODE-456", "live exit backup takes precedence when page is alive")

    passed = sum(ok for ok, _ in checks)
    failed = len(checks) - passed
    print(f"\nResult: {passed} passed / {failed} failed")
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    raise SystemExit(main())
