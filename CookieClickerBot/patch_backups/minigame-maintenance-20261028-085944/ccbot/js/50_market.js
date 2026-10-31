/* =====================================================================
   Cookie Clicker Bot - in-page engine : STOCK MARKET (クッキー取引)
   ===================================================================== */
(function (global) {
  'use strict';
  var Bot = global.__CCBOT;
  if (!Bot) return;
  var G = Bot.exported.G, num = Bot.exported.num, fmt = Bot.exported.fmt, clamp = Bot.exported.clamp;

  var MODE_NAMES = ['stable', 'slow rise', 'slow fall', 'bull run', 'crash', 'chaotic'];
  Bot.MARKET_MODES = MODE_NAMES;

  var positions = {};   // goodId -> { buys:[], qty:0, avg:0, spentCpsSec:0 }

  function MM() { return Bot.minigame('Bank'); }

  function overhead(m) { return 1 + 0.01 * (20 * Math.pow(0.95, num(m.brokers))); }

  function unitCostCookies(m, me) {
    var g = G();
    return num(g.cookiesPsRawHighest) * num(me.val) * overhead(m);
  }
  function unitSellCookies(m, me) {
    var g = G();
    return num(g.cookiesPsRawHighest) * num(me.val);
  }

  /* ------------------------------------------------------------------ */
  Bot.marketBrief = function () {
    var m = MM();
    if (!m) return { ready: false, level: num((Bot.findBuilding('Bank') || {}).level) };
    return {
      ready: true, level: num(m.parent.level), officeLevel: num(m.officeLevel),
      brokers: num(m.brokers), maxBrokers: num(m.getMaxBrokers ? m.getMaxBrokers() : 0),
      brokerPrice: num(m.getBrokerPrice ? m.getBrokerPrice() : 0),
      profit: num(m.profit), ticks: num(m.ticks), secondsPerTick: num(m.secondsPerTick),
      goods: num(m.goodsById ? m.goodsById.length : 0), overhead: overhead(m)
    };
  };

  Bot.marketState = function () {
    var m = MM();
    var out = Bot.marketBrief();
    if (!m) return out;
    out.items = [];
    for (var i = 0; i < m.goodsById.length; i++) {
      var me = m.goodsById[i];
      var maxStock = 0; try { maxStock = m.getGoodMaxStock(me); } catch (e) { }
      var resting = 0; try { resting = m.getRestingVal(i); } catch (e) { }
      var pos = positions[i] || { qty: 0, avg: 0 };
      var vals = me.vals || [];
      out.items.push({
        id: i, key: me.building ? (me.building.bsingle || me.building.name) : '', name: me.name, symbol: me.symbol,
        val: +num(me.val).toFixed(3), prev: +num(me.prev).toFixed(3), stock: num(me.stock), maxStock: maxStock,
        mode: num(me.mode), modeName: MODE_NAMES[num(me.mode)] || '', dur: num(me.dur),
        d: +num(me.d).toFixed(4), restingVal: resting, hidden: !!me.hidden, active: !!me.active,
        unitCost: unitCostCookies(m, me), unitSell: unitSellCookies(m, me),
        history: vals.slice(0, 40).map(function (v) { return +num(v).toFixed(2); }),
        position: { qty: pos.qty, avg: +num(pos.avg).toFixed(3) },
        last: num(me.last)
      });
    }
    return out;
  };

  /* ------------------------------------------------------------------ */
  Bot.marketBuy = function (id, n) {
    var m = MM(); if (!m) return { ok: false, error: 'market not ready' };
    id = num(id); n = num(n, 1);
    var me = m.goodsById[id];
    if (!me) return { ok: false, error: 'unknown good ' + id };
    var before = num(G().cookies), beforeStock = num(me.stock);
    var price = num(me.val);
    var ok = false;
    try { ok = m.buyGood(id, n); } catch (e) { return { ok: false, error: Bot.errStr(e) }; }
    var got = num(me.stock) - beforeStock;
    if (got > 0) {
      var spent = before - num(G().cookies);
      if (!positions[id]) positions[id] = { qty: 0, avg: 0, spentCpsSec: 0 };
      var p = positions[id];
      var newQty = p.qty + got;
      p.avg = newQty > 0 ? (p.avg * p.qty + price * got) / newQty : price;
      p.qty = newQty;
      p.spentCpsSec = num(p.spentCpsSec) + price * got;
      Bot.bump('marketBuys', got);
      Bot.ev('market', 'buy', { good: me.name, symbol: me.symbol, qty: got, price: +price.toFixed(3), mode: MODE_NAMES[num(me.mode)] || '' },
        { cookiesSpent: spent, cookiesSpentStr: fmt(spent), stock: num(me.stock), maxStock: (function () { try { return m.getGoodMaxStock(me); } catch (e) { return 0; } })() });
    }
    return { ok: got > 0, qty: got, price: price };
  };

  Bot.marketSell = function (id, n) {
    var m = MM(); if (!m) return { ok: false, error: 'market not ready' };
    id = num(id); n = num(n, 1);
    var me = m.goodsById[id];
    if (!me) return { ok: false, error: 'unknown good ' + id };
    var before = num(G().cookies), beforeStock = num(me.stock);
    var price = num(me.val);
    var ok = false;
    try { ok = m.sellGood(id, n); } catch (e) { return { ok: false, error: Bot.errStr(e) }; }
    var sold = beforeStock - num(me.stock);
    if (sold > 0) {
      var gained = num(G().cookies) - before;
      var p = positions[id] || { qty: 0, avg: 0 };
      var avg = num(p.avg, price);
      p.qty = Math.max(0, num(p.qty) - sold);
      if (p.qty === 0) p.avg = 0;
      positions[id] = p;
      var profitCpsSec = (price - avg * overhead(m)) * sold;
      Bot.bump('marketSells', sold);
      Bot.bump('marketProfitCpsSec', profitCpsSec);
      Bot.ev('market', 'sell', {
        good: me.name, symbol: me.symbol, qty: sold, price: +price.toFixed(3), avgBuy: +avg.toFixed(3),
        mode: MODE_NAMES[num(me.mode)] || ''
      }, { cookiesGained: gained, cookiesGainedStr: fmt(gained), profitCpsSec: +profitCpsSec.toFixed(1), stock: num(me.stock) });
    }
    return { ok: sold > 0, qty: sold, price: price };
  };

  Bot.marketHireBroker = function () {
    var m = MM(); if (!m) return { ok: false, error: 'market not ready' };
    var max = m.getMaxBrokers ? m.getMaxBrokers() : 0;
    if (num(m.brokers) >= max) return { ok: false, error: 'broker limit reached' };
    var price = m.getBrokerPrice ? m.getBrokerPrice() : 0;
    if (num(G().cookies) < price) return { ok: false, error: 'not enough cookies' };
    var before = num(m.brokers);
    G().Spend(price);
    m.brokers = num(m.brokers) + 1;
    if (m.toRedraw !== undefined) m.toRedraw = 2;
    var ok = num(m.brokers) > before;
    if (ok) Bot.ev('market', 'hire-broker', { brokers: num(m.brokers), max: max }, { cost: price, costStr: fmt(price), overhead: +(overhead(m) - 1).toFixed(4) });
    return { ok: ok, brokers: num(m.brokers) };
  };

  Bot.marketUpgradeOffice = function () {
    var m = MM(); if (!m) return { ok: false, error: 'market not ready' };
    if (!m.offices || num(m.officeLevel) >= m.offices.length - 1) return { ok: false, error: 'office maxed' };
    var me = m.offices[num(m.officeLevel)];
    if (!me || !me.cost) return { ok: false, error: 'no upgrade available' };
    var cursor = Bot.findBuilding('Cursor');
    if (!cursor) return { ok: false, error: 'no cursors' };
    if (num(cursor.amount) < me.cost[0] || num(cursor.level) < me.cost[1]) {
      return { ok: false, error: 'need ' + me.cost[0] + ' cursors (level ' + me.cost[1] + ')' };
    }
    try { cursor.sacrifice(me.cost[0]); } catch (e) { return { ok: false, error: Bot.errStr(e) }; }
    m.officeLevel = num(m.officeLevel) + 1;
    if (m.toRedraw !== undefined) m.toRedraw = 2;
    G().recalculateGains = 1; G().storeToRefresh = 1;
    Bot.ev('market', 'office-upgrade', { officeLevel: num(m.officeLevel), name: me.name }, { cursorsSacrificed: me.cost[0] });
    return { ok: true, officeLevel: num(m.officeLevel) };
  };

  /* ------------------------------------------------------------------ */
  function modMarket() {
    var m = MM(); if (!m) return;
    if (!Bot.cfg.master || !Bot.cfg.market.enabled) return;
    var g = G();
    if (g.OnAscend || g.AscendTimer > 0) return;
    var c = Bot.cfg.market;

    if (c.autoBrokers) {
      var maxB = m.getMaxBrokers ? m.getMaxBrokers() : 0;
      if (num(m.brokers) < maxB) {
        var bp = m.getBrokerPrice ? m.getBrokerPrice() : 0;
        // ブローカー1人 = CpSの20分。手数料を恒久的に5%下げるので基本的に元が取れる。
        // 施設の購入と競合しないよう、手持ちに余裕があるときだけ雇う。
        var mult = clamp(num(c.brokerReserveMult, 1.5), 1, 100);
        if (bp > 0 && num(g.cookies) > bp * mult) Bot.marketHireBroker();
      }
    }
    if (c.autoOffice) {
      if (m.offices && num(m.officeLevel) < m.offices.length - 1) {
        var me0 = m.offices[num(m.officeLevel)];
        var cursor = Bot.findBuilding('Cursor');
        if (me0 && me0.cost && cursor && num(cursor.amount) > me0.cost[0] + 100 && num(cursor.level) >= me0.cost[1]) {
          Bot.marketUpgradeOffice();
        }
      }
    }

    var budget = num(g.cookies) * clamp(num(c.spendRatio, 0.6), 0, 1);
    var oh = overhead(m);
    var i;

    /* --- 売却判断 --- */
    for (i = 0; i < m.goodsById.length; i++) {
      var me = m.goodsById[i];
      if (num(me.stock) <= 0) continue;
      var pos = positions[i] || { qty: 0, avg: 0 };
      var avg = num(pos.avg) > 0 ? num(pos.avg) : num(me.prev) || num(me.val);
      var resting = 0; try { resting = m.getRestingVal(i); } catch (e) { resting = 10 + 10 * i; }
      var val = num(me.val);
      var reason = '';
      if (num(c.stopLossRatio) > 0 && avg > 0 && val <= avg * num(c.stopLossRatio)) reason = 'stop-loss';
      else if (avg > 0 && val >= avg * (1 + clamp(num(c.minProfitRatio, 0.25), 0.01, 20))) reason = 'profit-target';
      else if (val >= resting * clamp(num(c.sellAboveRatio, 1.35), 1.01, 100)) reason = 'above-resting';
      else if (c.momentum && num(me.mode) === 4 && num(me.d) < 0 && avg > 0 && val < avg) reason = 'crash-exit';
      if (!reason) continue;
      var qty = num(me.stock);
      if (c.partialSellRatio && num(c.partialSellRatio) < 1) qty = Math.max(1, Math.floor(qty * num(c.partialSellRatio)));
      var r = Bot.marketSell(i, qty);
      if (r && r.ok) { /* ログは marketSell 内 */ }
    }

    /* --- 購入判断 --- */
    for (i = 0; i < m.goodsById.length; i++) {
      var good = m.goodsById[i];
      if (good.hidden && !c.tradeHidden) continue;
      var maxStock = 0; try { maxStock = m.getGoodMaxStock(good); } catch (e) { continue; }
      var room = maxStock - num(good.stock);
      if (room <= 0) continue;
      if (num(c.maxStockRatio, 1) < 1) {
        var cap = Math.floor(maxStock * clamp(num(c.maxStockRatio, 1), 0, 1));
        if (num(good.stock) >= cap) continue;
      }
      var rest = 0; try { rest = m.getRestingVal(i); } catch (e) { rest = 10 + 10 * i; }
      var v = num(good.val);
      var buyLimit = rest * clamp(num(c.buyBelowRatio, 0.8), 0.01, 5);
      if (v > buyLimit) continue;
      if (c.momentum && num(good.d) < 0 && num(good.mode) !== 5) continue;   // 下落中は待つ
      var unit = unitCostCookies(m, good);
      if (unit <= 0) continue;
      var canAfford = Math.floor(Math.min(budget, num(g.cookies) * 0.95) / unit);
      var n = Math.min(room, canAfford, clamp(num(c.maxBuyPerTick, 500), 1, 100000));
      if (n < clamp(num(c.minBuyQty, 1), 1, 1e9)) continue;
      // 期待利益が最低ライン未満なら見送る
      var expect = (rest * clamp(num(c.sellAboveRatio, 1.35), 1.01, 100) - v * oh) * n;
      if (num(c.minProfitCpsSec) > 0 && expect < num(c.minProfitCpsSec)) continue;
      budget -= unit * n;
      Bot.marketBuy(i, n);
      if (budget <= 0) break;
    }
  }
  Bot.modMarket = modMarket;

  /* ------------------------------------------------------------------ */
  Bot.every('market', 15000, modMarket);

})(window);
