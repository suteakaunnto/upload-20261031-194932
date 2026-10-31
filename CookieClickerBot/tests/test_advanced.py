#!/usr/bin/env python3
"""発展テスト : ミニゲーム(農業/取引所/神殿/魔法) と 転生 を実ゲームで検証する.

    python tests/test_advanced.py --url http://127.0.0.1:18084/ --seconds 150

ゲームを「終盤に近い状態」に強制的にセットアップしてからボットを走らせ、
各モジュールが実物の Cookie Clicker の API に対して正しく動作するかを確認します。
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

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
        print("  \033[31m✘\033[0m " + label + (("  -- " + repr(extra)[:400]) if extra is not None else ""))


def section(t: str) -> None:
    print("\n\033[36m== " + t + " ==\033[0m")


def get(url: str, timeout: float = 15.0):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def post(url: str, body: dict, timeout: float = 30.0):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


# ゲームを終盤状態にする JS
RICH_STATE = r"""
() => {
  const out = {};
  Game.Earn(1e45);
  Game.cookiesEarned = 1e45;
  Game.cookiesReset = 1e30;
  Game.lumps = 500; Game.lumpsTotal = 600;
  Game.dragonLevel = Game.dragonLevels.length - 1;
  Game.santaLevel = 0;
  Game.wrinklers.forEach(w => { w.phase = 2; w.sucked = 1e10; w.hp = 2.1; });
  Game.ObjectsById.forEach((me, i) => {
    me.amount = 150; me.bought = 150; me.highest = 150; me.muted = false;
  });
  // ミニゲームを持つ建物をレベル9まで上げる (庭は6x6全面使える)
  ['Farm','Bank','Temple','Wizard tower'].forEach(k => { if (Game.Objects[k]) Game.Objects[k].level = 9; });
  Game.BuildingsOwned = Game.ObjectsById.reduce((a, m) => a + m.amount, 0);
  Game.recalculateGains = 1; Game.storeToRefresh = 1; Game.upgradesToRebuild = 1;
  Game.CalculateGains();
  if (Game.LoadMinigames) Game.LoadMinigames();
  out.cookies = Game.cookies;
  out.cps = Game.cookiesPs;
  out.prestige = Game.prestige;
  return out;
}
"""

WAIT_MINIGAMES = r"""
() => {
  const names = {'Farm':'garden','Bank':'market','Temple':'pantheon','Wizard tower':'grimoire'};
  const st = {};
  for (const k in names) {
    const me = Game.Objects[k];
    st[names[k]] = !!(me && me.minigameUrl && me.minigameLoaded && me.level > 0);
  }
  return st;
}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://orteil.dashnet.org/cookieclicker/")
    ap.add_argument("--seconds", type=int, default=150)
    ap.add_argument("--port", type=int, default=18801)
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    from ccbot.config import Config
    from ccbot.engine import Engine
    from ccbot.log import ActionLogger, StatsLogger, setup_logging
    from ccbot.paths import ensure_dirs
    from ccbot.server import AdminServer

    ensure_dirs()
    setup_logging({"logging": {"level": "INFO", "console": False}})

    cfg = Config(ROOT / "tests" / "_adv_config.json")
    cfg.load()
    cfg.update({
        "browser": {"url": args.url, "headless": not args.headed, "userDataDir": "tests/_adv_profile"},
        "server": {"enabled": True, "host": "127.0.0.1", "port": args.port, "openBrowser": False},
        "loop": {"snapshotMs": 1000},
        "logging": {"statsEverySec": 10},
        "save": {"backupEverySec": 45, "backupOnAscend": True},
        "garden": {"enabled": True, "mode": "farm", "farmSeed": "bakerWheat", "soil": "auto",
                   "harvestMature": True, "weedControl": True, "unlockAll": False, "lumpFarm": False},
        "market": {"enabled": True, "buyBelowRatio": 1.2, "sellAboveRatio": 1.25, "momentum": False,
                   "spendRatio": 0.2, "minProfitCpsSec": 0, "autoBrokers": True, "autoOffice": False},
        "grimoire": {"enabled": True, "spells": ["conjure baked goods", "hand of fate"], "minMagicRatio": 0.6},
        "pantheon": {"enabled": True, "autoSlot": True, "loadout": ["creation", "scorn", "order"]},
        "dragon": {"enabled": True, "autoTrain": True, "aura1": "Dragon God", "aura2": "Reality Bending"},
        "lump": {"enabled": True, "autoHarvest": True, "autoLevel": True, "maxLevel": 10},
        # 転生はフェーズBで有効化する (先にミニゲームを検証したいので)
        "ascend": {"enabled": False, "mode": "percent", "percent": 1, "minGain": 1,
                   "backupFirst": True, "backupTimeoutSec": 30, "autoReincarnate": True,
                   "reincarnateDelaySec": 6, "prestigeOnAscend": True},
        "prestige": {"enabled": True, "strategy": "priority", "maxPerTick": 8},
    })

    actions = ActionLogger(ring_size=5000, jsonl=True, text=True)
    stats = StatsLogger()
    engine = Engine(cfg, actions, stats)
    srv = AdminServer(engine, cfg, actions, host="127.0.0.1", port=args.port)
    srv.start()
    th = threading.Thread(target=engine.run, name="engine", daemon=True)
    th.start()

    base = f"http://127.0.0.1:{args.port}"
    try:
        section("1. 起動")
        deadline = time.time() + 200
        ready = False
        while time.time() < deadline:
            try:
                if get(base + "/api/state")["data"].get("gameReady"):
                    ready = True
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(1)
        ok(ready, "ゲームが ready になった")
        if not ready:
            return finish(engine, srv)

        section("2. ゲームを終盤状態にセットアップ")
        r = engine.submit("__eval", {"code": RICH_STATE})
        ok(r.get("ok"), "状態を注入できた", r)
        info = r.get("data") or {}
        print(f"    cookies={info.get('cookies')} cps={info.get('cps')} prestige={info.get('prestige')}")

        # ミニゲームのスクリプト読み込みを待つ
        mg = {}
        for _ in range(60):
            r = engine.submit("__eval", {"code": WAIT_MINIGAMES})
            mg = r.get("data") or {}
            if all(mg.values()):
                break
            time.sleep(1)
        ok(mg.get("garden"), "庭 (農業) がロードされた", mg)
        ok(mg.get("market"), "取引所がロードされた", mg)
        ok(mg.get("pantheon"), "神殿がロードされた", mg)
        ok(mg.get("grimoire"), "魔法書がロードされた", mg)

        # 庭の種を少し解放しておく (bakerWheat は初期解放)
        engine.submit("__eval", {"code": """() => {
            const M = Game.Objects['Farm'].minigame;
            ['bakerWheat','thumbcorn','cronerice','gildmillet','clover','bakeberry','chocoroot','queenbeet']
              .forEach(k => { if (M.plants[k]) M.unlockSeed(M.plants[k]); });
            M.nextStep = 0;
            const K = Game.Objects['Bank'].minigame;
            K.goodsById.forEach(g => { g.hidden = false; g.val = K.getRestingVal(g.id) * 0.5; g.d = 0.4; });
            return M.plantsUnlockedN;
        }"""})

        section(f"3. フェーズA: {args.seconds} 秒間フルオートプレイ (転生なし)")
        time.sleep(args.seconds)
        st = get(base + "/api/state")["data"]
        ok(st.get("running"), "ボットが稼働中")
        snap = st["snapshot"]

        # ---- ミニゲームの状態は転生前に確認しておく ----
        section("3b. ミニゲームの状態確認 (実ゲーム API)")
        g = get(base + "/api/garden")["data"]
        ok(g.get("ready"), "庭の状態を取得できる")
        planted = sum(1 for t in (g.get("plot") or []) if not t.get("empty"))
        ok(planted > 0, f"庭に {planted} 株植わっている")
        ok(len(g.get("seeds") or []) >= 30, f"種の一覧 {len(g.get('seeds') or [])} 件")
        m = get(base + "/api/market")["data"]
        ok(m.get("ready"), "取引所の状態を取得できる")
        ok(len(m.get("items") or []) >= 10, f"銘柄 {len(m.get('items') or [])} 件")
        held = sum(int(i.get("stock") or 0) for i in (m.get("items") or []))
        ok(held > 0 or m.get("profit", 0) != 0, f"取引所にポジション/損益がある (保有 {held} 株)")
        p = get(base + "/api/pantheon")["data"]
        ok(p.get("ready"), "神殿の状態を取得できる")
        ok(len(p.get("gods") or []) == 11, "神 11 体")
        ok(any(x >= 0 for x in (p.get("slots") or [])), "神が配置されている", p.get("slots"))
        gr = get(base + "/api/grimoire")["data"]
        ok(gr.get("ready") and len(gr.get("spells") or []) == 9, "呪文 9 種")
        a0 = get(base + "/api/ascend")["data"]
        ok(a0.get("projected", 0) > 0, f"転生後のプレステージを計算できる ({a0.get('projected')})")

        section("4. 収集したイベントの分析")
        logs = get(base + "/api/logs?limit=5000")["data"]
        cnt = Counter((x["module"], x["action"]) for x in logs)
        for k, v in cnt.most_common(30):
            print(f"    {k[0]:12s} {k[1]:22s} {v}")
        mods = {m for (m, a) in cnt}
        ok("garden" in mods, "農業モジュールが動作した", sorted(mods))
        ok("market" in mods, "取引所モジュールが動作した", sorted(mods))
        ok("grimoire" in mods or "pantheon" in mods, "魔法/神殿モジュールが動作した", sorted(mods))
        ok("lump" in mods, "ランプ/レベルアップが動作した", sorted(mods))
        ok(any(a in ("plant", "harvest", "soil") for (m, a) in cnt if m == "garden"),
           "庭で植栽/収穫/土壌変更が行われた")
        ok(any(a in ("buy", "sell", "hire-broker") for (m, a) in cnt if m == "market"),
           "取引所で売買/雇用が行われた")
        ok(any(a == "cast" for (m, a) in cnt if m == "grimoire"), "呪文を詠唱した")
        ok(any(a == "level-up" for (m, a) in cnt if m == "lump"), "建物レベルを上げた")
        errs = [x for x in logs if "error" in x["action"]]
        ok(len(errs) == 0, f"エラーイベントが無い ({len(errs)}件)", errs[:3])

        section("5. フェーズB: 転生フロー")
        engine.apply_config({"ascend": {"enabled": True, "percent": 1, "minGain": 1,
                                       "reincarnateDelaySec": 6, "backupTimeoutSec": 30}})
        deadline = time.time() + 90
        done = False
        while time.time() < deadline:
            r = engine.submit("__eval", {"code": "() => ({resets: Game.resets, prestige: Game.prestige, chips: Game.heavenlyChips, onAscend: Game.OnAscend})"})
            d = r.get("data") or {}
            if int(d.get("resets") or 0) >= 1:
                done = True
                break
            time.sleep(2)
        print("    game state:", d)
        ok(done, "自動で転生 → 現世復帰まで完了した (Game.resets >= 1)")
        logs2 = get(base + "/api/logs?limit=5000")["data"]
        kinds = {(x["module"], x["action"]) for x in logs2}
        ok(("ascend", "request") in kinds, "転生を要求した")
        ok(("ascend", "backup") in kinds or ("save", "backup") in kinds, "転生前にセーブをバックアップした")
        ok(("ascend", "backup-approved") in kinds, "バックアップ完了を JS 側に通知した")
        ok(("ascend", "ascend") in kinds, "転生を実行した")
        ok(("prestige", "buy") in kinds, "天界スキルツリーを購入した")
        ok(("ascend", "reincarnate") in kinds, "現世に復帰した")
        n_prestige = sum(1 for x in logs2 if x["module"] == "prestige" and x["action"] == "buy")
        ok(n_prestige >= 3, f"天界アップグレードを {n_prestige} 個購入した")

        section("6. セーブ")
        saves = get(base + "/api/saves")["data"]
        ok(isinstance(saves, list) and len(saves) >= 1, f"バックアップ {len(saves)} 件")
        tags = [s["tag"] for s in saves]
        ok(any(t in ("periodic", "pre-ascend", "manual") for t in tags), "タグが付いている", tags[:5])

    except Exception:
        import traceback
        ok(False, "テスト実行中に例外", traceback.format_exc()[-1000:])
    return finish(engine, srv)


def finish(engine, srv) -> int:
    section("終了処理")
    engine.request_stop()
    for _ in range(40):
        if not engine.running:
            break
        time.sleep(0.5)
    ok(not engine.running, "エンジンが正常停止した")
    srv.stop()
    for f in (ROOT / "tests").glob("_adv_config.json*"):
        f.unlink()
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
