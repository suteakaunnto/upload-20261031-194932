/* =====================================================================
   Cookie Clicker Bot - in-page engine : STATE (管理画面用の状態取得)
   ===================================================================== */
(function (global) {
  'use strict';
  var Bot = global.__CCBOT;
  if (!Bot) return;
  var G = Bot.exported.G, num = Bot.exported.num, clamp = Bot.exported.clamp;

  /* ------------------------------------------------------------------ */
  Bot.snapshot = function (opts) {
    opts = opts || {};
    var g = G();
    var out = { t: Date.now(), ready: Bot.ready(), installed: !!Bot.hookInstalled, botVersion: Bot.__version };
    if (!out.ready) return out;

    var proj = Bot.projectedPrestige();

    out.version = g.version || '';
    out.bakeryName = g.bakeryName || '';
    out.cookies = num(g.cookies);
    out.cookiesEarned = num(g.cookiesEarned);
    out.cookiesReset = num(g.cookiesReset);
    out.cookiesPs = num(g.cookiesPs);
    out.rawCookiesPs = num(g.rawCookiesPs);
    out.cookiesPsRawHighest = num(g.cookiesPsRawHighest);
    out.mouseCps = num(g.computedMouseCps);
    out.cookieClicks = num(g.cookieClicks);
    out.handmadeCookies = num(g.handmadeCookies);
    out.buildingsOwned = num(g.buildingsOwned);
    out.upgradesOwned = num(g.upgradesOwned);
    out.achievementsOwned = g.AchievementsOwned !== undefined ? num(g.AchievementsOwned) : num(g.achievementsOwned);
    out.milk = num(g.milkProgress);
    out.milkName = g.Milk ? (g.Milk.name || '') : '';

    out.prestige = num(g.prestige);
    out.heavenlyChips = num(g.heavenlyChips);
    out.heavenlyChipsSpent = num(g.heavenlyChipsSpent);
    out.prestigeProjected = proj.projected;
    out.prestigeGain = proj.gain;
    out.ascensions = num(g.resets);
    out.heavenlyMult = 0;
    try { out.heavenlyMult = g.GetHeavenlyMultiplier ? num(g.GetHeavenlyMultiplier()) : 0; } catch (e) { }

    out.lumps = num(g.lumps);
    out.lumpsTotal = num(g.lumpsTotal);
    out.lumpAge = Date.now() - num(g.lumpT, Date.now());
    out.lumpMatureAge = num(g.lumpMatureAge);
    out.lumpRipeAge = num(g.lumpRipeAge);
    out.lumpOverripeAge = num(g.lumpOverripeAge);
    out.lumpType = num(g.lumpCurrentType);

    out.goldenClicks = num(g.goldenClicks);
    out.missedGoldenClicks = num(g.missedGoldenClicks);
    out.wrinklersPopped = num(g.wrinklersPopped);
    out.cookiesSucked = num(g.cookiesSucked);
    out.elderWrath = num(g.elderWrath);

    out.season = g.season || '';
    out.seasonT = num(g.seasonT);
    out.seasonUses = num(g.seasonUses);
    out.santaLevel = num(g.santaLevel);
    out.santaUnlocked = Bot.santaUnlocked ? Bot.santaUnlocked(g) : false;
    out.dragonUnlocked = Bot.dragonUnlocked ? Bot.dragonUnlocked(g) : false;
    out.dragonLevel = num(g.dragonLevel);
    out.dragonLevelsMax = g.dragonLevels ? g.dragonLevels.length - 1 : 0;
    out.dragonSecondAuraUnlocked = Bot.dragonSecondAuraUnlocked ? Bot.dragonSecondAuraUnlocked(g) : false;
    out.dragonAura = num(g.dragonAura);
    out.dragonAura2 = num(g.dragonAura2);
    out.dragonAuraName = g.dragonAuras && g.dragonAuras[out.dragonAura] ? g.dragonAuras[out.dragonAura].name : '';
    out.dragonAura2Name = g.dragonAuras && g.dragonAuras[out.dragonAura2] ? g.dragonAuras[out.dragonAura2].name : '';

    out.onAscend = g.OnAscend ? 1 : 0;
    out.ascendTimer = num(g.AscendTimer);
    out.reincarnateTimer = num(g.ReincarnateTimer);
    out.timedout = g.timedout ? 1 : 0;
    out.promptOn = g.promptOn ? 1 : 0;
    out.fps = num(g.currentFps || g.fps);
    out.gameT = num(g.T);

    out.shimmers = [];
    if (g.shimmers) {
      for (var i = 0; i < g.shimmers.length; i++) {
        var sh = g.shimmers[i];
        if (!sh) continue;
        out.shimmers.push({ type: sh.type, wrath: sh.wrath ? 1 : 0, force: sh.force || '', popped: !!sh.popped });
      }
    }

    var wr = { total: 0, sucking: 0, shiny: 0, sucked: 0 };
    if (g.wrinklers) {
      for (var w = 0; w < g.wrinklers.length; w++) {
        var me = g.wrinklers[w];
        if (me.phase > 0) { wr.total++; wr.sucked += num(me.sucked); if (me.type === 1) wr.shiny++; if (me.phase === 2) wr.sucking++; }
      }
    }
    out.wrinklers = wr;

    out.buffs = Bot.buffs();
    out.buildings = Bot.buildingList();

    out.permanentUpgrades = [];
    for (var p = 0; p < (g.permanentUpgrades || []).length; p++) {
      var id = g.permanentUpgrades[p];
      var up = (id >= 0 && g.UpgradesById && g.UpgradesById[id]) ? g.UpgradesById[id] : null;
      out.permanentUpgrades.push({ slot: p, id: id, name: up ? up.dname : null });
    }

    out.mg = {};
    out.mg.garden = opts.garden ? Bot.gardenState() : Bot.gardenBrief();
    out.mg.market = opts.market ? Bot.marketState() : Bot.marketBrief();
    out.mg.pantheon = Bot.pantheonState();
    out.mg.grimoire = Bot.grimoireState();

    out.pendingAscend = Bot.pendingAscend ? {
      at: Bot.pendingAscend.at,
      waitedSec: +((Date.now() - Bot.pendingAscend.at) / 1000).toFixed(1),
      reason: Bot.pendingAscend.reason, gain: Bot.pendingAscend.gain,
      projected: Bot.pendingAscend.projected, cleared: !!Bot.pendingAscend.cleared
    } : null;

    if (opts.store) out.store = Bot.storeList();
    if (opts.prestige) out.prestigeTree = Bot.prestigeList();
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* 施設購入候補 (payback計算付き)                                        */
  /* ------------------------------------------------------------------ */
  var cpsCache = { at: 0, map: {} };

  function measureCps(force) {
    var g = G();
    var t = Date.now();
    if (!force && t - cpsCache.at < num(Bot.cfg.building.measureEveryMs, 1500)) return cpsCache.map;
    cpsCache.at = t;
    var map = {};
    var limit = clamp(num(Bot.cfg.building.maxMeasure, 10), 1, 20);
    // 価格が現実的なものだけを計測対象にする
    var cand = [];
    for (var i = 0; i < g.ObjectsById.length; i++) {
      var me = g.ObjectsById[i];
      if (me.muted) continue;
      if (Bot.cfg.building.ignore && Bot.cfg.building.ignore.indexOf(me.bsingle || me.name) !== -1) continue;
      cand.push(me);
    }
    cand.sort(function (a, b) { return a.getPrice() - b.getPrice(); });
    cand = cand.slice(0, limit);

    var base;
    try {
      g.CalculateGains(); base = num(g.cookiesPs);
    } catch (e) { return map; }

    for (var k = 0; k < cand.length; k++) {
      var b = cand[k];
      var saved = num(b.amount);
      try {
        b.amount = saved + 1;
        g.CalculateGains();
        var after = num(g.cookiesPs);
        var delta = after - base;
        map[b.id] = delta > 0 ? delta : 0;
      } catch (e) {
        map[b.id] = 0;
      } finally {
        // 途中で例外が出ても必ず元の保有数に戻す (ゲーム状態を壊さない)
        try { b.amount = saved; g.CalculateGains(); } catch (e2) { }
      }
    }
    cpsCache.map = map;
    return map;
  }
  Bot.measureCps = measureCps;

  /* ------------------------------------------------------------------ */
  Bot.storeList = function () {
    var g = G(), out = [];
    if (!Bot.ready()) return out;
    var store = g.UpgradesInStore || [];
    for (var i = 0; i < store.length; i++) {
      var u = store[i];
      if (!u) continue;
      out.push({
        id: u.id, name: u.dname || u.name, pool: u.pool || '', price: u.getPrice(),
        priceLumps: num(u.priceLumps), canBuy: (function (x) { try { return !!x.canBuy(); } catch (e) { return false; } })(u),
        vaulted: !!(u.isVaulted && u.isVaulted())
      });
    }
    out.sort(function (a, b) { return a.price - b.price; });
    return out;
  };

  /* ------------------------------------------------------------------ */
  Bot.prestigeList = function () {
    var g = G(), out = [];
    if (!Bot.ready() || !g.PrestigeUpgrades) return out;
    for (var i = 0; i < g.PrestigeUpgrades.length; i++) {
      var u = g.PrestigeUpgrades[i];
      if (!u) continue;
      var parents = [];
      for (var p = 0; p < (u.parents || []).length; p++) {
        var pa = u.parents[p];
        parents.push({ name: pa.dname || pa.name, bought: !!pa.bought });
      }
      out.push({
        id: u.id, name: u.dname || u.name, price: u.getPrice(), bought: !!u.bought,
        canBePurchased: !!u.canBePurchased, parents: parents,
        affordable: num(g.heavenlyChips) >= u.getPrice()
      });
    }
    return out;
  };

  /* ------------------------------------------------------------------ */
  Bot.capabilities = function () {
    var g = G();
    var caps = { game: Bot.ready(), version: g ? (g.version || '') : '', hooks: !!(g && g.registerHook) };
    var probes = {
      'Game.ClickCookie': !!(g && g.ClickCookie),
      'Game.Ascend': !!(g && g.Ascend),
      'Game.Reincarnate': !!(g && g.Reincarnate),
      'Game.UpgradeDragon': !!(g && g.UpgradeDragon),
      'Game.UpgradeSanta': !!(g && g.UpgradeSanta),
      'Game.harvestLumps': !!(g && g.harvestLumps),
      'Game.PutUpgradeInPermanentSlot': !!(g && g.PutUpgradeInPermanentSlot),
      'Game.PurchaseHeavenlyUpgrade': !!(g && g.PurchaseHeavenlyUpgrade),
      'Game.PrestigeUpgrades': !!(g && g.PrestigeUpgrades),
      'Game.shimmers': !!(g && g.shimmers),
      'garden': !!Bot.minigame('Farm'),
      'market': !!Bot.minigame('Bank'),
      'pantheon': !!Bot.minigame('Temple'),
      'grimoire': !!Bot.minigame('Wizard tower')
    };
    if (probes.garden) {
      var M = Bot.minigame('Farm');
      probes['garden.harvestAll'] = !!M.harvestAll;
      probes['garden.useTool'] = !!M.useTool;
      probes['garden.getCost'] = !!M.getCost;
      probes['garden.convert'] = !!M.convert;
    }
    if (probes.market) {
      var K = Bot.minigame('Bank');
      probes['market.buyGood'] = !!K.buyGood;
      probes['market.sellGood'] = !!K.sellGood;
      probes['market.takeLoan'] = !!K.takeLoan;
    }
    if (probes.pantheon) { var P = Bot.minigame('Temple'); probes['pantheon.slotGod'] = !!P.slotGod; probes['pantheon.useSwap'] = !!P.useSwap; }
    if (probes.grimoire) { var W = Bot.minigame('Wizard tower'); probes['grimoire.castSpell'] = !!W.castSpell; }
    caps.probes = probes;
    return caps;
  };

})(window);
