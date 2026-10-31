import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ccbot.config import Config
from ccbot.log import ActionLogger, setup_logging
from ccbot.server import AdminServer
from test_ui import UIEngine
from playwright.sync_api import sync_playwright

setup_logging({"logging": {"level": "ERROR", "console": False}})
cfg = Config(os.path.join(os.path.dirname(os.path.abspath(__file__)), "_shot_cfg.json")); cfg.load()
eng = UIEngine(cfg)
acts = ActionLogger(ring_size=200, jsonl=False, text=False)
labels = [("building","buy",{"count":3,"items":[{"building":"Cursor","count":2},{"building":"Grandma","count":1}]},{"spent":1.2e9,"cookiesLeft":4e12}),
          ("garden","plant",{"x":2,"y":3,"plant":"bakerWheat","reason":"farm"},{"cost":6.9e18,"costStr":"6.981 quintillion"}),
          ("garden","seed-unlocked",{"seed":"elderwort","name":"Elderwort"},{"unlocked":23,"total":34}),
          ("market","buy",{"good":"Cereals","symbol":"CRL","qty":120,"price":8.42,"mode":"bull run"},{"cookiesSpent":1.1e11,"stock":120,"maxStock":240}),
          ("market","sell",{"good":"Chocolate","symbol":"CHC","qty":120,"price":31.5,"avgBuy":21.3,"mode":"crash"},{"cookiesGained":4.2e12,"profitCpsSec":1180}),
          ("pantheon","slot-god",{"god":"Dotjeiess, Spirit of Creation","slot":0,"slotName":"Diamond","displaced":None},{"swapsLeft":2}),
          ("grimoire","cast",{"spell":"Conjure Baked Goods","cost":42,"magicLeft":58,"backfire":0,"failChance":0.15},{"cookieDelta":2.4e13,"cookieDeltaStr":"24 T"}),
          ("lump","level-up",{"building":"Farm","level":10,"cost":10},{"unlocksMinigame":False}),
          ("ascend","request",{"gain":766,"projected":2000,"prestige":1234,"cookiesEarned":9e15,"cookiesPs":4.5e9},{"waitingFor":"save backup"}),
          ("prestige","buy",{"name":"Kitten angels","internal":"Kitten angels"},{"chips":9000,"chipsLeft":99999987867,"priority":15}),
          ("ascend","reincarnate",{"reason":"auto","prestige":2000},{"chipsLeft":99889737939,"ascensions":8}),
          ("golden","pop",{"type":"golden","wrath":0,"force":""},{"gain":5.8e13,"gainStr":"58 T"}),
          ("wrinkler","pop",{"id":4,"shiny":1,"reason":"shiny"},{"sucked":1.2e12,"suckedStr":"1.2 T"}),
          ("building","buy",{"count":5,"items":[{"building":"Portal","count":3},{"building":"Factory","count":2}]},{"spent":3.4e12,"cookiesLeft":1.1e12}),
          ("dragon","set-aura",{"slot":0,"aura":"Dragon God","index":8},None),
          ("santa","upgrade",{"level":7},{"cost":823543,"costStr":"823,543"})]
for i,(m,a,d,r) in enumerate(labels):
    acts.record({"i":i+1,"t":int(time.time()*1000)-(len(labels)-i)*7000,"m":m,"a":a,"d":d,"r":r})
srv = AdminServer(eng, cfg, acts, host="127.0.0.1", port=18996); srv.start(); time.sleep(0.5)

shots = [("dash","ダッシュボード"),("mods","モジュール設定"),("garden","農業"),("market","取引所"),("temple","神殿魔法"),("ascend","転生"),("logs","ログ"),("store","ストア"),("saves","セーブ")]
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width":1440,"height":900}, device_scale_factor=1)
    pg.goto("http://127.0.0.1:18996/", wait_until="load", timeout=30000)
    pg.wait_for_timeout(2600)
    for tab,name in shots:
        pg.evaluate("(t) => { const b = Array.from(document.querySelectorAll('#nav button')).find(x => x.dataset.tab === t); if (b) b.click(); }", tab)
        pg.wait_for_timeout(1700)
        out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", f"admin-{tab}.png")
        pg.screenshot(path=out)
        print("saved", out)
    b.close()
srv.stop()
