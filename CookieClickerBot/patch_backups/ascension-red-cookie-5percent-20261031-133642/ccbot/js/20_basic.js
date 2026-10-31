/* =====================================================================
   Cookie Clicker Bot - in-page engine : BASIC MODULES
   クリック / ゴールデンクッキー / シワシワ / ランプ / サンタ / ドラゴン / 季節 / 保守
   ===================================================================== */
(function (global) {
  'use strict';
  var Bot = global.__CCBOT;
  if (!Bot) return;
  var G = Bot.exported.G, num = Bot.exported.num, fmt = Bot.exported.fmt, clamp = Bot.exported.clamp;

  /* ================================================================== */
  /* クリッカー                                                          */
  /* ================================================================== */
  var clickAcc = 0;

  function effectiveCps() {
    var c = Bot.cfg.clicker;
    var cps = clamp(num(c.cps, 12), 0, 60);
    if (c.boostOnFrenzy) {
      var mult = clamp(num(c.boostMult, 3), 1, 50);
      if (Bot.hasBuff('Click frenzy') || Bot.hasBuff('Dragonflight') || Bot.hasBuff('Devastation')) cps *= mult;
    }
    return Math.min(cps, 14.5);   // Game 側のオートクリッカー検出(15cps)を超えないようにする
  }

  function doRealClick() {
    var g = G();
    var before = num(g.cookieClicks);
    try {
      g.ClickCookie({ preventDefault: function () { }, detail: 1, altKey: false, ctrlKey: false, shiftKey: false });
    } catch (e) { return false; }
    return num(g.cookieClicks) > before;
  }

  function doDirectClick() {
    var g = G();
    var amount = num(g.computedMouseCps, 1);
    var before = num(g.cookies);
    g.Earn(amount);
    g.handmadeCookies = num(g.handmadeCookies) + amount;
    g.cookieClicks = num(g.cookieClicks) + 1;
    g.clicksThisSession = num(g.clicksThisSession) + 1;
    g.lastClick = Date.now();
    Bot.bump('clicks', 1);
    Bot.bump('clickGained', amount);
    return num(g.cookies) - before;
  }

  function modClicker(dt) {
    var g = G();
    if (!Bot.cfg.master || !Bot.cfg.clicker.enabled) return;
    if (g.OnAscend || g.AscendTimer > 0 || g.ReincarnateTimer > 0) return;
    if (g.timedout) return;

    var cps = effectiveCps();
    if (cps <= 0) return;
    clickAcc += (dt / 1000) * cps;
    var n = Math.floor(clickAcc);
    if (n <= 0) return;
    clickAcc -= n;
    var maxPer = clamp(num(Bot.cfg.clicker.maxPerTick, 2), 1, 8);
    n = Math.min(n, maxPer);

    var gained = 0, done = 0;
    for (var i = 0; i < n; i++) {
      if (Bot.cfg.clicker.direct) { gained += doDirectClick(); done++; }
      else {
        if (!doRealClick()) break;      // 内部レート制限に弾かれた
        done++;
        gained += num(g.computedMouseCps);
        Bot.bump('clicks', 1);
        Bot.bump('clickGained', num(g.computedMouseCps));
      }
    }
    if (done && Bot.cfg.clicker.direct === false && done > 0 && Math.random() < 0.02) {
      Bot.ev('clicker', 'click-batch', { cps: +cps.toFixed(2), count: done });
    }
  }
  Bot.modClicker = modClicker;

  /* ================================================================== */
  /* ゴールデンクッキー / トナカイ                                         */
  /* ================================================================== */
  function popShimmer(sh) {
    var g = G();
    var before = num(g.cookies);
    try { sh.pop(); }
    catch (e) { try { sh.pop({ preventDefault: function () { } }); } catch (e2) { return false; } }
    var gain = num(g.cookies) - before;
    if (sh.type === 'reindeer') Bot.bump('reindeer', 1);
    else if (sh.wrath) Bot.bump('wrath', 1);
    else Bot.bump('golden', 1);
    Bot.bump('goldenGained', Math.max(0, gain));
    Bot.ev('golden', 'pop', { type: sh.type, wrath: sh.wrath ? 1 : 0, force: sh.force || '' }, { gain: gain, gainStr: fmt(Math.max(0, gain)) });
    return true;
  }
  Bot.popShimmer = popShimmer;

  function modGolden() {
    var g = G(), c = Bot.cfg.golden;
    if (!Bot.cfg.master || !c.enabled) return;
    if (g.OnAscend || g.AscendTimer > 0) return;
    var list = g.shimmers || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var sh = list[i];
      if (!sh || sh.popped) continue;
      if (sh.type === 'golden') {
        if (sh.wrath && !c.popWrath) continue;
        if (!sh.wrath && !c.popGolden) continue;
      } else if (sh.type === 'reindeer') {
        if (!c.popReindeer) continue;
      } else if (!c.popOthers) continue;
      popShimmer(sh);
    }
  }
  Bot.modGolden = modGolden;

  /* ================================================================== */
  /* シワシワおばあちゃん (wrinkler)                                      */
  /* ================================================================== */
  function modWrinkler() {
    var g = G(), c = Bot.cfg.wrinkler;
    if (!Bot.cfg.master || !c.enabled) return;
    if (g.OnAscend) return;
    var max = 10;
    try { max = g.getWrinklersMax(); } catch (e) { }
    var keep = clamp(num(c.keep, 10), 0, max);
    var living = 0, i;
    for (i = 0; i < g.wrinklers.length; i++) if (g.wrinklers[i].phase > 0) living++;

    for (i = 0; i < g.wrinklers.length; i++) {
      var w = g.wrinklers[i];
      if (w.phase !== 2) continue;
      var reason = '';
      if (w.type === 1 && c.popShiny) reason = 'shiny';
      else if (num(c.popAboveSucked) > 0 && num(w.sucked) >= num(c.popAboveSucked)) reason = 'threshold';
      else if (living > keep && w.type !== 1) reason = 'overflow';
      if (!reason) continue;
      var sucked = num(w.sucked);
      w.hp = 0.4;                      // 次のフレームでゲーム側が破裂処理(報酬込み)を行う
      living--;
      Bot.bump('wrinklers', 1);
      Bot.bump('wrinklerGained', sucked);
      Bot.ev('wrinkler', 'pop', { id: w.id, shiny: w.type === 1 ? 1 : 0, reason: reason }, { sucked: sucked, suckedStr: fmt(sucked) });
    }
  }
  Bot.modWrinkler = modWrinkler;

  Bot.popAllWrinklers = function (shinyOnly) {
    var g = G(), n = 0, total = 0;
    for (var i = 0; i < g.wrinklers.length; i++) {
      var w = g.wrinklers[i];
      if (w.phase !== 2) continue;
      if (shinyOnly && w.type !== 1) continue;
      total += num(w.sucked);
      w.hp = 0.4; n++;
    }
    Bot.ev('wrinkler', 'pop-all', { shinyOnly: !!shinyOnly }, { count: n, sucked: total });
    return { count: n, sucked: total };
  };

  /* ================================================================== */
  /* シュガーランプ                                                       */
  /* ================================================================== */
  function modLump() {
    var g = G(), c = Bot.cfg.lump;
    if (!Bot.cfg.master || !c.enabled) return;
    if (g.OnAscend) return;
    if (!g.canLumps || !g.canLumps()) return;

    if (c.autoHarvest) {
      var age = Date.now() - num(g.lumpT, Date.now());
      var ripe = num(g.lumpRipeAge, 0);
      if (ripe > 0 && age >= ripe) {
        var before = num(g.lumps);
        try { g.harvestLumps(1); if (g.computeLumpType) g.computeLumpType(); } catch (e) { return; }
        var got = num(g.lumps) - before;
        if (got !== 0) {
          Bot.bump('lumpsHarvested', 1);
          Bot.bump('lumpsGained', got);
          Bot.ev('lump', 'harvest', { type: num(g.lumpCurrentType), ageHours: +(age / 3600000).toFixed(2) }, { gained: got, total: num(g.lumps) });
        }
      }
    }

    if (c.autoLevel) autoLevelBuildings();
  }
  Bot.modLump = modLump;

  function autoLevelBuildings() {
    var g = G(), c = Bot.cfg.lump;
    var lumps = num(g.lumps) - num(c.reserve, 0);
    if (lumps <= 0) return;
    if (g.prefs) g.prefs.askLumps = 0;
    var prio = c.priority && c.priority.length ? c.priority : [];
    var maxLevel = clamp(num(c.maxLevel, 10), 1, 100);
    var order = [];
    for (var i = 0; i < prio.length; i++) { var b = Bot.findBuilding(prio[i]); if (b) order.push(b); }
    for (i = 0; i < g.ObjectsById.length; i++) { if (order.indexOf(g.ObjectsById[i]) === -1) order.push(g.ObjectsById[i]); }

    for (i = 0; i < order.length; i++) {
      var me = order[i];
      if (num(me.level) >= maxLevel) continue;
      if (!me.levelUp) continue;
      var cost = num(me.level) + 1;
      if (lumps < cost) continue;
      var before = num(me.level), beforeL = num(g.lumps);
      try {
        var fn = me.levelUp();
        if (typeof fn === 'function') fn(true);
      } catch (e) { continue; }
      if (num(me.level) > before) {
        var spent = beforeL - num(g.lumps);
        lumps = num(g.lumps) - num(c.reserve, 0);
        Bot.bump('levelUps', 1);
        Bot.ev('lump', 'level-up', { building: me.name, level: num(me.level), cost: spent }, { unlocksMinigame: !!(me.minigameUrl && num(me.level) === 1) });
        if (lumps <= 0) break;
      }
    }
  }
  Bot.autoLevelBuildings = autoLevelBuildings;

  /* ================================================================== */
  /* サンタ / ドラゴン / 季節                                             */
  /* ================================================================== */
  function santaUnlocked(g) {
    g = g || G();
    if (!g) return false;
    var hat = g.Upgrades && g.Upgrades['A festive hat'];
    if (hat && typeof hat.bought !== 'undefined') return !!hat.bought;
    try { if (typeof g.Has === 'function' && g.Has('A festive hat')) return true; } catch (e) { }
    return false;
  }
  Bot.santaUnlocked = santaUnlocked;

  function modSanta() {
    var g = G(), c = Bot.cfg.santa;
    if (!Bot.cfg.master || !c.enabled || !c.autoUpgrade) return;
    if (g.OnAscend) return;
    if (!g.UpgradeSanta || !santaUnlocked(g)) return;
    if (num(g.santaLevel) >= clamp(num(c.maxLevel, 14), 0, 14)) return;
    var cost = Math.pow(num(g.santaLevel) + 1, num(g.santaLevel) + 1);
    if (num(g.cookies) <= cost) return;
    if (num(c.maxCostRatio, 1) < 1 && cost > num(g.cookies) * num(c.maxCostRatio, 1)) return;
    var before = num(g.santaLevel);
    try { g.UpgradeSanta(); } catch (e) { return; }
    if (num(g.santaLevel) !== before) {
      Bot.bump('santaLevels', 1);
      Bot.ev('santa', 'upgrade', { level: num(g.santaLevel) }, { cost: cost, costStr: fmt(cost) });
    }
  }
  Bot.modSanta = modSanta;

  function dragonUnlocked(g) {
    g = g || G();
    if (!g) return false;
    var egg = g.Upgrades && g.Upgrades['A crumbly egg'];
    if (egg && typeof egg.bought !== 'undefined') return !!egg.bought;
    try { if (typeof g.Has === 'function' && g.Has('A crumbly egg')) return true; } catch (e) { }
    return false;
  }
  Bot.dragonUnlocked = dragonUnlocked;

  function dragonSecondAuraUnlocked(g) {
    g = g || G();
    if (!g || !dragonUnlocked(g) || !g.dragonLevels || !g.dragonLevels.length) return false;
    var maxLevel = g.dragonLevels.length - 1;
    return maxLevel > 0 && num(g.dragonLevel) >= maxLevel;
  }
  Bot.dragonSecondAuraUnlocked = dragonSecondAuraUnlocked;

  function modDragon() {
    var g = G(), c = Bot.cfg.dragon;
    if (!Bot.cfg.master || !c.enabled) return;
    if (g.OnAscend) return;
    if (!Bot.dragonUnlocked(g)) return;
    if (c.autoTrain && g.UpgradeDragon) {
      var lvl = num(g.dragonLevel);
      var maxLvl = g.dragonLevels ? g.dragonLevels.length - 1 : 0;
      if (lvl < maxLvl) {
        var ok = false;
        try { ok = g.dragonLevels[lvl].cost(); } catch (e) { ok = false; }
        if (ok) {
          var before = num(g.cookies);
          try { g.UpgradeDragon(); } catch (e) { return; }
          if (num(g.dragonLevel) !== lvl) {
            Bot.bump('dragonLevels', 1);
            Bot.ev('dragon', 'train', { level: num(g.dragonLevel), name: g.dragonLevels[lvl] ? g.dragonLevels[lvl].name : '' },
              { spent: before - num(g.cookies) });
          }
        }
      }
    }
    // オーラ設定
    setAuraIfWanted(0, c.aura1);
    setAuraIfWanted(1, c.aura2);
  }
  Bot.modDragon = modDragon;

  function resolveAura(v) {
    var g = G();
    if (!g.dragonAuras) return -1;
    if (typeof v === 'number') return (g.dragonAuras[v] ? v : -1);
    if (!v) return -1;
    for (var i in g.dragonAuras) { if (g.dragonAuras[i].name === v) return parseInt(i, 10); }
    return -1;
  }
  Bot.resolveAura = resolveAura;

  function setAuraIfWanted(slot, want) {
    var g = G();
    if (!Bot.dragonUnlocked || !Bot.dragonUnlocked(g)) return false;
    if (slot === 1 && (!Bot.dragonSecondAuraUnlocked || !Bot.dragonSecondAuraUnlocked(g))) return false;
    var idx = resolveAura(want);
    if (idx < 0) return false;
    var cur = slot === 0 ? num(g.dragonAura) : num(g.dragonAura2);
    if (cur === idx) return false;
    if (num(g.dragonLevel) < idx + 4) return false;         // 未習得
    var other = slot === 0 ? num(g.dragonAura2) : num(g.dragonAura);
    if (other === idx) return false;                        // 両方に同じオーラは不可
    if (slot === 0) g.dragonAura = idx; else g.dragonAura2 = idx;
    g.recalculateGains = 1; g.storeToRefresh = 1; g.upgradesToRebuild = 1;
    Bot.ev('dragon', 'set-aura', { slot: slot, aura: g.dragonAuras[idx].name, index: idx });
    return true;
  }
  Bot.setAuraIfWanted = setAuraIfWanted;

  Bot.dragonAuraList = function () {
    var g = G(), out = [];
    if (!g.dragonAuras) return out;
    var dragonIsUnlocked = Bot.dragonUnlocked ? Bot.dragonUnlocked(g) : false;
    for (var i in g.dragonAuras) {
      var idx = parseInt(i, 10);
      out.push({ index: idx, name: g.dragonAuras[i].name,
        unlocked: !!dragonIsUnlocked && (idx === 0 || num(g.dragonLevel) >= idx + 4) });
    }
    out.sort(function (a, b) { return a.index - b.index; });
    return out;
  };

  function modSeason() {
    var g = G(), c = Bot.cfg.season;
    if (!Bot.cfg.master || !c.enabled || !c.autoSwitch) return;
    if (g.OnAscend) return;
    if (!c.preferred) return;
    if (g.season === c.preferred) return;
    if (!g.seasons || !g.seasons[c.preferred]) return;
    var trigName = g.seasons[c.preferred].trigger;
    var up = Bot.findUpgrade(trigName);
    if (!up || up.bought) return;
    var price = up.getPrice();
    if (num(g.cookies) < price) return;
    if (num(c.maxCostRatio, 1) < 1 && price > Math.max(1, num(g.unbuffedCps || g.cookiesPs)) * 60 * num(c.maxCostRatio, 1) * 1000) return;
    var before = g.season;
    try { if (!up.buy(1)) return; } catch (e) { return; }
    if (g.season !== before) {
      Bot.bump('seasonSwitches', 1);
      Bot.ev('season', 'switch', { from: before, to: g.season, trigger: trigName }, { cost: price, costStr: fmt(price) });
    }
  }
  Bot.modSeason = modSeason;

  /* ================================================================== */
  /* 保守 (プロンプト閉じ / ミュート / キープアライブ)                      */
  /* ================================================================== */
  function modHousekeep() {
    var g = G(), c = Bot.cfg.housekeep;
    if (!c.enabled) return;
    try {
      if (c.muteSound && num(g.volume) !== 0) { g.volume = 0; if (g.setVolume) g.setVolume(0); }
      if (c.muteMusic && num(g.volumeMusic) !== 0) { g.volumeMusic = 0; if (g.setVolumeMusic) g.setVolumeMusic(0); }
      if (g.prefs) {
        if (c.reduceParticles) g.prefs.particles = 0;
        g.prefs.cookiesound = 0;
        g.prefs.askLumps = 0;
        g.prefs.timeout = 0;
        if (!c.reduceParticles) g.prefs.particles = 1;
      }
      if (c.keepAwake) { g.lastActivity = Date.now(); g.delayTimeouts = 0; g.accumulatedDelay = 0; }
      if (c.autoResume && g.timedout) Bot.resumeGame();
      // 選択セレクタ(ミルク/壁紙など)が開きっぱなしなら閉じる
      if (c.closePrompts && num(g.choiceSelectorOn, -1) !== -1) {
        try {
          var tb = document.getElementById('toggleBox');
          if (tb) { tb.style.display = 'none'; tb.innerHTML = ''; }
          g.choiceSelectorOn = -1;
          Bot.ev('housekeep', 'close-selector', {});
        } catch (e) { }
      }
      if (c.closePrompts && g.promptOn) {
        var id = '';
        try { id = (g.promptL && g.promptL.innerHTML.match(/<id ([A-Za-z]+)/) || [])[1] || ''; } catch (e) { }
        // 意図的に開いた確認ダイアログ以外は閉じる
        if (id !== 'Ascend' && id !== 'Reincarnate') {
          g.ClosePrompt();
          Bot.ev('housekeep', 'close-prompt', { id: id });
        }
      }
      if (c.autosaveSec > 0) {
        var t = Date.now();
        if (!Bot._lastAutosave) Bot._lastAutosave = t;
        if (t - Bot._lastAutosave > num(c.autosaveSec, 60) * 1000) {
          Bot._lastAutosave = t;
          g.toSave = true;
        }
      }
    } catch (e) { Bot.ev('housekeep', 'error', {}, { error: Bot.errStr(e) }); }
  }
  Bot.modHousekeep = modHousekeep;

  /* ================================================================== */
  /* スケジュール登録                                                     */
  /* ================================================================== */
  Bot.every('clicker', 0, modClicker);
  Bot.every('golden', 120, modGolden);
  Bot.every('wrinkler', 1000, modWrinkler);
  Bot.every('lump', 20000, modLump);
  Bot.every('santa', 5000, modSanta);
  Bot.every('dragon', 5000, modDragon);
  Bot.every('season', 15000, modSeason);
  Bot.every('housekeep', 4000, modHousekeep);

})(window);
