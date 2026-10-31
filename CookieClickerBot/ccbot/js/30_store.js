/* =====================================================================
   Cookie Clicker Bot - in-page engine : STORE (アップグレード / 施設購入)
   ===================================================================== */
(function (global) {
  'use strict';
  var Bot = global.__CCBOT;
  if (!Bot) return;
  var G = Bot.exported.G, num = Bot.exported.num, fmt = Bot.exported.fmt, clamp = Bot.exported.clamp;

  /* 大惨事(grandmapocalypse)関連のアップグレード */
  var APOCALYPSE_START = ['One mind', 'Communal brainsweep', 'Elder Pact'];
  var APOCALYPSE_STOP = ['Elder Pledge', 'Elder Covenant'];

  function blacklisted(u) {
    var c = Bot.cfg.upgrade;
    var name = u.name;                       // 内部名で判定(言語非依存)
    var dname = u.dname || u.name;
    if (c.blacklist && c.blacklist.length) {
      for (var i = 0; i < c.blacklist.length; i++) {
        var b = c.blacklist[i];
        if (b === name || b === dname) return true;
      }
    }
    if (c.whitelist && c.whitelist.length) {
      var found = false;
      for (var j = 0; j < c.whitelist.length; j++) {
        if (c.whitelist[j] === name || c.whitelist[j] === dname) { found = true; break; }
      }
      if (!found) return true;
    }
    if (c.grandmapocalypse === 'off') {
      if (APOCALYPSE_START.indexOf(name) !== -1) return true;
    } else if (c.grandmapocalypse === 'on') {
      if (APOCALYPSE_STOP.indexOf(name) !== -1) return true;
    }
    return false;
  }
  Bot.blacklisted = blacklisted;

  /* ================================================================== */
  /* アップグレード購入                                                   */
  /* ================================================================== */
  function modUpgrade() {
    var g = G(), c = Bot.cfg.upgrade;
    if (!Bot.cfg.master || !c.enabled) return;
    if (g.OnAscend || g.AscendTimer > 0) return;

    var store = g.UpgradesInStore || [];
    var reserve = Bot.reserveCookies();
    var budget = num(g.cookies) - reserve;
    if (budget <= 0) return;

    var cands = [];
    for (var i = 0; i < store.length; i++) {
      var u = store[i];
      if (!u || u.bought) continue;
      if (u.isVaulted && u.isVaulted()) continue;
      if (u.pool === 'toggle' && !c.buyToggles) continue;
      if (u.pool === 'tech' && !c.buyTech) continue;
      // 選択ダイアログを開くだけの UI 系(ミルク/壁紙/音など)は絶対に触らない
      if (u.choicesFunction) continue;
      if (num(u.priceLumps) > 0 && !c.buyLumpUpgrades) continue;
      if (blacklisted(u)) continue;
      var price;
      try { price = u.getPrice(); } catch (e) { continue; }
      if (!(price >= 0)) continue;
      var canBuy = false;
      try { canBuy = !!u.canBuy(); } catch (e) { canBuy = num(g.cookies) >= price; }
      if (!canBuy) continue;
      if (price > budget) continue;
      cands.push({ u: u, price: price, order: num(u.order, u.id) });
    }
    if (!cands.length) return;

    // 購入順 : クリック/子猫系など倍率が高いものを優先 → 価格昇順
    cands.sort(function (a, b) {
      var pa = upgradePriority(a.u), pb = upgradePriority(b.u);
      if (pa !== pb) return pa - pb;
      return a.price - b.price;
    });

    var maxPer = clamp(num(c.maxPerTick, 8), 1, 100);
    var bought = 0, spent = 0;
    for (var k = 0; k < cands.length && bought < maxPer; k++) {
      var cand = cands[k];
      if (num(g.cookies) - cand.price < reserve) break;
      if (cand.u.pool === 'prestige') continue;
      var ok = false;
      try { ok = !!cand.u.buy(1); } catch (e) { ok = false; }
      if (ok && cand.u.bought) {
        bought++; spent += cand.price; budget -= cand.price;
        Bot.bump('upgrades', 1);
        Bot.ev('upgrade', 'buy', { name: cand.u.dname || cand.u.name, pool: cand.u.pool || 'main' },
          { price: cand.price, priceStr: fmt(cand.price), cookiesLeft: num(g.cookies) });
      }
    }
    if (bought) {
      g.upgradesToRebuild = 1; g.recalculateGains = 1; g.storeToRefresh = 1;
    }
  }
  Bot.modUpgrade = modUpgrade;

  /* 倍率系(クリック/子猫/ゴールデン)を優先して早期に雪だるま式成長させる */
  function upgradePriority(u) {
    var n = u.name || '';
    if (/finger|Thousand|Million|Billion|Trillion|Quadrillion|Quintillion|Sextillion|Septillion|Octillion|Nonillion|Decillion|Undecillion|Duodecillion|Tredecillion|Quattuordecillion|Quindecillion|hand|mouse/i.test(n)) return 0;
    if (/^Kitten/i.test(n) || /kitten/i.test(n)) return 1;
    if (/Lucky day|Serendipity|Get lucky|Heavenly luck|Lasting fortune|Decisive fate|Golden goose egg|Fortune/i.test(n)) return 2;
    if (u.pool === 'cookie') return 5;                 // クッキー倍率アップグレード
    if (u.pool === 'tech') return 6;
    if (u.tier) return 7;                              // 施設ティア
    return 10;
  }

  /* ================================================================== */
  /* 施設購入                                                             */
  /* ================================================================== */
  function modBuilding() {
    var g = G(), c = Bot.cfg.building;
    if (!Bot.cfg.master || !c.enabled) return;
    if (g.OnAscend || g.AscendTimer > 0) return;

    var reserve = Bot.reserveCookies();
    var budget = num(g.cookies) - reserve;
    if (budget <= 0) return;

    var maxPer = clamp(num(c.maxPerTick, 25), 1, 200);
    var boughtTotal = 0, spentTotal = 0;
    var detail = [];

    for (var pass = 0; pass < maxPer; pass++) {
      budget = num(g.cookies) - reserve;
      if (budget <= 0) break;

      var best = null, bestScore = -1, bestInfo = null;
      var strategy = c.strategy || 'payback';

      if (strategy === 'cheapest') {
        for (var i = 0; i < g.ObjectsById.length; i++) {
          var me0 = g.ObjectsById[i];
          if (me0.muted) continue;
          if (c.ignore && c.ignore.indexOf(me0.bsingle || me0.name) !== -1) continue;
          var p0;
          try { p0 = me0.getPrice(); } catch (e) { continue; }
          if (p0 > budget) continue;
          if (best === null || p0 < bestScore) { best = me0; bestScore = p0; }
        }
      } else {
        var cpsMap = Bot.measureCps(false);
        for (var j = 0; j < g.ObjectsById.length; j++) {
          var me = g.ObjectsById[j];
          if (me.muted) continue;
          if (c.ignore && c.ignore.indexOf(me.bsingle || me.name) !== -1) continue;
          var p;
          try { p = me.getPrice(); } catch (e) { continue; }
          if (p > budget) continue;
          var gain = num(cpsMap[me.id], 0);
          if (gain <= 0) continue;
          var payback = p / gain;
          if (num(c.maxPaybackSec) > 0 && payback > num(c.maxPaybackSec)) continue;
          var score = gain / p;                 // 回収効率
          if (score > bestScore) { bestScore = score; best = me; bestInfo = { payback: payback, gain: gain }; }
        }
      }

      if (!best) break;
      var price = best.getPrice();
      var beforeAmt = num(best.amount);
      try { best.buy(1); } catch (e) { break; }
      if (num(best.amount) <= beforeAmt) break;

      boughtTotal++; spentTotal += price;
      detail.push({ b: best.bsingle || best.name, p: price, pb: bestInfo ? Math.round(bestInfo.payback) : null });
      Bot.bump('buildings', 1);
      Bot.bump('buildingsSpent', price);
      if (detail.length >= 40) break;
    }

    if (boughtTotal) {
      g.recalculateGains = 1; g.storeToRefresh = 1;
      // 個別ログは代表分だけ出して、詳細は summary にまとめる
      var agg = {};
      for (var d = 0; d < detail.length; d++) {
        var k = detail[d].b;
        if (!agg[k]) agg[k] = { n: 0, spent: 0 };
        agg[k].n++; agg[k].spent += detail[d].p;
      }
      var aggList = [];
      for (var key in agg) aggList.push({ building: key, count: agg[key].n, spent: agg[key].spent, spentStr: fmt(agg[key].spent) });
      aggList.sort(function (a, b) { return b.spent - a.spent; });
      Bot.ev('building', 'buy', { count: boughtTotal, items: aggList.slice(0, 6) },
        { spent: spentTotal, spentStr: fmt(spentTotal), cookiesLeft: num(g.cookies), cookiesPs: num(g.cookiesPs) });
    }
  }
  Bot.modBuilding = modBuilding;

  /* 手動 : 指定施設を n 個購入 */
  Bot.buyBuilding = function (key, n) {
    var g = G();
    var me = Bot.findBuilding(key);
    if (!me) return { ok: false, error: 'building not found: ' + key };
    n = clamp(num(n, 1), -1, 10000);
    var before = num(me.amount), beforeC = num(g.cookies);
    try { me.buy(n); } catch (e) { return { ok: false, error: Bot.errStr(e) }; }
    var got = num(me.amount) - before;
    Bot.ev('building', 'manual-buy', { building: me.name, requested: n }, { bought: got, spent: beforeC - num(g.cookies) });
    return { ok: got > 0, bought: got, spent: beforeC - num(g.cookies), amount: num(me.amount) };
  };

  /* 手動 : 指定アップグレードを購入 */
  Bot.buyUpgrade = function (name) {
    var g = G();
    var u = Bot.findUpgrade(name);
    if (!u) return { ok: false, error: 'upgrade not found: ' + name };
    if (u.bought) return { ok: false, error: 'already owned' };
    var price = u.getPrice();
    var ok = false;
    try { ok = !!u.buy(1); } catch (e) { return { ok: false, error: Bot.errStr(e) }; }
    if (ok) Bot.ev('upgrade', 'manual-buy', { name: u.dname || u.name }, { price: price });
    return { ok: !!ok, price: price, bought: !!u.bought };
  };

  /* ================================================================== */
  Bot.every('upgrade', 700, modUpgrade);
  Bot.every('building', 1200, modBuilding);

})(window);
