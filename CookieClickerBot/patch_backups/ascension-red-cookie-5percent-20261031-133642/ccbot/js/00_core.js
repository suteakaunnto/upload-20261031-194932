/* =====================================================================
   Cookie Clicker Bot - in-page engine : CORE
   - 名前空間 / イベントバッファ / 設定 / スケジューラ
   ===================================================================== */
(function (global) {
  'use strict';

  if (global.__CCBOT && global.__CCBOT.__installed) return;   // 二重注入防止

  var Bot = global.__CCBOT || {};
  global.__CCBOT = Bot;
  Bot.__installed = true;
  Bot.__version = '1.0.0';

  /* ------------------------------------------------------------------ */
  /* 基本ユーティリティ                                                   */
  /* ------------------------------------------------------------------ */
  function G() { return global.Game; }
  function now() { return Date.now(); }

  Bot.ready = function () {
    try {
      var g = G();
      return !!(g && g.ready && g.Objects && g.Objects['Cursor'] && typeof g.cookies === 'number');
    } catch (e) { return false; }
  };
  Bot.gameReady = Bot.ready;

  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : (d || 0); }
  Bot.num = num;

  function fmt(v) {
    try { return (global.Beautify ? global.Beautify(v) : String(v)); }
    catch (e) { return String(v); }
  }
  Bot.fmt = fmt;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  Bot.clamp = clamp;

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { Bot.ev('core', 'js-error', { fn: String(fn).slice(0, 40) }, { error: errStr(e) }); return fallback; }
  }
  Bot.safe = safe;

  function errStr(e) {
    if (!e) return 'unknown error';
    return (e && e.message ? e.message : String(e)) + (e && e.stack ? '\n' + String(e.stack).split('\n').slice(0, 3).join(' | ') : '');
  }
  Bot.errStr = errStr;

  function deepMerge(dst, src) {
    if (!src || typeof src !== 'object') return dst;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!dst[k] || typeof dst[k] !== 'object' || Array.isArray(dst[k])) dst[k] = {};
        deepMerge(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
    return dst;
  }
  Bot.deepMerge = deepMerge;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  Bot.clone = clone;

  /* ------------------------------------------------------------------ */
  /* イベントバッファ (Python側がdrainしてログに書き出す)                    */
  /* ------------------------------------------------------------------ */
  var events = [];
  var eventSeq = 0;
  var EV_MAX = 8000;
  var EV_TRIM = 2500;
  var droppedEvents = 0;

  Bot.ev = function (mod, action, detail, result) {
    if (events.length > EV_MAX) { droppedEvents += events.length - EV_TRIM; events.splice(0, events.length - EV_TRIM); }
    events.push({ i: ++eventSeq, t: now(), m: mod, a: action, d: detail || null, r: result || null });
    return eventSeq;
  };

  Bot.drainEvents = function (since, limit) {
    since = num(since, 0); limit = num(limit, 3000);
    var out = [];
    var keep = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].i > since) { if (out.length < limit) out.push(events[i]); }
      keep.push(events[i]);
    }
    // 既にPython側へ渡したものは破棄してメモリを節約 (since以降は残す)
    if (out.length) {
      var lastSent = out[out.length - 1].i;
      events = [];
      for (var j = 0; j < keep.length; j++) if (keep[j].i > lastSent) events.push(keep[j]);
    }
    return { events: out, seq: eventSeq, dropped: droppedEvents };
  };

  /* ------------------------------------------------------------------ */
  /* 統計                                                                 */
  /* ------------------------------------------------------------------ */
  var stats = {
    startedAt: now(), clicks: 0, clickGained: 0,
    upgrades: 0, buildings: 0, buildingsSpent: 0,
    golden: 0, goldenGained: 0, wrath: 0, reindeer: 0,
    wrinklers: 0, wrinklerGained: 0,
    lumpsHarvested: 0, lumpsGained: 0, levelUps: 0,
    gardenHarvests: 0, gardenPlants: 0, seedsUnlocked: 0,
    marketBuys: 0, marketSells: 0, marketProfitCpsSec: 0,
    spellsCast: 0, spellsFailed: 0,
    godSwaps: 0, santaLevels: 0, dragonLevels: 0, seasonSwitches: 0,
    ascensions: 0, prestigeBought: 0, chipsGained: 0,
    saves: 0, errors: 0, ticks: 0
  };
  Bot.stats = stats;
  Bot.bump = function (k, v) { stats[k] = num(stats[k], 0) + num(v, 1); };

  /* ------------------------------------------------------------------ */
  /* 設定                                                                 */
  /* ------------------------------------------------------------------ */
  var DEFAULTS = {
    master: true,
    clicker: { enabled: true, cps: 12, direct: false, boostOnFrenzy: true, boostMult: 3, maxPerTick: 2 },
    golden: { enabled: true, popGolden: true, popWrath: true, popReindeer: true, popOthers: true, minLifeMs: 0 },
    wrinkler: { enabled: true, popShiny: true, popAboveSucked: 0, keep: 10 },
    upgrade: {
      enabled: true, strategy: 'cheapest', reserveCookies: 0, reserveRatio: 0,
      buyToggles: false, buyTech: true, buyLumpUpgrades: true, maxPerTick: 8,
      blacklist: [], whitelist: [], grandmapocalypse: 'ignore'
    },
    building: {
      enabled: true, strategy: 'payback', reserveCookies: 0, reserveRatio: 0,
      maxPerTick: 25, maxPaybackSec: 0, ignore: [], measureEveryMs: 1500, maxMeasure: 10
    },
    lump: {
      enabled: true, autoHarvest: true, autoLevel: true, reserve: 0, maxLevel: 10,
      priority: ['Farm', 'Temple', 'Wizard tower', 'Bank', 'Cursor', 'Grandma', 'Mine', 'Factory',
                 'Shipment', 'Alchemy lab', 'Portal', 'Time machine', 'Antimatter condenser', 'Prism',
                 'Chancemaker', 'Fractal engine', 'Javascript console', 'Idleverse', 'Cortex baker', 'You']
    },
    garden: {
      enabled: true, mode: 'auto', farmSeed: 'bakeberry', harvestMature: true, harvestAll: false,
      soil: 'auto', unlockAll: true, lumpFarm: true, keepMature: false, maxPlantPerTick: 6,
      weedControl: true, freezeWhenDone: false
    },
    market: {
      enabled: true, strategy: 'swing', buyBelowRatio: 0.80, sellAboveRatio: 1.35,
      momentum: true, spendRatio: 0.6, minProfitCpsSec: 60, stopLossRatio: 0.55,
      minProfitRatio: 0.25, partialSellRatio: 1.0, maxStockRatio: 1.0,
      maxBuyPerTick: 500, minBuyQty: 1, tradeHidden: false,
      autoBrokers: true, brokerReserveMult: 1.5, autoOffice: true, useLoans: false, goods: {}
    },
    grimoire: { enabled: true, spells: ['conjure baked goods', 'hand of fate'], minMagicRatio: 1.0, reserve: 0, allowBackfire: false },
    pantheon: { enabled: true, autoSlot: true, loadout: ['creation', 'scorn', 'order'], respectSwaps: true },
    dragon: { enabled: true, autoTrain: true, aura1: 'Dragon God', aura2: 'Reality Bending' },
    santa: { enabled: true, autoUpgrade: true, maxLevel: 14, maxCostRatio: 1.0 },
    season: { enabled: false, preferred: '', maxCostRatio: 0.02, autoSwitch: false },
    ascend: {
      enabled: true, mode: 'percent', percent: 50, minGain: 1, minAbsolutePrestige: 0,
      cooldownSec: 0, maxPerDay: 0, backupFirst: true, backupTimeoutSec: 60,
      autoReincarnate: true, reincarnateDelaySec: 3, prestigeOnAscend: true, challengeMode: 0
    },
    prestige: {
      enabled: true, strategy: 'priority', reserveChips: 0, maxPerTick: 12,
      blacklist: [], permanentUpgrades: [], autoAssignPermanent: true,
      priorityList: []
    },
    housekeep: {
      enabled: true, closePrompts: true, muteSound: true, muteMusic: true,
      reduceParticles: true, keepAwake: true, autoResume: true, autosaveSec: 60
    }
  };
  Bot.DEFAULTS = DEFAULTS;

  var CFG = clone(DEFAULTS);
  Bot.cfg = CFG;

  Bot.setConfig = function (patch) {
    if (!patch) return CFG;
    deepMerge(CFG, patch);
    Bot.ev('core', 'config-updated', { keys: Object.keys(patch) });
    onConfigChanged();
    return CFG;
  };
  Bot.getConfig = function () { return clone(CFG); };

  function onConfigChanged() {
    // 設定反映が必要な派生値を再計算
    Bot._gardenPlanDirty = true;
    Bot._prestigePriorityDirty = true;
  }

  /* ------------------------------------------------------------------ */
  /* スケジューラ : Game の logic フックから駆動される                       */
  /* ------------------------------------------------------------------ */
  var SCHED = [];
  function every(name, ms, fn, opts) {
    SCHED.push({ name: name, ms: ms, last: 0, fn: fn, enabled: true, opts: opts || {} });
  }
  Bot.every = every;
  Bot.schedule = SCHED;

  var lastTick = 0;
  var lastFast = 0;
  var hookInstalled = false;
  Object.defineProperty(Bot, 'hookInstalled', { get: function () { return hookInstalled; }, enumerable: true });

  Bot.tick = function () {
    if (!Bot.ready()) return;
    var t = now();
    if (t - lastFast < 40) return;         // 最大 25Hz
    var dt = lastTick ? (t - lastTick) : 50;
    lastTick = t; lastFast = t;
    stats.ticks++;

    if (Bot.timedOut()) { safe(Bot.resumeGame, null); }

    for (var i = 0; i < SCHED.length; i++) {
      var s = SCHED[i];
      if (!s.enabled) continue;
      if (s.ms > 0 && t - s.last < s.ms) continue;
      s.last = t;
      try { s.fn(dt, t); }
      catch (e) { stats.errors++; Bot.ev('core', 'module-error', { module: s.name }, { error: errStr(e) }); }
    }
  };

  Bot.timedOut = function () { var g = G(); return !!(g && g.timedout); };
  Bot.resumeGame = function () {
    var g = G(); if (!g || !g.timedout) return false;
    g.Resume();
    Bot.ev('core', 'resumed', { reason: 'game timed out (sleep mode)' });
    return true;
  };

  /* Game の mod フックに登録 (1フレームごとに呼ばれる) */
  Bot.install = function () {
    var g = G();
    if (!g || !g.registerHook) return false;
    if (hookInstalled) return true;
    g.registerHook('logic', function () { Bot.tick(); });
    hookInstalled = true;
    Bot.ev('core', 'hook-installed', { fps: g.fps });
    return true;
  };

  /* Game が未起動の場合はリトライする (init script はページ読み込み前に走るため) */
  var waitForGame = setInterval(function () {
    if (Bot.ready()) {
      if (Bot.install()) {
        clearInterval(waitForGame);
        Bot.ev('core', 'ready', { version: G().version, cookies: G().cookies });
      }
    }
  }, 250);
  setTimeout(function () { clearInterval(waitForGame); }, 10 * 60 * 1000);

  /* ------------------------------------------------------------------ */
  /* 汎用ヘルパ                                                           */
  /* ------------------------------------------------------------------ */
  Bot.buildingList = function () {
    var g = G(), out = [];
    if (!Bot.ready()) return out;
    for (var i = 0; i < g.ObjectsById.length; i++) {
      var me = g.ObjectsById[i];
      out.push({
        id: me.id, key: me.bsingle || me.name, name: me.name, plural: me.plural,
        amount: me.amount, bought: me.bought, level: me.level, highest: me.highest,
        price: Math.ceil(me.getPrice()), basePrice: me.basePrice, muted: !!me.muted,
        minigame: !!me.minigameUrl, minigameReady: !!g.isMinigameReady(me)
      });
    }
    return out;
  };

  Bot.findBuilding = function (key) {
    var g = G();
    if (!Bot.ready()) return null;
    if (g.Objects[key]) return g.Objects[key];
    for (var i = 0; i < g.ObjectsById.length; i++) {
      var me = g.ObjectsById[i];
      if (me.bsingle === key || me.name === key || me.dname === key) return me;
    }
    return null;
  };

  Bot.findUpgrade = function (name) {
    var g = G();
    if (!Bot.ready()) return null;
    if (g.Upgrades[name]) return g.Upgrades[name];
    for (var i in g.Upgrades) {
      var u = g.Upgrades[i];
      if (u.dname === name) return u;
    }
    return null;
  };

  Bot.buffs = function () {
    var g = G(), out = [];
    if (!Bot.ready() || !g.buffs) return out;
    for (var k in g.buffs) {
      var b = g.buffs[k];
      if (!b || b.time <= 0) continue;
      out.push({ name: b.name, dname: b.dname || b.name, time: b.time, frames: b.time / (g.fps || 30) });
    }
    return out;
  };

  Bot.hasBuff = function (name) {
    var g = G();
    try { return !!(g && g.hasBuff && g.hasBuff(name)); } catch (e) { return false; }
  };

  Bot.minigame = function (buildingKey) {
    var g = G();
    if (!Bot.ready()) return null;
    var me = Bot.findBuilding(buildingKey);
    if (!me || !g.isMinigameReady(me)) return null;
    return me.minigame || null;
  };

  /* 予約クッキー */
  Bot.reserveCookies = function () {
    var r = 0;
    var u = CFG.upgrade, b = CFG.building, g = G();
    if (u.enabled) r = Math.max(r, num(u.reserveCookies) + num(g.cookiesPs) * 60 * num(u.reserveRatio));
    if (b.enabled) r = Math.max(r, num(b.reserveCookies) + num(g.cookiesPs) * 60 * num(b.reserveRatio));
    return r;
  };

  /* プロジェクトされる転生後のプレステージ */
  Bot.projectedPrestige = function () {
    var g = G();
    if (!Bot.ready()) return { projected: 0, gain: 0, prestige: 0 };
    var projected = 0;
    try { projected = Math.floor(g.HowMuchPrestige(g.cookiesReset + g.cookiesEarned)); } catch (e) { projected = 0; }
    return { projected: projected, gain: Math.max(0, projected - num(g.prestige)), prestige: num(g.prestige) };
  };

  Bot.exportSave = function () {
    var g = G();
    if (!Bot.ready()) return null;
    g.toSave = true;
    return g.WriteSave(1);
  };

  Bot.importSave = function (code) {
    var g = G();
    if (!Bot.ready() || !code) return false;
    g.LoadSave(code);
    Bot.ev('core', 'save-imported', { length: code.length });
    return true;
  };

  Bot.saveGame = function () {
    var g = G();
    if (!Bot.ready()) return false;
    g.toSave = true;
    stats.saves++;
    return true;
  };

  Bot.exported = { G: G, num: num, fmt: fmt, clamp: clamp, now: now, safe: safe, errStr: errStr };

})(window);
