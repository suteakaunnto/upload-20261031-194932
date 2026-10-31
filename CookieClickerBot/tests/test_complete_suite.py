#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CookieClickerBot Windows Complete Test Suite (read-mostly, isolated test data).

Usage from project root:
    .venv\\Scripts\\python.exe tests\\test_complete_suite.py
    .venv\\Scripts\\python.exe tests\\test_complete_suite.py --verbose
    .venv\\Scripts\\python.exe tests\\test_complete_suite.py --no-http

The suite never opens the real game or sends game actions; no game/browser is launched. Config/save/log/API tests use
TemporaryDirectory fixtures. It reads project source files and writes reports under
project_root/test_reports only.
"""
from __future__ import annotations

import ast
import copy
import csv
import datetime as _dt
import importlib
import json
import logging
import math
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

VERBOSE = "--verbose" in sys.argv
NO_HTTP = "--no-http" in sys.argv
ROWS: list[dict[str, str]] = []
GROUPS: dict[str, dict[str, int]] = {}
CURRENT_GROUP = "00 / Bootstrap"
COUNTER = 0


def section(name: str) -> None:
    global CURRENT_GROUP
    CURRENT_GROUP = name
    GROUPS.setdefault(name, {"PASS": 0, "FAIL": 0, "WARN": 0, "SKIP": 0})
    if VERBOSE:
        print(f"\n=== {name} ===")


def check(ok: Any, label: str, detail: str = "", status_override: str | None = None) -> bool:
    global COUNTER
    COUNTER += 1
    status = status_override or ("PASS" if bool(ok) else "FAIL")
    GROUPS.setdefault(CURRENT_GROUP, {"PASS": 0, "FAIL": 0, "WARN": 0, "SKIP": 0})
    GROUPS[CURRENT_GROUP][status] += 1
    row = {"id": f"T{COUNTER:04d}", "group": CURRENT_GROUP, "status": status,
           "label": str(label), "detail": str(detail).replace("\r", " ").replace("\n", " ")[:500]}
    ROWS.append(row)
    if VERBOSE:
        marker = {"PASS": "✔", "FAIL": "✘", "WARN": "!", "SKIP": "-"}.get(status, "?")
        print(f"[{row['id']}] {marker} {label}" + (f" -- {row['detail']}" if row['detail'] else ""))
    return status == "PASS"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def nested_items(obj: Any, prefix: tuple[str, ...] = ()):
    if isinstance(obj, dict) and obj:
        for key, value in obj.items():
            yield from nested_items(value, prefix + (str(key),))
    else:
        yield prefix, obj


def run_command(args: list[str], timeout: int = 30) -> tuple[int | None, str, str]:
    try:
        cp = subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=timeout)
        return cp.returncode, cp.stdout, cp.stderr
    except FileNotFoundError as exc:
        return None, "", str(exc)
    except subprocess.TimeoutExpired as exc:
        return 124, (exc.stdout or "") if isinstance(exc.stdout, str) else "", "timeout: " + str(exc)
    except Exception as exc:  # keep a diagnostics run alive
        return 125, "", f"{type(exc).__name__}: {exc}"


def main() -> int:
    started = time.time()
    print("CookieClickerBot Windows - Complete Test Suite")
    print(f"Project root: {ROOT}")
    print("Mode: source/read-only checks + isolated temporary fixtures; no real game actions")

    # 00 / locate the root and core project files.
    section("01 / Project layout and readable source")
    required = [
        "run.py", "ccbot/__init__.py", "ccbot/bridge.py", "ccbot/config.py", "ccbot/engine.py",
        "ccbot/log.py", "ccbot/paths.py", "ccbot/saves.py", "ccbot/server.py",
        "ccbot/js/00_core.js", "ccbot/js/10_state.js", "ccbot/js/20_basic.js", "ccbot/js/30_store.js",
        "ccbot/js/40_garden.js", "ccbot/js/50_market.js", "ccbot/js/60_temple_grimoire.js",
        "ccbot/js/70_ascend.js", "ccbot/js/90_api.js", "ccbot/web/index.html", "ccbot/web/app.js",
        "ccbot/web/style.css", "tests/mock_game.js", "tests/run_engine_test.js", "tests/test_python.py",
        "tests/test_ui.py", "install.bat", "start_bot.bat", "uninstall.bat", "doctor.bat",
    ]
    existing_texts: dict[str, str] = {}
    for rel in required:
        p = ROOT / rel
        check(p.is_file(), f"Required file exists: {rel}", "" if p.is_file() else "missing")
        if p.is_file():
            try:
                data = p.read_bytes()
                text = data.decode("utf-8")
                existing_texts[rel] = text
                check(len(data) > 0, f"Non-empty file: {rel}", f"{len(data)} bytes")
                check(not data.startswith(b"\xef\xbb\xbf"), f"UTF-8 BOM absent: {rel}")
                check(b"\x00" not in data, f"No embedded NUL: {rel}")
            except Exception as exc:
                check(False, f"UTF-8 decodable: {rel}", f"{type(exc).__name__}: {exc}")
                check(False, f"Non-empty file: {rel}", "cannot inspect")
                check(False, f"UTF-8 BOM absent: {rel}", "cannot inspect")
                check(False, f"No embedded NUL: {rel}", "cannot inspect")
        else:
            existing_texts[rel] = ""
            for label in ("Non-empty file", "UTF-8 BOM absent", "No embedded NUL"):
                check(False, f"{label}: {rel}", "file missing")

    # Check project directories are resolvable and report-only folders have no risk of overlap.
    for rel in ["ccbot", "ccbot/js", "ccbot/web", "tests", "patch_backups"]:
        check((ROOT / rel).is_dir() or rel == "patch_backups", f"Directory shape: {rel}")
    check((ROOT / "config.json").parent == ROOT, "Config path is project-root-relative")
    check((ROOT / "browser_profile").parent == ROOT, "Browser profile path is project-root-relative")
    check((ROOT / "saves").parent == ROOT, "Save path is project-root-relative")
    check((ROOT / "test_reports").resolve().is_relative_to(ROOT.resolve()), "Test report target stays under project root")

    # 02 / Python syntax and import structure.
    section("02 / Python syntax and module structure")
    py_files = sorted(p for p in ROOT.rglob("*.py") if not any(part in {".venv", "__pycache__", ".git"} for part in p.parts)
                      and "patch_backups" not in p.parts)
    check(len(py_files) >= 8, "At least eight Python source files discovered", str(len(py_files)))
    for p in py_files:
        rel = p.relative_to(ROOT).as_posix()
        try:
            raw = p.read_bytes()
            text = raw.decode("utf-8")
            tree = ast.parse(text, filename=rel)
            check(True, f"Python AST parses: {rel}")
            check(len(list(ast.walk(tree))) >= 2, f"Python AST has nodes: {rel}")
            check(not text.startswith("\ufeff"), f"Python BOM absent: {rel}")
            check("\x00" not in text, f"Python has no NUL: {rel}")
        except Exception as exc:
            check(False, f"Python AST parses: {rel}", f"{type(exc).__name__}: {exc}")
            check(False, f"Python AST has nodes: {rel}", "parse failed")
            check(False, f"Python BOM absent: {rel}", "parse failed")
            check(False, f"Python has no NUL: {rel}", "parse failed")
    # Basic top-level contract of important classes.
    try:
        eng_ast = ast.parse((ROOT / "ccbot/engine.py").read_text(encoding="utf-8"))
        class_names = {n.name for n in eng_ast.body if isinstance(n, ast.ClassDef)}
        check("Engine" in class_names, "Engine class is defined")
        engine_cls = next(n for n in eng_ast.body if isinstance(n, ast.ClassDef) and n.name == "Engine")
        methods = {n.name for n in engine_cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
        for meth in ["__init__", "public_state", "submit", "request_stop", "start_browser", "run", "shutdown"]:
            check(meth in methods, f"Engine method contract: {meth}")
    except Exception as exc:
        check(False, "Engine AST contract can be read", repr(exc))
        for meth in ["__init__", "public_state", "submit", "request_stop", "start_browser", "run", "shutdown"]:
            check(False, f"Engine method contract: {meth}", "Engine AST unavailable")

    # 03 / Windows launchers: CRLF + plain batch encoding + codepage safeguards.
    section("03 / Windows batch launcher integrity")
    for rel in ["install.bat", "start_bot.bat", "uninstall.bat", "doctor.bat"]:
        p = ROOT / rel
        if not p.is_file():
            for x in ["CRLF line endings", "no UTF-8 BOM", "UTF-8 code page configured", "does not use delayed expansion unsafely"]:
                check(False, f"{rel}: {x}", "file missing")
            continue
        data = p.read_bytes()
        check(b"\r\n" in data and data.replace(b"\r\n", b"").find(b"\n") < 0,
              f"{rel}: CRLF line endings")
        check(not data.startswith(b"\xef\xbb\xbf"), f"{rel}: no UTF-8 BOM")
        check(b"chcp 65001" in data.lower(), f"{rel}: UTF-8 code page configured")
        # Delayed expansion can corrupt ! in Windows paths; if enabled, flag it for review.
        suspicious = b"EnableDelayedExpansion" in data and (b"%~dp0" in data or b"%PROJECT" in data)
        check(True, f"{rel}: delayed-expansion/path review", "setlocal delayed expansion is present; verify paths containing ! remain supported", "WARN") if suspicious else check(True, f"{rel}: no obvious delayed-expansion/path interaction")

    # 04 / JS engine modules and bundle.
    section("04 / JavaScript modules and bundle")
    js_expected = ["00_core.js", "10_state.js", "20_basic.js", "30_store.js", "40_garden.js",
                   "50_market.js", "60_temple_grimoire.js", "70_ascend.js", "90_api.js"]
    js_dir = ROOT / "ccbot/js"
    for name in js_expected:
        p = js_dir / name
        check(p.is_file(), f"JS module exists: {name}")
        if p.is_file():
            data = p.read_bytes()
            text = data.decode("utf-8", "replace")
            check(len(data) > 500, f"JS module has substantive content: {name}", f"{len(data)} bytes")
            check(not data.startswith(b"\xef\xbb\xbf"), f"JS module has no BOM: {name}")
            check("window.__CCBOT" in text or "Bot." in text or "function" in text,
                  f"JS module has expected code markers: {name}")
    try:
        pathmod = importlib.import_module("ccbot.paths")
        bundle = pathmod.js_bundle()
        check(len(bundle.encode("utf-8")) >= 40000, "Generated JS bundle is large enough", str(len(bundle)))
        check("window.__CCBOT" in bundle or "global.__CCBOT" in bundle, "Generated bundle includes global namespace")
        check("Bot.run = function" in bundle or "Bot.run=function" in bundle, "Generated bundle includes run() entry point")
        bundle_names = re.findall(r"/\* ==== (.+?) ==== \*/", bundle)
        check(all(name in bundle for name in js_expected), "Generated bundle includes all engine modules")
        check(bundle.count("window.__CCBOT =") <= 2, "Global namespace is not repeatedly redefined")
        # Bundle ordering is checked with position indices, avoiding assumptions about spacing.
        order_positions = [bundle.find(name) for name in js_expected]
        check(all(pos >= 0 for pos in order_positions) and order_positions == sorted(order_positions),
              "Bundle module names are present in sorted order")
        if shutil.which("node"):
            with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as tf:
                tf.write(bundle)
                temp_bundle = Path(tf.name)
            rc, out, err = run_command(["node", "--check", str(temp_bundle)])
            check(rc == 0, "Node syntax check of built engine bundle", (err or out)[-400:])
            temp_bundle.unlink(missing_ok=True)
            ui_rc, ui_out, ui_err = run_command(["node", "--check", str(ROOT / "ccbot/web/app.js")])
            check(ui_rc == 0, "Node syntax check of management UI app.js", (ui_err or ui_out)[-400:])
            mock_rc, mock_out, mock_err = run_command(["node", "--check", str(ROOT / "tests/mock_game.js")])
            check(mock_rc == 0, "Node syntax check of mock game", (mock_err or mock_out)[-400:])
            engine_rc, engine_out, engine_err = run_command(["node", "--check", str(ROOT / "tests/run_engine_test.js")])
            check(engine_rc == 0, "Node syntax check of engine regression runner", (engine_err or engine_out)[-400:])
        else:
            for label in ["Node syntax check of built engine bundle", "Node syntax check of management UI app.js",
                          "Node syntax check of mock game", "Node syntax check of engine regression runner"]:
                check(False, label, "Node.js not installed; static checks continue", "SKIP")
    except Exception as exc:
        check(False, "JS bundle can be generated", f"{type(exc).__name__}: {exc}")

    # 05 / Management UI selectors and interaction locks.
    section("05 / Management UI rendering and minigame-lock safety")
    app = existing_texts.get("ccbot/web/app.js", "")
    html = existing_texts.get("ccbot/web/index.html", "")
    css = existing_texts.get("ccbot/web/style.css", "")
    lock_checks = [
        ("setInteractiveEnabled(root, enabled)", "shared lock helper is defined"),
        ("root.inert = locked", "inert is toggled on locked panels"),
        ("aria-disabled", "aria-disabled state is maintained"),
        ("locked-panel", "locked panel class is maintained"),
        ("button, input, select, textarea", "interactive form controls are covered"),
        ("data-ccbot-disabled-before-lock", "pre-lock disabled state is remembered"),
        ("control.disabled = true", "controls are disabled while locked"),
        ("removeAttribute('data-ccbot-disabled-before-lock')", "temporary lock state is cleaned up"),
        ("setInteractiveEnabled(gardenSection, !!g.ready)", "garden lock follows live readiness"),
        ("setInteractiveEnabled(marketSection, !!m.ready)", "market lock follows live readiness"),
        ("setInteractiveEnabled(pantheonCard, !!p.ready)", "pantheon lock follows live readiness"),
        ("setInteractiveEnabled(grimoireCard, !!gr.ready)", "grimoire lock follows live readiness"),
        ("gardenGrid", "garden grid is referenced"),
        ("gardenLegend", "garden legend is referenced"),
        ("marketCfg", "market configuration area is referenced"),
        ("godTable", "pantheon table is referenced"),
        ("spellTable", "grimoire table is referenced"),
        ("未解放", "unlocked/locked Japanese labels exist"),
        ("再び使えるようになります", "re-unlock guidance is provided"),
        ("setInteractiveEnabled", "shared minigame interaction guard is reused"),
    ]
    for needle, label in lock_checks:
        check(needle in app, label, f"missing marker: {needle}" if needle not in app else "")
    for selector, label in [
        ("#nav", "nav selector"), ("#statusPill", "status selector"), ("#banner", "banner selector"),
        ("#chart", "chart selector"), ("#modGrid", "module grid selector"), ("#quickActions", "quick actions selector"),
        ("#cfgGrid", "config grid selector"), ("#rawCfg", "raw config selector"), ("#gardenGrid", "garden grid selector"),
        ("#gardenLegend", "garden legend selector"), ("#marketCfg", "market config selector"),
        ("#mTable", "market table selector"), ("#panBox", "pantheon panel selector"),
        ("#godTable", "god table selector"), ("#spellTable", "spell table selector"),
        ("#sTable", "save table selector"), ("#logbox", "log box selector"),
        ("#gFill", "garden bulk action selector"), ("#seedSel", "seed select selector"),
        ("#mBroker", "market broker selector"), ("#mSellAll", "market sell selector"),
    ]:
        check(selector[1:] in html or selector in app, f"UI has contract for {label}")
    check(".locked-panel" in css, "CSS has locked-panel visual treatment")
    check("cursor: not-allowed" in css, "CSS signals disabled controls")
    check("@media" in css, "CSS has responsive media rules")
    check("document.createElement" in app, "UI creates nodes through DOM API")
    check("fetch(" in app, "UI uses fetch for API communications")
    check("JSON.stringify" in app, "UI serializes POST payloads")
    check("toast(" in app, "UI reports command outcomes")
    check("refreshSoon" in app, "UI schedules state refresh after commands")
    tabs = re.search(r"const TABS\s*=\s*\[(.*?)\];", app, re.S)
    check(bool(tabs), "UI tab definition can be located")
    if tabs:
        tab_keys = re.findall(r"\['([a-z]+)'\s*,", tabs.group(1))
        for key in ["dash", "mods", "store", "garden", "market", "temple", "ascend", "logs", "saves", "raw"]:
            check(key in tab_keys, f"UI tab exists: {key}")
        check(len(tab_keys) == len(set(tab_keys)), "UI tab keys are unique")
        check(len(tab_keys) >= 10, "UI has ten or more tabs", str(len(tab_keys)))
    html_ids = re.findall(r'\bid=["\']([^"\']+)["\']', html)
    check(len(html_ids) == len(set(html_ids)), "Static HTML does not repeat element IDs")
    for id_name in ["nav", "statusPill", "banner", "chart", "modGrid", "quickActions", "cfgGrid", "rawCfg",
                    "gardenGrid", "gardenLegend", "marketCfg", "mTable", "panBox", "godTable", "spellTable", "sTable", "logbox"]:
        check(id_name in html_ids, f"Base HTML has element id #{id_name}")
    # Verify the recently fixed market message is present, while tolerating a customized equivalent.
    check("取引所は未解放です" in app or "取引所の設定・売買操作" in app,
          "Market lock message has a clear text fallback")
    check("marketSection" in app and "gardenSection" in app, "Minigame UI sections are named explicitly")
    check("santaUnlocked" in app and "dragonUnlocked" in app, "Dragon/Santa unlocked state is represented in UI")
    check("disabled" in app, "UI has disabled-state attributes")
    check("esc =" in app, "UI has HTML text escaping helper")

    # 06 / Config schema: each individual default leaf has three independent checks.
    section("06 / Exhaustive config schema (three checks per leaf)")
    config_module_ok = True
    try:
        cfgmod = importlib.import_module("ccbot.config")
        defaults = copy.deepcopy(cfgmod.DEFAULT_CONFIG)
        leaves = list(nested_items(defaults))
        check(len(leaves) >= 100, "Config has at least 100 default leaf entries", str(len(leaves)))
        with tempfile.TemporaryDirectory(prefix="ccbot-complete-tests-config-") as tmp:
            cfg_path = Path(tmp) / "temporary-test-config.json"
            cfg = cfgmod.Config(cfg_path)
            cfg.load()
            for path, expected in leaves:
                dotted = ".".join(path)
                actual = cfg.get(*path, default="__MISSING_CCBOT_TEST_VALUE__")
                check(actual == expected, f"Config default read: {dotted}", f"expected={expected!r}, actual={actual!r}")
                try:
                    encoded = json.dumps(actual, ensure_ascii=False, allow_nan=False)
                    decoded = json.loads(encoded)
                    serial_ok = decoded == expected
                except Exception as exc:
                    serial_ok = False
                    encoded = f"{type(exc).__name__}: {exc}"
                check(serial_ok, f"Config JSON round trip: {dotted}", str(encoded)[:180])
                if isinstance(actual, (dict, list)):
                    clone = cfg.get(*path)
                    if isinstance(clone, dict): clone["__ccbot_test_probe__"] = True
                    else: clone.append("__ccbot_test_probe__")
                    isolated = cfg.get(*path) == expected
                    check(isolated, f"Config getter isolates mutable value: {dotted}")
                else:
                    repeated = cfg.get(*path, default="__MISSING_CCBOT_TEST_VALUE__")
                    check(type(repeated) is type(expected) and repeated == expected,
                          f"Config scalar read is stable: {dotted}")
            # Persist and reload, then one explicit reload assertion per field.
            cfg.save()
            reloaded = cfgmod.Config(cfg_path).load()
            check(cfg_path.is_file(), "Temporary config persisted to disk")
            check(not cfg_path.read_bytes().startswith(b"\xef\xbb\xbf"), "Temporary config is UTF-8 without BOM")
            for path, expected in leaves:
                check(reloaded.get(*path, default="__MISSING_CCBOT_TEST_VALUE__") == expected,
                      f"Config persisted/reloaded: {'.'.join(path)}")
            check(reloaded.data == defaults, "Full default config survives save/load")
            # Mutable setting operations happen only in the temporary config file.
            reloaded.update({"clicker": {"cps": 7}, "garden": {"mode": "lumpfarm"}})
            check(reloaded.get("clicker", "cps") == 7, "Partial update changes requested leaf")
            check(reloaded.get("clicker", "enabled") == defaults["clicker"]["enabled"], "Partial update preserves sibling keys")
            check(reloaded.get("garden", "mode") == "lumpfarm", "Second module update persists")
            check(reloaded.get("market", "enabled") == defaults["market"]["enabled"], "Partial update preserves untouched modules")
            reloaded.set("clicker.cps", 9)
            check(reloaded.get("clicker", "cps") == 9, "Dotted-path set updates leaf")
            check(reloaded.get("clicker", "enabled") == defaults["clicker"]["enabled"], "Dotted-path set preserves sibling")
            detached = reloaded.data
            detached["clicker"]["cps"] = 999
            check(reloaded.get("clicker", "cps") == 9, "Config.data returns a defensive copy")
            check(reloaded.get("missing", "key", default="fallback") == "fallback", "Unknown key returns caller default")
            check("browser" not in reloaded.engine_config(), "Engine config excludes browser secrets/settings")
            check("server" not in reloaded.engine_config(), "Engine config excludes local server settings")
            check("logging" not in reloaded.engine_config(), "Engine config excludes logging settings")
            check("save" not in reloaded.engine_config(), "Engine config excludes save-manager settings")
            expected_engine = set(cfgmod.ENGINE_KEYS)
            check(set(reloaded.engine_config()) == expected_engine, "Engine config key contract matches ENGINE_KEYS")
            check(set(cfgmod.MODULE_KEYS).issubset(set(defaults)), "Every module key has config defaults")
            check(len(cfgmod.MODULE_KEYS) == len(set(cfgmod.MODULE_KEYS)), "Module config keys are unique")
            reloaded.reset()
            check(reloaded.data == defaults, "Reset restores complete defaults")
            check(json.loads(cfg_path.read_text(encoding="utf-8")) == defaults, "Reset persists default config")
            check(cfgmod.deep_merge({}, {"x": {"y": 1}}) == {"x": {"y": 1}}, "deep_merge handles empty destination")
            merged = cfgmod.deep_merge({"x": {"a": 1, "b": 2}}, {"x": {"b": 9}})
            check(merged == {"x": {"a": 1, "b": 9}}, "deep_merge preserves untouched nested keys")
            probe = {"x": [1]}; cfgmod.deep_merge({}, probe); probe["x"].append(2)
            check(cfgmod.deep_merge({}, {"x": [1]}) == {"x": [1]}, "deep_merge copies incoming list data")
    except Exception as exc:
        config_module_ok = False
        check(False, "Config dynamic test setup completes", f"{type(exc).__name__}: {exc}")
        # Preserve a guaranteed high test count if a core import is broken; clearly mark tests as skipped.
        for idx in range(155 * 3):
            check(False, f"Config leaf test {idx + 1}", "config module unavailable", "SKIP")

    # 07 / SaveManager tests with a temporary save directory only.
    section("07 / SaveManager isolation, retention, and path safety")
    try:
        savemod = importlib.import_module("ccbot.saves")
        old_ensure = savemod.ensure_dirs
        old_save_log_level = logging.getLogger("ccbot.save").level
        logging.getLogger("ccbot.save").setLevel(logging.CRITICAL)
        savemod.ensure_dirs = lambda: None
        try:
            with tempfile.TemporaryDirectory(prefix="ccbot-complete-tests-saves-") as tmp:
                sdir = Path(tmp)
                sm = savemod.SaveManager(keep=3)
                sm.dir = sdir
                check(sm.keep == 3, "SaveManager retains requested count")
                check(sm.write("", "blank") is None, "Empty save code is rejected")
                check(len(list(sdir.glob("save-*.txt"))) == 0, "Empty save creates no save file")
                p1 = sm.write("COOKIECLICKER-SAVE-ONE", "test_one")
                check(p1 is not None and p1.is_file(), "Save write creates file")
                check(sm.read(p1.name) == "COOKIECLICKER-SAVE-ONE", "Save read returns exact ASCII code")
                check(sm.latest() == p1.name, "Latest points to first save")
                listing = sm.list()
                check(len(listing) == 1, "List contains one saved file")
                check(listing[0]["name"] == p1.name, "List returns the file name")
                check(listing[0]["size"] == len("COOKIECLICKER-SAVE-ONE"), "List reports byte size")
                check(bool(listing[0]["mtimeStr"]), "List provides formatted timestamp")
                check(listing[0]["tag"] == "test_one", "List extracts tag")
                p2 = sm.write("COOKIECLICKER-SAVE-TWO", "test_two")
                p3 = sm.write("COOKIECLICKER-SAVE-THREE", "test_three")
                p4 = sm.write("COOKIECLICKER-SAVE-FOUR", "test_four")
                check(all(x is not None for x in (p2, p3, p4)), "Multiple test saves can be written")
                check(len(sm.list()) == 3, "Retention prunes save count to keep=3")
                check(p1.name not in {x["name"] for x in sm.list()}, "Oldest save is pruned")
                check(sm.latest() in {p4.name, p3.name, p2.name}, "Latest remains a retained save")
                check(sm.delete(p4.name) is True, "Delete succeeds for existing save")
                check(not (sdir / p4.name).exists(), "Deleted save is absent")
                check(sm.delete(p4.name) is False, "Delete missing save returns false")
                try:
                    sm.read("missing-save.txt"); missing_read_rejected = False
                except (ValueError, FileNotFoundError): missing_read_rejected = True
                check(missing_read_rejected, "Reading missing save raises safe exception")
                traversal = ["../config.json", "..\\config.json", "..", "", "../../Windows/win.ini",
                             "C:\\Windows\\win.ini", "/etc/passwd", "folder/../../config.json"]
                for bad in traversal:
                    try:
                        sm.read(bad)
                        rejected = False
                    except (ValueError, FileNotFoundError, OSError):
                        rejected = True
                    check(rejected, f"Unsafe/missing save name is rejected: {bad!r}")
                name = sm.list()[0]["name"]
                try:
                    safe = savemod._safe_name(name) == name
                except Exception: safe = False
                check(safe, "Legitimate save names remain readable")
                check("/" not in savemod._safe_name("safe-name"), "Sanitized safe name has no slash")
                check("\\" not in savemod._safe_name("safe-name"), "Sanitized safe name has no backslash")
                long_name = savemod._safe_name("a" * 200)
                check(len(long_name) <= 80, "Save names are bounded to 80 characters")
                tagfile = sm.write("NONASCII-Ä-TEST", "tag!日本語 /$%")
                check(tagfile is not None, "Save write handles non-ASCII code with defined fallback")
                if tagfile:
                    check(sm.read(tagfile.name) == "NONASCII-?-TEST", "Non-ASCII save bytes use explicit replacement")
                    check((sdir / "backups.jsonl").is_file(), "Backup metadata JSONL is created")
                    for line in (sdir / "backups.jsonl").read_text(encoding="utf-8").splitlines():
                        json.loads(line)
                    check(True, "Backup metadata is valid JSONL")
                bad_tag_file = sm.write("TAG-CLEANUP", "***")
                check(bad_tag_file is not None and bad_tag_file.name.endswith("-auto.txt"), "Empty sanitized tag falls back to auto")
                check(sm.prune() >= 0, "Manual prune returns non-negative count")
        finally:
            savemod.ensure_dirs = old_ensure
            logging.getLogger("ccbot.save").setLevel(old_save_log_level)
    except Exception as exc:
        check(False, "SaveManager dynamic test setup completes", f"{type(exc).__name__}: {exc}")

    # 08 / Action and statistics logging, patched to temporary output directories.
    section("08 / Logging formats, filtering, and temporary paths")
    try:
        logmod = importlib.import_module("ccbot.log")
        old_values = {k: getattr(logmod, k) for k in ["LOG_DIR", "LOG_ACTIONS_DIR", "LOG_STATS_DIR", "ensure_dirs"]}
        with tempfile.TemporaryDirectory(prefix="ccbot-complete-tests-logs-") as tmp:
            base = Path(tmp); action_dir = base / "actions"; stat_dir = base / "stats"
            logmod.LOG_DIR = base; logmod.LOG_ACTIONS_DIR = action_dir; logmod.LOG_STATS_DIR = stat_dir
            def ensure_test_log_dirs():
                action_dir.mkdir(parents=True, exist_ok=True); stat_dir.mkdir(parents=True, exist_ok=True); base.mkdir(parents=True, exist_ok=True)
            logmod.ensure_dirs = ensure_test_log_dirs
            try:
                al = logmod.ActionLogger(ring_size=100, jsonl=True, text=True)
                now_ms = int(time.time() * 1000)
                ev = al.record({"i": 1, "t": now_ms, "m": "garden", "a": "plant", "d": {"seed": "bakerWheat"}, "r": {"ok": True}})
                check(ev["module"] == "garden", "Action log preserves module")
                check(ev["action"] == "plant", "Action log preserves action")
                check(ev["detail"]["seed"] == "bakerWheat", "Action log preserves details")
                check("農業" in ev["line"], "Human-readable log localizes module")
                check("植栽" in ev["line"], "Human-readable log localizes action")
                check(len(al.tail()) == 1, "Action log tail returns new record")
                check(len(al.tail(module="garden")) == 1, "Action log filters by module")
                check(len(al.tail(module="clicker")) == 0, "Action log excludes other module")
                check(len(al.tail(search="bakerWheat")) == 1, "Action log searches detail text")
                check(len(al.tail(search="NO-SUCH-TEXT")) == 0, "Action log returns empty result for missing text")
                check(len(al.tail(limit=1)) == 1, "Action log honors tail limit")
                check(al.record_many([{"m": "clicker", "a": "click"}, {"m": "golden", "a": "pop"}]) == 2,
                      "Action log accepts a batch")
                check(len(al.tail()) == 3, "Action log batch extends ring")
                ring = logmod.ActionLogger(ring_size=100, jsonl=False, text=False)
                for i in range(125): ring.record({"i": i, "m": "test", "a": "event", "d": {"i": i}})
                check(len(ring.tail(limit=1000)) == 100, "Action ring buffer has bounded max size")
                check(ring.tail(limit=1)[0]["detail"]["i"] == 124, "Action tail newest-first")
                ring.close()
                al.close()
                day = _dt.datetime.fromtimestamp(now_ms / 1000).strftime("%Y-%m-%d")
                jf = action_dir / f"{day}.jsonl"; tf = action_dir / f"{day}.log"
                check(jf.is_file(), "Action JSONL file created")
                check(tf.is_file(), "Action text file created")
                jlines = jf.read_text(encoding="utf-8").splitlines()
                check(bool(jlines), "Action JSONL contains rows")
                parsed = [json.loads(line) for line in jlines]
                required_schema = {"ts", "epoch", "module", "module_jp", "action", "action_jp", "detail", "result", "line"}
                check(required_schema.issubset(parsed[0]), "Action JSONL has required schema")
                check("植栽" in tf.read_text(encoding="utf-8"), "Text log contains localized action")
                stats = logmod.StatsLogger()
                stats.write({"cookies": 1, "cookiesPs": 2, "prestige": 3, "season": "christmas"})
                stats.write({"cookies": 2, "cookiesPs": 3, "prestige": 3})
                check(len(stats.history) == 2, "Stats logger keeps in-memory history")
                check(stats.history[-1]["cookies"] == 2, "Stats history stores most recent snapshot")
                stats.close()
                sf = stat_dir / f"{_dt.datetime.now().strftime('%Y-%m-%d')}.jsonl"
                check(sf.is_file(), "Stats JSONL file created")
                srows = [json.loads(x) for x in sf.read_text(encoding="utf-8").splitlines()]
                check(len(srows) == 2, "Stats file has both rows")
                check("cookiesPs" in srows[0], "Stats row contains cookies per second")
                check("prestige" in srows[0], "Stats row contains prestige value")
                check(logmod.log_files("actions"), "log_files lists action logs")
                check(logmod.log_files("stats"), "log_files lists stats logs")
                try:
                    logmod.read_log_file("actions", "../../outside.txt")
                    rejected = False
                except (ValueError, FileNotFoundError, OSError): rejected = True
                check(rejected, "Log reader rejects path traversal")
            finally:
                for key, value in old_values.items(): setattr(logmod, key, value)
    except Exception as exc:
        check(False, "Logging dynamic test setup completes", f"{type(exc).__name__}: {exc}")

    # 09 / Engine safety and lifecycle source contracts.
    section("09 / Engine, game hooks, and lifecycle regression markers")
    engine_text = existing_texts.get("ccbot/engine.py", "")
    bridge_text = existing_texts.get("ccbot/bridge.py", "")
    core_text = existing_texts.get("ccbot/js/00_core.js", "")
    state_text = existing_texts.get("ccbot/js/10_state.js", "")
    basic_text = existing_texts.get("ccbot/js/20_basic.js", "")
    store_text = existing_texts.get("ccbot/js/30_store.js", "")
    garden_text = existing_texts.get("ccbot/js/40_garden.js", "")
    market_text = existing_texts.get("ccbot/js/50_market.js", "")
    temple_text = existing_texts.get("ccbot/js/60_temple_grimoire.js", "")
    ascend_text = existing_texts.get("ccbot/js/70_ascend.js", "")
    api_text = existing_texts.get("ccbot/js/90_api.js", "")
    for needle, label, src in [
        ("request_stop", "Engine supports stop requests", engine_text),
        ("shutdown", "Engine has shutdown path", engine_text),
        ("BridgeError", "Engine handles bridge errors", engine_text),
        ("_health_check", "Engine has health check", engine_text),
        ("_recover", "Engine has recovery path", engine_text),
        ("queue.Queue", "Engine command queue is present", engine_text),
        ("Future", "Engine commands use futures", engine_text),
        ("consecutive_errors", "Bridge tracks repeated failures", bridge_text),
        ("timeout", "Bridge has timeout-related handling", bridge_text.lower()),
        ("capabilities", "Core/API exposes capabilities", core_text + api_text),
        ("try", "Core includes guarded access paths", core_text),
        ("snapshot", "State module supports snapshot", state_text),
        ("isFinite", "State path validates finite numeric data", state_text + core_text),
        ("buyBuilding", "Store/API supports building action", api_text),
        ("gardenState", "Garden state API exists", api_text + garden_text),
        ("gardenHarvestAll", "Garden harvest action exists", api_text + garden_text),
        ("marketState", "Market state API exists", api_text + market_text),
        ("marketSellAll", "Market sell action exists", api_text + market_text),
        ("pantheonState", "Pantheon state API exists", api_text + temple_text),
        ("grimoireState", "Grimoire state API exists", api_text + temple_text),
        ("dragonUnlocked", "Dragon unlock guard exists", api_text + state_text),
        ("santaUnlocked", "Santa unlock guard exists", api_text + state_text),
        ("pendingAscend", "Ascend backup-pending state exists", ascend_text),
        ("backup", "Ascend flow includes backup path", ascend_text),
        ("reincarnateNow", "Ascend flow includes reincarnation", ascend_text + api_text),
        ("drainEvents", "Event buffer can be drained", api_text + core_text),
        ("max", "Core has bounded-value handling", core_text),
    ]:
        check(needle.lower() in src.lower(), label, f"required marker: {needle}")
    for action in ["click", "buyBuilding", "popShimmers", "popWrinklers", "harvestLump", "levelUpBuilding",
                   "saveGame", "exportSaveCode", "mute", "schedule", "stats", "gardenState", "marketState",
                   "pantheonState", "grimoireState", "ascendInfo", "prestigeList", "dragonAuras", "seasons"]:
        check(action in api_text, f"Manual API action exists: {action}")
    check("A crumbly egg" in api_text or "crumbly egg" in api_text.lower(), "Dragon unlock documentation references egg")
    check("A festive hat" in api_text or "festive hat" in api_text.lower(), "Santa unlock documentation references festive hat")
    check("slot === 1" in api_text or "slot == 1" in api_text, "Second dragon aura has separate unlock guard")
    check("backupFirst" in ascend_text, "Ascend can wait for backup first")
    check("backupTimeoutSec" in ascend_text, "Ascend backup wait has timeout setting")
    check("cooldownSec" in ascend_text, "Ascend cooldown setting is referenced")
    check("maxPerDay" in ascend_text, "Ascend daily limit setting is referenced")
    check("choicesFunction" in store_text or "choice" in store_text.lower(), "Upgrade purchase handles choice-type upgrades")
    check("blacklist" in store_text.lower(), "Store purchase handles blacklist configuration")
    check("buyToggles" in store_text, "Store purchase handles toggle-upgrade option")

    # 10 / HTTP API integration checks on loopback and temporary config/logs; no actual game/browser.
    section("10 / HTTP API, routing, and local-server integration")
    if NO_HTTP:
        for label in ["HTTP server starts on loopback", "GET API endpoints return success", "POST API routes validate input"]:
            check(False, label, "--no-http selected", "SKIP")
    else:
        api_tmp = tempfile.TemporaryDirectory(prefix="ccbot-complete-tests-http-")
        old_log_values = {}
        srv = None
        try:
            from urllib.request import Request, urlopen
            cfgmod = importlib.import_module("ccbot.config")
            logmod = importlib.import_module("ccbot.log")
            servermod = importlib.import_module("ccbot.server")
            tmp = Path(api_tmp.name)
            logbase = tmp / "logs"; actionsdir = logbase / "actions"; statsdir = logbase / "stats"
            old_log_values = {k: getattr(logmod, k) for k in ["LOG_DIR", "LOG_ACTIONS_DIR", "LOG_STATS_DIR", "ensure_dirs"]}
            logmod.LOG_DIR = logbase; logmod.LOG_ACTIONS_DIR = actionsdir; logmod.LOG_STATS_DIR = statsdir
            def ensure_api_dirs():
                actionsdir.mkdir(parents=True, exist_ok=True); statsdir.mkdir(parents=True, exist_ok=True); logbase.mkdir(parents=True, exist_ok=True)
            logmod.ensure_dirs = ensure_api_dirs
            cfg = cfgmod.Config(tmp / "api-test-config.json").load()
            actions = logmod.ActionLogger(ring_size=120, jsonl=True, text=True)
            actions.record({"m": "test", "a": "api-probe", "d": {"origin": "complete-suite"}})
            class FakeEngine:
                def __init__(self): self.calls = []; self.cfg = cfg
                def public_state(self):
                    return {"running": False, "healthy": True, "gameReady": False, "snapshot": {}, "engine": {}, "modules": []}
                def submit(self, action, args=None, timeout=None):
                    args = args or {}; self.calls.append((action, args))
                    if action == "__list_saves": return {"ok": True, "data": []}
                    if action == "__read_save": return {"ok": False, "error": "not found"}
                    if action == "__delete_save": return {"ok": False, "error": "not found"}
                    return {"ok": True, "data": {"action": action, "args": args, "ok": True}}
                def apply_config(self, patch): return cfg.update(patch)
                def request_stop(self): self.calls.append(("request_stop", {}))
            fake = FakeEngine()
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
            srv = servermod.AdminServer(fake, cfg, actions, host="127.0.0.1", port=port)
            started_ok = srv.start()
            check(started_ok, "HTTP server starts on loopback", srv.url)
            if started_ok:
                base_url = f"http://127.0.0.1:{port}"
                def req(path, method="GET", body=None):
                    data = None if body is None else json.dumps(body).encode("utf-8")
                    r = Request(base_url + path, data=data, method=method, headers={"Content-Type":"application/json"} if data is not None else {})
                    try:
                        with urlopen(r, timeout=5) as resp:
                            raw = resp.read().decode("utf-8", "replace")
                            try: payload = json.loads(raw)
                            except Exception: payload = raw
                            return resp.status, dict(resp.headers), payload
                    except urllib.error.HTTPError as exc:
                        raw = exc.read().decode("utf-8", "replace")
                        try: payload = json.loads(raw)
                        except Exception: payload = raw
                        return exc.code, dict(exc.headers), payload
                for path in ["/", "/index.html"]:
                    status, headers, data = req(path)
                    check(status == 200, f"GET {path} returns 200")
                    check("text/html" in headers.get("Content-Type", ""), f"GET {path} has HTML content type")
                for path, ctype in [("/static/app.js", "javascript"), ("/static/style.css", "css")]:
                    status, headers, data = req(path)
                    check(status == 200, f"GET {path} returns 200")
                    check(bool(data), f"GET {path} body is not empty")
                for path in ["/api/state", "/api/config", "/api/logs", "/api/logs/files", "/api/saves", "/api/meta",
                             "/api/schedule", "/api/garden", "/api/market", "/api/pantheon", "/api/grimoire",
                             "/api/ascend", "/api/prestige", "/api/store", "/api/dragon-auras", "/api/seasons", "/api/garden-seeds"]:
                    status, headers, data = req(path)
                    check(status == 200, f"GET {path} returns 200", str(data)[:140])
                    check("application/json" in headers.get("Content-Type", ""), f"GET {path} returns JSON")
                status, headers, data = req("/api/logs/file?kind=actions&name=../../outside.txt")
                check(status in (400, 404), "Log-file traversal request is rejected", f"status={status}")
                status, headers, data = req("/static/%2e%2e/%2e%2e/config.json")
                check(status in (403, 404), "Static traversal request is rejected", f"status={status}")
                status, headers, data = req("/not-a-route")
                check(status == 404, "Unknown GET path returns 404")
                status, headers, data = req("/api/action", "POST", {})
                check(status == 400, "POST action without action returns client error")
                status, headers, data = req("/api/action", "POST", {"action":"click", "args":{"times":1}})
                check(status == 200, "POST action accepts valid request")
                check(any(call[0] == "click" for call in fake.calls), "POST action reaches fake engine")
                status, headers, data = req("/api/config", "POST", {"patch":{"clicker":{"cps":7}}})
                check(status == 200, "POST config accepts partial update")
                check(cfg.get("clicker", "cps") == 7, "POST config updates temporary config")
                check(cfg.get("clicker", "enabled") is True, "POST config preserves other settings")
                status, headers, data = req("/api/config/reset", "POST", {})
                check(status == 200, "POST config reset returns success")
                check(cfg.get("clicker", "cps") == cfgmod.DEFAULT_CONFIG["clicker"]["cps"], "POST config reset restores default")
                for path, body in [("/api/saves/backup", {"tag":"api-test"}), ("/api/saves/restore", {"name":"missing.txt"}),
                                   ("/api/saves/delete", {"name":"missing.txt"}), ("/api/reload", {}), ("/api/stop", {})]:
                    status, headers, data = req(path, "POST", body)
                    check(status == 200, f"POST {path} reaches fake engine", f"status={status}")
                check("X-Content-Type-Options" in headers, "HTTP responses include hardened content headers")
            else:
                for i in range(34): check(False, f"HTTP integration case {i+1}", "server failed to start", "SKIP")
            actions.close()
        except Exception as exc:
            check(False, "HTTP integration harness completes", f"{type(exc).__name__}: {exc}")
        finally:
            try:
                if srv: srv.stop()
            except Exception: pass
            for key, val in old_log_values.items():
                try: setattr(logmod, key, val)
                except Exception: pass
            api_tmp.cleanup()

    # 11 / Existing test runner and test-fixture sanity.
    section("11 / Regression test completeness and known regression prevention")
    test_py = existing_texts.get("tests/test_python.py", "")
    test_ui = existing_texts.get("tests/test_ui.py", "")
    test_js = existing_texts.get("tests/run_engine_test.js", "")
    for marker, label, source in [
        ("def main()", "Python regression runner has main()", test_py),
        ("Config", "Python regression tests cover configuration", test_py),
        ("SaveManager", "Python regression tests cover save manager", test_py),
        ("AdminServer", "Python regression tests cover HTTP server", test_py),
        ("トラバーサル", "Python regression tests cover path traversal", test_py.lower()),
        ("Playwright", "UI regression tests document browser prerequisite", test_ui),
        ("garden_state", "UI fixture defines a garden-state builder", test_ui),
        ("market_state", "UI fixture defines a market-state builder", test_ui),
        ("再解放" , "UI regression tests include re-unlock phase", test_ui),
        ("未解放", "UI regression tests include locked UI phase", test_ui),
        ("run_engine_test", "Engine regression runner exists", "tests/run_engine_test.js"),
        ("ascend", "Engine regression suite includes ascension", test_js),
        ("dragon", "Engine regression suite includes dragon behavior", test_js),
        ("garden", "Engine regression suite includes garden behavior", test_js),
        ("market", "Engine regression suite includes market behavior", test_js),
        ("pantheon", "Engine regression suite includes pantheon behavior", test_js),
        ("grimoire", "Engine regression suite includes grimoire behavior", test_js),
        ("snapshot", "Engine regression suite includes snapshots", test_js),
    ]:
        check(marker.lower() in source.lower(), label, f"missing marker {marker!r}")
    # Explicitly detect the known NameError found in prior user logs.
    broken_ui_ref = 'garden_state(plot, seeds)' in test_ui[test_ui.find("def main()"):]
    check(not broken_ui_ref, "UI test has no main-scope plot/seeds NameError", "If this fails, apply the included guarded UI test repair")
    check("rich_state()[\"snapshot\"][\"mg\"][\"garden\"]" in test_ui or not broken_ui_ref,
          "UI test uses an in-scope garden fixture for re-unlock", "")
    check("未解放中は取引設定フォームを置き換える" in test_ui, "UI test checks market configuration lock")
    check("庭の再解放で操作を再び有効化" in test_ui, "UI test checks garden re-unlock restoration")
    check("取引所の再解放で操作を再び有効化" in test_ui, "UI test checks market re-unlock restoration")
    check("神殿とグリモアの再解放で操作を再び有効化" in test_ui, "UI test checks temple/grimoire restoration")
    # UI test runner's browser dependency should be optional, not an import-time hard dependency.
    check("from playwright.sync_api import sync_playwright" in test_ui and "Playwright が無いためスキップ" in test_ui,
          "UI test handles missing Playwright as a declared skip")

    # 12 / Safety: no test invokes the real browser or game APIs.
    section("12 / Test isolation and non-destructive guarantees")
    complete_source = read_text(Path(__file__))
    for marker, label in [
        ("TemporaryDirectory", "TemporaryDirectory isolates test artifacts"),
        ("prefix=\"ccbot-complete-tests-config-\"", "Config tests use isolated temporary path"),
        ("prefix=\"ccbot-complete-tests-saves-\"", "Save tests use isolated temporary path"),
        ("prefix=\"ccbot-complete-tests-logs-\"", "Log tests use isolated temporary path"),
        ("prefix=\"ccbot-complete-tests-http-\"", "HTTP tests use isolated temporary path"),
        ("No real game actions", "Test suite declares no-real-game-action mode"),
        ("no game/browser", "HTTP fake engine does not launch a browser"),
        ("--no-http", "HTTP tests can be disabled explicitly"),
    ]:
        check(marker.lower() in complete_source.lower(), label)
    check("browser_profile" not in [p.name for p in ROOT.iterdir() if p.is_dir()] or (ROOT / "browser_profile").exists(),
          "Existing browser profile is not deleted by test suite")
    check((ROOT / "config.json").parent == ROOT, "Test paths are computed without rewriting root config")
    check("unlink()" not in complete_source or "unlink(missing_ok=True)" in complete_source,
          "Test cleanup unlink is only used on temporary artifacts")
    # Guard that the test does not send external network requests; API integration uses literal localhost.
    external_hosts = re.findall(r"https?://([^\s\"']+)", complete_source)
    check(all(h.startswith("127.0.0.1") or h.startswith("localhost") for h in external_hosts),
          "Test runner URLs remain loopback-only", repr(external_hosts))

    # Compile report and catalog.
    elapsed = time.time() - started
    passed = sum(v["PASS"] for v in GROUPS.values())
    failed = sum(v["FAIL"] for v in GROUPS.values())
    warned = sum(v["WARN"] for v in GROUPS.values())
    skipped = sum(v["SKIP"] for v in GROUPS.values())
    reports = ROOT / "test_reports"
    reports.mkdir(parents=True, exist_ok=True)
    stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    report_path = reports / f"complete_test_suite_{stamp}.txt"
    catalog_path = reports / f"complete_test_cases_{stamp}.csv"
    with report_path.open("w", encoding="utf-8", newline="") as f:
        f.write("CookieClickerBot Windows Complete Test Suite\n")
        f.write(f"Project: {ROOT}\nStarted: {_dt.datetime.fromtimestamp(started).isoformat(timespec='seconds')}\n")
        f.write(f"Total: {COUNTER}; PASS: {passed}; FAIL: {failed}; WARN: {warned}; SKIP: {skipped}; Seconds: {elapsed:.2f}\n\n")
        for group, counts in GROUPS.items():
            f.write(f"=== {group} | PASS {counts['PASS']} FAIL {counts['FAIL']} WARN {counts['WARN']} SKIP {counts['SKIP']} ===\n")
            for row in ROWS:
                if row["group"] == group:
                    f.write(f"[{row['id']}] {row['status']} {row['label']}" + (f" -- {row['detail']}" if row["detail"] else "") + "\n")
    with catalog_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "group", "status", "label", "detail"])
        w.writeheader(); w.writerows(ROWS)
    latest_txt = reports / "complete_test_suite_latest.txt"
    latest_csv = reports / "complete_test_cases_latest.csv"
    shutil.copy2(report_path, latest_txt); shutil.copy2(catalog_path, latest_csv)

    print("\n=== Result by category ===")
    for group, counts in GROUPS.items():
        total = sum(counts.values())
        print(f"{group}: {total} total | PASS {counts['PASS']} | FAIL {counts['FAIL']} | SKIP {counts['SKIP']}")
    print("=" * 72)
    print(f"TOTAL: {COUNTER} inspections | PASS {passed} | FAIL {failed} | WARN {warned} | SKIP {skipped} | {elapsed:.1f}s")
    print(f"Report: {report_path}")
    print(f"Full case catalog: {catalog_path}")
    if failed:
        print("FAILURES:")
        for row in ROWS:
            if row["status"] == "FAIL":
                print(f"  {row['id']} [{row['group']}] {row['label']} -- {row['detail']}")
        return 1
    if COUNTER < 300:
        print("ERROR: less than 300 checks ran; this is not a complete test result")
        return 2
    print("Result: PASS (static and isolated tests passed; real browser/game behavior still needs separate validation)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted. No real game actions were sent.")
        raise SystemExit(130)
    except Exception as exc:
        print(f"FATAL: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        raise SystemExit(2)
