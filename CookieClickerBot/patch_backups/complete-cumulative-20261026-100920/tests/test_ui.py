#!/usr/bin/env python3
"""管理画面 UI のスモークテスト.

ヘッドレスブラウザで実際の管理画面を開き、全タブを巡回して
「JavaScript エラーが出ないこと」「各タブに中身が描画されること」を確認します。

    python tests/test_ui.py

Playwright が必要です (install.bat で入ります)。無い場合はスキップします。
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

PASS = 0
FAIL = 0
FAILS: list[str] = []


def ok(cond: bool, label: str, extra=None) -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  \033[32m✔\033[0m " + label)
    else:
        FAIL += 1
        FAILS.append(label)
        print("  \033[31m✘\033[0m " + label + (("  -- " + repr(extra)[:300]) if extra is not None else ""))


def section(t: str) -> None:
    print("\n\033[36m== " + t + " ==\033[0m")


# ---------------------------------------------------------------- 偽の状態
def rich_state() -> dict:
    now = time.time()
    buildings = ['Cursor', 'Grandma', 'Farm', 'Mine', 'Factory', 'Bank', 'Temple', 'Wizard tower',
                 'Shipment', 'Alchemy lab', 'Portal', 'Time machine', 'Antimatter condenser', 'Prism',
                 'Chancemaker', 'Fractal engine', 'Javascript console', 'Idleverse', 'Cortex baker', 'You']
    gods = ['asceticism', 'decadence', 'ruin', 'ages', 'seasons', 'creation', 'labor',
            'industry', 'mother', 'scorn', 'order']
    spells = ['conjure baked goods', 'hand of fate', 'stretch time', 'spontaneous edifice',
              "haggler's charm", 'summon crafty pixies', "gambler's fever dream",
              'resurrect abomination', 'diminish ineptitude']
    seeds = ['bakerWheat', 'thumbcorn', 'cronerice', 'gildmillet', 'clover', 'goldenClover',
             'shimmerlily', 'elderwort', 'bakeberry', 'chocoroot', 'whiteChocoroot', 'whiteMildew',
             'brownMold', 'meddleweed', 'whiskerbloom', 'chimerose', 'nursetulip', 'drowsyfern',
             'wardlichen', 'keenmoss', 'queenbeet', 'queenbeetLump', 'duketater', 'crumbspore',
             'doughshroom', 'glovemorel', 'cheapcap', 'foolBolete', 'wrinklegill', 'greenRot',
             'shriekbulb', 'tidygrass', 'everdaisy', 'ichorpuff']
    plot = []
    for y in range(6):
        for x in range(6):
            empty = (x + y) % 7 == 0
            plot.append({"x": x, "y": y, "empty": empty,
                         "key": None if empty else seeds[(x + y) % 10],
                         "name": None if empty else seeds[(x + y) % 10],
                         "age": 40 + x, "mature": True, "immortal": False,
                         "weed": (not empty and seeds[(x + y) % 10] == 'meddleweed')})
    return {
        "running": True, "healthy": True, "gameReady": True,
        "startedAt": now - 3600, "uptimeSec": 3600, "loadState": "ready",
        "snapshot": {
            "ready": True, "version": "2.058", "botVersion": "1.0.0",
            "cookies": 1.23e15, "cookiesPs": 4.5e9, "mouseCps": 1.2e6,
            "prestige": 1234, "heavenlyChips": 56, "lumps": 23,
            "buildingsOwned": 900, "upgradesOwned": 300, "ascensions": 7,
            "fps": 30, "gameT": 123456, "season": "christmas", "seasonT": 3600 * 30,
            "santaLevel": 5, "dragonLevel": 25, "dragonLevelsMax": 25,
            "dragonAura": 8, "dragonAura2": 18,
            "dragonAuraName": "Dragon God", "dragonAura2Name": "Reality Bending",
            "onAscend": 0, "wrinklersPopped": 44, "goldenClicks": 222,
            "missedGoldenClicks": 3, "cookiesEarned": 9e15, "cookiesReset": 1e15,
            "heavenlyChipsSpent": 1200, "lumpAge": 3600e3, "lumpRipeAge": 82800e3,
            "buildings": [{"id": i, "key": k.lower(), "name": k, "amount": 100 + i, "level": 3,
                           "price": 10 ** (i + 2), "minigame": i in (2, 5, 6, 7),
                           "minigameReady": i in (2, 5, 6, 7)} for i, k in enumerate(buildings)],
            "store": [{"id": i, "name": "Upgrade %d" % i, "pool": "main", "price": 10 ** (i + 3),
                       "priceLumps": 0, "canBuy": i % 2 == 0, "vaulted": False} for i in range(20)],
            "buffs": [{"name": "Frenzy", "dname": "Frenzy", "time": 300},
                      {"name": "Click frenzy", "dname": "Click frenzy", "time": 90}],
            "shimmers": [{"type": "golden", "wrath": 0, "force": "", "popped": False}],
            "wrinklers": {"total": 10, "sucking": 10, "shiny": 1, "sucked": 1.2e12},
            "permanentUpgrades": [{"slot": i, "id": -1, "name": None} for i in range(5)],
            "botStats": {"clicks": 50000, "buildings": 900, "upgrades": 300, "golden": 222, "ascensions": 7},
            "ascendInfo": {"prestige": 1234, "projected": 2000, "gain": 766, "requiredGain": 617,
                           "chips": 56, "ready": True, "pending": False, "ascendsToday": 1},
            "moduleSchedule": [{"name": n, "ms": m, "enabled": True, "lastRun": 100} for n, m in
                               [("clicker", 0), ("golden", 120), ("building", 1200),
                                ("garden", 4000), ("market", 15000), ("ascend", 5000)]],
            "pendingAscend": None,
            "mg": {
                "garden": garden_state(plot, seeds),
                "market": market_state(),
                "pantheon": {"ready": True, "level": 9, "swaps": 2, "maxSwaps": 3, "swapInSec": 1800,
                             "slots": [5, -1, -1], "slotNames": ["Diamond", "Ruby", "Jade"],
                             "gods": [{"id": i, "key": k, "name": "God " + k,
                                       "slot": (0 if i == 5 else -1), "effect": "+15% base CpS"}
                                      for i, k in enumerate(gods)]},
                "grimoire": {"ready": True, "level": 9, "magic": 80, "magicM": 100,
                             "spellsCast": 10, "spellsCastTotal": 40,
                             "spells": [{"id": i, "key": k, "name": k.title(), "cost": 20,
                                         "costMin": 2, "costPercent": 0.4, "failChance": 0.15,
                                         "castable": True} for i, k in enumerate(spells)]},
            },
        },
        "capabilities": {"game": True, "version": "2.058", "hooks": True,
                         "probes": {"Game.ClickCookie": True, "Game.Ascend": True, "garden": True,
                                    "market": True, "pantheon": True, "grimoire": True}},
        "modules": [],
        "history": {"t": [now - 600 + i * 10 for i in range(60)],
                    "cookies": [1e15 + i * 1e13 for i in range(60)],
                    "cps": [4e9 + i * 1e7 for i in range(60)],
                    "prestige": [1234] * 60},
        "engine": {"calls": 9999, "errors": 2, "consecutiveErrors": 0, "lastOk": now, "reloads": 0},
        "lastEventSeq": 1234,
        "lastBackup": {"at": now - 60, "name": "save-20261021-120000-periodic.txt"},
        "lastError": "", "botStats": {"clicks": 50000},
    }


def garden_state(plot, seeds):
    return {
        "ready": True, "level": 9, "farms": 150, "unlocked": 22, "total": 34,
        "soil": "clay", "freeze": False, "stepT": 900, "nextStepIn": 120,
        "harvests": 400, "plants": 30, "plot": plot,
        "seeds": [{"key": k, "name": k, "id": i, "unlocked": i < 22, "plantable": k != 'queenbeetLump',
                   "mature": 35 + i, "cost": 1e6 * (i + 1), "costStr": "%dM" % (i + 1),
                   "weed": k in ('meddleweed', 'whiteMildew', 'brownMold', 'crumbspore', 'doughshroom'),
                   "worth": 'cookies' if k in ('bakeberry', 'chocoroot') else '', "missing": i >= 22}
                  for i, k in enumerate(seeds)],
        "soils": [{"key": k, "name": k.title(), "id": i, "tick": t, "req": r, "effMult": 1,
                   "weedMult": 1, "available": True}
                  for i, (k, t, r) in enumerate([("dirt", 5, 0), ("fertilizer", 3, 50), ("clay", 15, 100)])],
        "missingSeeds": ["elderwort", "queenbeetLump"],
        "plan": {"target": "elderwort", "phase": "waiting-mutation",
                 "since": time.time() * 1000 - 60000, "attempts": 1, "reserved": 9},
    }


def market_state():
    return {
        "ready": True, "level": 9, "officeLevel": 2, "brokers": 8, "maxBrokers": 16,
        "brokerPrice": 1e9, "profit": 12345, "ticks": 500, "secondsPerTick": 60,
        "goods": 16, "overhead": 1.13,
        "items": [{"id": i, "key": "farm", "name": "Cereals %d" % i, "symbol": "CRL",
                   "val": 12.5 + i, "prev": 11.0, "stock": 50, "maxStock": 200,
                   "mode": i % 6, "modeName": ["stable", "slow rise", "slow fall", "bull run", "crash", "chaotic"][i % 6],
                   "dur": 300, "d": 0.2, "restingVal": 13, "hidden": False, "active": True,
                   "unitCost": 1e8, "unitSell": 1e8,
                   "history": [10 + i * 0.1 + j * 0.05 for j in range(30)],
                   "position": {"qty": 50, "avg": 11.2}, "last": 0} for i in range(16)],
    }


def prestige_tree():
    names = ["Legacy", "Heavenly cookies", "Heavenly luck", "Twin Gates of Transcendence",
             "Angels", "Archangels", "Persistent memory", "Season switcher"]
    return [{"id": i, "name": n, "price": 7 ** i, "bought": i < 3,
             "canBePurchased": i >= 3, "affordable": i < 6,
             "parents": [{"name": names[i - 1], "bought": i < 4}] if i else []}
            for i, n in enumerate(names)]


class UIEngine:
    """管理画面が必要とする応答だけを返す偽エンジン."""

    def __init__(self, cfg) -> None:
        self.cfg = cfg
        self.calls: list[str] = []
        self.state = rich_state()
        self.started_at = time.time()

    def public_state(self) -> dict:
        return self.state

    def submit(self, action: str, args: dict | None = None, timeout: float | None = None) -> dict:
        self.calls.append(action)
        args = args or {}
        table = {
            "capabilities": self.state["capabilities"],
            "schedule": self.state["snapshot"]["moduleSchedule"],
            "gardenState": self.state["snapshot"]["mg"]["garden"],
            "marketState": self.state["snapshot"]["mg"]["market"],
            "pantheonState": self.state["snapshot"]["mg"]["pantheon"],
            "grimoireState": self.state["snapshot"]["mg"]["grimoire"],
            "ascendInfo": self.state["snapshot"]["ascendInfo"],
            "prestigeList": prestige_tree(),
            "snapshot": self.state["snapshot"],
            "dragonAuras": [{"index": i, "name": n, "unlocked": i < 20} for i, n in
                            enumerate(["No aura", "Breath of Milk", "Dragon Cursor", "Dragon God", "Reality Bending"])],
            "seasons": [{"key": k, "name": n, "trigger": t, "price": 1e9, "active": k == "christmas"}
                        for k, n, t in [("christmas", "Christmas", "Festive biscuit"),
                                        ("valentines", "Valentine's day", "Lovesick biscuit")]],
            "gardenSeeds": self.state["snapshot"]["mg"]["garden"]["seeds"],
            "__list_saves": [{"name": "save-20261021-120000-periodic.txt", "tag": "periodic",
                              "size": 4096, "mtime": time.time(), "mtimeStr": "2026-10-21 12:00:00"}],
            "__backup": {"ok": True, "name": "save-x.txt"},
            "__restore": {"ok": True},
            "__delete_save": {"ok": True},
            "__read_save": {"code": "MOCKCODE"},
            "__reload_page": {"ok": True},
            "__stop": {"ok": True},
        }
        if action in table:
            return {"ok": True, "name": action, "data": table[action]}
        return {"ok": True, "name": action, "data": {"ok": True, "echo": args}}

    def apply_config(self, patch: dict) -> dict:
        return self.cfg.update(patch)

    def request_stop(self) -> None:
        self.calls.append("__stop")


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:  # noqa: BLE001
        print("Playwright が無いためスキップします:", exc)
        return 0

    from ccbot.config import Config
    from ccbot.log import ActionLogger, StatsLogger, setup_logging
    from ccbot.server import AdminServer

    setup_logging({"logging": {"level": "ERROR", "console": False}})
    cfg = Config(ROOT / "tests" / "_ui_cfg.json")
    cfg.load()
    eng = UIEngine(cfg)
    actions = ActionLogger(ring_size=50, jsonl=False, text=False)
    for i in range(6):
        actions.record({"i": i, "t": int(time.time() * 1000), "m": "building", "a": "buy",
                        "d": {"count": i}, "r": {"spent": 1e6}})
    srv = AdminServer(eng, cfg, actions, host="127.0.0.1", port=18997)
    if not srv.start():
        print("管理画面サーバを起動できませんでした (ポート 18997 が使用中?)")
        return 1
    time.sleep(0.5)

    errors: list[tuple[str, str]] = []
    counts: dict[str, dict] = {}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True, args=["--no-sandbox"])
            pg = b.new_page(viewport={"width": 1500, "height": 950})
            pg.on("console", lambda m: errors.append((m.type, m.text[:300])) if m.type == "error" else None)
            pg.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:400])))
            pg.goto("http://127.0.0.1:18997/", wait_until="load", timeout=30000)
            pg.wait_for_timeout(2500)

            section("管理画面の描画")
            ok(pg.title().find("Cookie Clicker Bot") >= 0, "タイトル: " + pg.title())
            ok(pg.evaluate("() => document.querySelectorAll('#nav button').length") == 10, "ナビに 10 タブ")
            kpi = pg.evaluate("() => ['kCookies','kCps','kMouse','kPrestige','kChips','kLumps','kUptime'].map(i=>document.getElementById(i).textContent)")
            ok(all(x and x != '-' for x in kpi), "KPI が埋まっている: " + " | ".join(kpi))
            ok(pg.evaluate("() => document.querySelector('#statusPill').textContent") == "稼働中", "ステータス表示")
            ok(pg.evaluate("() => document.querySelector('#banner').className") == "hidden", "警告バナーは非表示")

            for t in ["dash", "mods", "store", "garden", "market", "temple", "ascend", "logs", "saves", "raw"]:
                pg.evaluate("(t) => { const b = Array.from(document.querySelectorAll('#nav button')).find(x => x.dataset.tab === t); if (b) b.click(); }", t)
                pg.wait_for_timeout(1500)
                counts[t] = pg.evaluate("""() => {
                    const s = document.querySelector('main section:not(.hidden)');
                    return { tab: s ? s.dataset.tab : '?', els: s ? s.querySelectorAll('*').length : 0,
                             text: s ? s.innerText.replace(/\\s+/g,' ').slice(0,120) : '' };
                }""")

            section("各タブの描画内容")
            expect = {"dash": 200, "mods": 300, "store": 100, "garden": 100, "market": 100,
                      "temple": 100, "ascend": 50, "logs": 20, "saves": 20, "raw": 5}
            for t, minels in expect.items():
                c = counts.get(t) or {}
                ok(c.get("tab") == t and c.get("els", 0) >= minels,
                   f"{t}: {c.get('els', 0)} 要素 (期待 {minels} 以上)")
            # 個別の中身
            ok("Baker" in (counts["garden"]["text"] + pg.evaluate("() => document.querySelector('section[data-tab=garden]').innerText"))
               or pg.evaluate("() => document.querySelectorAll('#gardenGrid .tile').length") == 36,
               "庭の 6x6 グリッドが描画された (%d マス)" % pg.evaluate("() => document.querySelectorAll('#gardenGrid .tile').length"))
            ok(pg.evaluate("() => document.querySelectorAll('#seedTable tbody tr').length") >= 30, "種の一覧が描画された")
            ok(pg.evaluate("() => document.querySelectorAll('#mTable tbody tr').length") >= 10, "取引所の銘柄表が描画された")
            ok(pg.evaluate("() => document.querySelectorAll('#mTable svg.spark').length") >= 10, "価格スパークラインが描画された")
            ok(pg.evaluate("() => document.querySelectorAll('#pTable tbody tr').length") >= 5, "天界ツリーが描画された")
            ok(pg.evaluate("() => document.querySelectorAll('#logbox .le').length") >= 1, "ログ行が描画された")
            ok(pg.evaluate("() => document.querySelectorAll('#sTable tbody tr').length") >= 1, "バックアップ一覧が描画された")
            ok(len(pg.evaluate("() => document.querySelector('#rawCfg').value")) > 500, "設定JSONが表示された")
            ok(pg.evaluate("() => document.querySelectorAll('#cfgGrid [data-cfg]').length") > 100,
               "設定フォームの項目数: %d" % pg.evaluate("() => document.querySelectorAll('#cfgGrid [data-cfg]').length"))

            # 操作系
            section("UI 操作")
            pg.evaluate("() => { const b = Array.from(document.querySelectorAll('#nav button')).find(x=>x.dataset.tab==='dash'); b.click(); }")
            pg.wait_for_timeout(800)
            ok(pg.evaluate("() => document.querySelectorAll('#modGrid .mod').length") == 16, "モジュールカード 16 枚")
            ok(pg.evaluate("() => document.querySelectorAll('#quickActions button').length") >= 10, "クイック操作ボタン")
            # チャートが描画されているか
            drawn = pg.evaluate("""() => {
                const c = document.querySelector('#chart');
                if (!c) return false;
                const ctx = c.getContext('2d');
                const d = ctx.getImageData(0, 0, c.width, c.height).data;
                let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
                return n > 500;
            }""")
            ok(drawn, "グラフが実際に描画されている")
            b.close()
    finally:
        srv.stop()
        for f in (ROOT / "tests").glob("_ui_cfg.json*"):
            f.unlink()

    section("JavaScript エラー")
    real = [e for e in errors if "favicon" not in e[1].lower() and "Failed to load resource" not in e[1]
            and "net::ERR" not in e[1]]
    for e in real[:10]:
        print("   !", e)
    ok(len(real) == 0, f"コンソールエラー 0 件 ({len(real)})")

    print("\n" + "=" * 56)
    print(f"  結果: {PASS} 成功 / {FAIL} 失敗")
    if FAILS:
        print("  失敗項目:")
        for f in FAILS:
            print("   - " + f)
    print("=" * 56)
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
