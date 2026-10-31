from __future__ import annotations
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ccbot.engine import Engine


class FakeConfig:
    def __init__(self, backup_on_ascend=True):
        self.backup_on_ascend = backup_on_ascend

    def get(self, *keys, default=None):
        if keys == ("save", "backupOnAscend"):
            return self.backup_on_ascend
        return default


class FakeActions:
    def __init__(self):
        self.events = []

    def system(self, *args, **kwargs):
        self.events.append((args, kwargs))


class FakeBridge:
    def __init__(self, result=None):
        self.result = result if result is not None else {"ok": True, "data": True}
        self.calls = []

    def call(self, action, args):
        self.calls.append((action, args))
        return self.result


class AscensionBackupSafetyTests(unittest.TestCase):
    def make_engine_like(self, backup_result, backup_on_ascend=True, ack_result=None):
        fake = SimpleNamespace()
        fake.snapshot = {"pendingAscend": {"gain": 365, "projected": 365}}
        fake.pending_ascend_handled_at = 0.0
        fake.cfg = FakeConfig(backup_on_ascend)
        fake.actions = FakeActions()
        fake.bridge = FakeBridge(ack_result)
        fake.backup_save = lambda tag: backup_result
        return fake

    def test_failed_backup_does_not_ack_or_proceed(self):
        fake = self.make_engine_like(None, True)
        Engine._handle_ascend_backup(fake)
        self.assertEqual(fake.bridge.calls, [], "must not acknowledge when backup failed")
        self.assertFalse(any(a[0][1] == "backup-approved" for a in fake.actions.events))
        self.assertTrue(any(a[0][1] == "backup-failed-hold" for a in fake.actions.events))

    def test_empty_backup_file_does_not_ack(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "empty.txt"
            p.write_text("", encoding="ascii")
            fake = self.make_engine_like(p, True)
            Engine._handle_ascend_backup(fake)
            self.assertEqual(fake.bridge.calls, [])
            self.assertFalse(any(a[0][1] == "backup-approved" for a in fake.actions.events))

    def test_verified_backup_is_acked(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "valid.txt"
            p.write_text("CookieClicker-save-code", encoding="ascii")
            fake = self.make_engine_like(p, True)
            Engine._handle_ascend_backup(fake)
            self.assertEqual(fake.bridge.calls[0][0], "clearAscendBackup")
            self.assertTrue(any(a[0][1] == "backup-approved" for a in fake.actions.events))

    def test_ack_failure_does_not_mark_approved(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "valid.txt"
            p.write_text("CookieClicker-save-code", encoding="ascii")
            fake = self.make_engine_like(p, True, {"ok": False, "error": "bridge closed"})
            Engine._handle_ascend_backup(fake)
            self.assertFalse(any(a[0][1] == "backup-approved" for a in fake.actions.events))
            self.assertTrue(any(a[0][1] == "backup-ack-failed-hold" for a in fake.actions.events))

    def test_explicitly_disabled_backup_is_reported(self):
        fake = self.make_engine_like(None, False)
        Engine._handle_ascend_backup(fake)
        self.assertEqual(fake.bridge.calls[0][0], "clearAscendBackup")
        self.assertTrue(any(a[0][1] == "backup-skipped-disabled" for a in fake.actions.events))
        self.assertTrue(any(a[0][1] == "backup-approved" for a in fake.actions.events))


if __name__ == "__main__":
    unittest.main(verbosity=2)
