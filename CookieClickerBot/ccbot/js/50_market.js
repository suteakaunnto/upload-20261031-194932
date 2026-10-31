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
  var marketDiag = { runs: 0, lastRunAt: 0, lastAction: '', lastReason: '自動取引はまだ実行されていません', buys: 0, sells: 0, apiFallbacks: 0 };
  function MM() { return Bot.minigame('Bank'); }
  function validNumber(v) { var n = Number(v); return isFinite(n) && !isNaN(n); }
  function restingValue(m, good, id) {
    var vals = [];
    if (m && typeof m.getRestingVal === 'function') {
      // 2.058 Web build uses a numeric good ID. Older forks may expect the object.
      try { vals.push(m.getRestingVal(id)); } catch (e) { }
      try { vals.push(m.getRestingVal(good)); } catch (e) { }
    }
    for (var i = 0; i < vals.length; i++) if (validNumber(vals[i]) && Number(vals[i]) > 0) return Number(vals[i]);
    // Official Web build fallback: 10 + 10 per good + (Bank level - 1).
    var level = num(m && m.parent && m.parent.level, 1);
    return Math.max(1, 10 + 10 * num(id) + Math.max(0, level - 1));
  }
  function maxStock(m, good, id) {
    if (m && typeof m.getGoodMaxStock === 'function') {
      try { var a = m.getGoodMaxStock(good); if (validNumber(a) && Number(a) >= 0) return Number(a); } catch (e) { }
      try { var b = m.getGoodMaxStock(id); if (validNumber(b) && Number(b) >= 0) return Number(b); } catch (e2) { }
    }
    // Compatibility fallback based on the game's office rules: base capacity
    // follows the highest number of the corresponding building owned; offices
    // add +50, +75, +100 and the final office multiplies the base by 1.5.
    var bld = good && good.building;
    if (!bld) return Math.max(num(good && good.stock), 0);
    var capacity = Math.max(0, num(bld.highest));
    var office = Math.max(0, Math.min(4, Math.floor(num(m.officeLevel))));
    if (office >= 1) capacity += 50;
    if (office >= 2) capacity += 75;
    if (office >= 3) capacity += 100;
    if (office >= 4) capacity = Math.ceil(capacity * 1.5);
    return Math.max(num(good.stock), capacity);
  }

  function tradeMutation(m, id, qty, kind) {
    var good = m.goodsById[id], beforeStock = num(good.stock), beforeCookies = num(G().cookies), lastError = '';
    var attempts = [];
    if (kind === 'buy') {
      if (typeof m.buyGood === 'function') {
        attempts.push(function () { return m.buyGood(id, qty); });
        attempts.push(function () { return m.buyGood(good, qty, 1); });
      }
    } else {
      if (typeof m.sellGood === 'function') attempts.push(function () { return m.sellGood(id, qty); });
      // Compatible with builds/mods where a negative buyGood quantity is the sell verb.
      if (typeof m.buyGood === 'function') {
        attempts.push(function () { return m.buyGood(id, -qty, 1); });
        attempts.push(function () { return m.buyGood(good, -qty, 1); });
      }
    }
    for (var i = 0; i < attempts.length; i++) {
      var result;
      try { result = attempts[i](); } catch (e) { lastError = Bot.errStr(e); result = undefined; }
      var afterStock = num(good.stock);
      var delta = kind === 'buy' ? afterStock - beforeStock : beforeStock - afterStock;
      if (delta > 0) {
        if (i > 0) marketDiag.apiFallbacks++;
        return { ok: true, qty: delta, cookiesDelta: num(G().cookies) - beforeCookies, fallback: i > 0 };
      }
      // Do not retry if the first method moved stock in the wrong direction.
      if (afterStock !== beforeStock) return { ok: false, error: 'market API changed stock in an unexpected direction' };
      // An explicit false means the signature was accepted but conditions
      // rejected the trade (e.g. same-tick restriction / stock cap). Trying an
      // alternate signature at this point can throw noisy errors for no gain.
      if (result === false || result === 0) return { ok: false, error: '市場APIは取引を拒否しました（価格・在庫上限・同一ティック制限を確認）' };
    }
    return { ok: false, error: lastError || ('market API did not execute ' + kind + ' (check price, stock cap, last-trade restriction and method signature)') };
  }

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
      goods: num(m.goodsById ? m.goodsById.length : 0), overhead: overhead(m),
      automation: { enabled: !!(Bot.cfg.master && Bot.cfg.market && Bot.cfg.market.enabled), runs: marketDiag.runs, lastRunAt: marketDiag.lastRunAt, lastAction: marketDiag.lastAction, lastReason: marketDiag.lastReason, buys: marketDiag.buys, sells: marketDiag.sells, apiFallbacks: marketDiag.apiFallbacks }
    };
  };

  Bot.marketState = function () {
    var m = MM();
    var out = Bot.marketBrief();
    if (!m) return out;
    out.items = [];
    for (var i = 0; i < m.goodsById.length; i++) {
      var me = m.goodsById[i];
      var maxStockValue = maxStock(m, me, i);
      var resting = restingValue(m, me, i);
      var pos = positions[i] || { qty: 0, avg: 0 };
      var vals = me.vals || [];
      out.items.push({
        id: i, key: me.building ? (me.building.bsingle || me.building.name) : '', name: me.name, symbol: me.symbol,
        val: +num(me.val).toFixed(3), prev: +num(me.prev).toFixed(3), stock: num(me.stock), maxStock: maxStockValue,
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
    n = Math.max(1, Math.floor(n));
    var price = num(me.val);
    var trade = tradeMutation(m, id, n, 'buy');
    var got = trade.qty || 0;
    if (got > 0) {
      var spent = Math.max(0, -(trade.cookiesDelta || 0));
      if (!positions[id]) positions[id] = { qty: 0, avg: 0, spentCpsSec: 0 };
      var p = positions[id];
      var newQty = p.qty + got;
      p.avg = newQty > 0 ? (p.avg * p.qty + price * got) / newQty : price;
      p.qty = newQty;
      p.spentCpsSec = num(p.spentCpsSec) + price * got;
      Bot.bump('marketBuys', got); marketDiag.buys += got; marketDiag.lastAction = '購入 ' + me.name + ' ×' + got; marketDiag.lastReason = '取引が成立しました';
      Bot.ev('market', 'buy', { good: me.name, symbol: me.symbol, qty: got, price: +price.toFixed(3), mode: MODE_NAMES[num(me.mode)] || '' },
        { cookiesSpent: spent, cookiesSpentStr: fmt(spent), stock: num(me.stock), maxStock: maxStock(m, me, id) });
    }
    if (!got) marketDiag.lastReason = trade.error || '購入条件を満たさないか、市場APIが変化を反映しませんでした';
    return { ok: got > 0, qty: got, price: price, error: got > 0 ? undefined : (trade.error || 'no stock change') };
  };

  Bot.marketSell = function (id, n) {
    var m = MM(); if (!m) return { ok: false, error: 'market not ready' };
    id = num(id); n = num(n, 1);
    var me = m.goodsById[id];
    if (!me) return { ok: false, error: 'unknown good ' + id };
    n = Math.max(1, Math.floor(n));
    var price = num(me.val);
    var trade = tradeMutation(m, id, n, 'sell');
    var sold = trade.qty || 0;
    if (sold > 0) {
      var gained = Math.max(0, trade.cookiesDelta || 0);
      var p = positions[id] || { qty: 0, avg: 0 };
      var avg = num(p.avg, price);
      p.qty = Math.max(0, num(p.qty) - sold);
      if (p.qty === 0) p.avg = 0;
      positions[id] = p;
      var profitCpsSec = (price - avg * overhead(m)) * sold;
      Bot.bump('marketSells', sold); marketDiag.sells += sold; marketDiag.lastAction = '売却 ' + me.name + ' ×' + sold; marketDiag.lastReason = '取引が成立しました';
      Bot.bump('marketProfitCpsSec', profitCpsSec);
      Bot.ev('market', 'sell', {
        good: me.name, symbol: me.symbol, qty: sold, price: +price.toFixed(3), avgBuy: +avg.toFixed(3),
        mode: MODE_NAMES[num(me.mode)] || ''
      }, { cookiesGained: gained, cookiesGainedStr: fmt(gained), profitCpsSec: +profitCpsSec.toFixed(1), stock: num(me.stock) });
    }
    if (!sold) marketDiag.lastReason = trade.error || '売却条件を満たさないか、市場APIが変化を反映しませんでした';
    return { ok: sold > 0, qty: sold, price: price, error: sold > 0 ? undefined : (trade.error || 'no stock change') };
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
    var m = MM(); if (!m) { marketDiag.lastReason = 'Bankの市場ミニゲームが未ロード'; return; }
    marketDiag.runs++; marketDiag.lastRunAt = Date.now();
    var buysBefore = marketDiag.buys, sellsBefore = marketDiag.sells;
    if (!Bot.cfg.master) { marketDiag.lastReason = 'BOT全体が停止中'; return; }
    if (!Bot.cfg.market.enabled) { marketDiag.lastReason = '市場モジュールが無効'; return; }
    var g = G();
    if (g.OnAscend || g.AscendTimer > 0) { marketDiag.lastReason = '転生処理中のため安全停止'; return; }
    var c = Bot.cfg.market;
    var skipped = { hidden: 0, inactive: 0, full: 0, price: 0, momentum: 0, cps: 0, budget: 0, expected: 0, sold: 0, buyCalls: 0, apiFail: 0, firstApiError: '' };

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
      var resting = restingValue(m, me, i);
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
      if (r && r.ok) skipped.sold++;
    }

    /* --- 購入判断 --- */
    for (i = 0; i < m.goodsById.length; i++) {
      var good = m.goodsById[i];
      if (good.hidden && !c.tradeHidden) { skipped.hidden++; continue; }
      // Some game forks expose `active`; only count inactive zero-position goods
      // as a diagnostic. Existing inventory remains eligible for selling.
      if (good.active === false && num(good.stock) <= 0) skipped.inactive++;
      var maxStockValue = maxStock(m, good, i);
      var room = maxStockValue - num(good.stock);
      if (room <= 0) { skipped.full++; continue; }
      if (num(c.maxStockRatio, 1) < 1) {
        var cap = Math.floor(maxStockValue * clamp(num(c.maxStockRatio, 1), 0, 1));
        if (num(good.stock) >= cap) { skipped.full++; continue; }
      }
      var rest = restingValue(m, good, i);
      var v = num(good.val);
      var buyLimit = rest * clamp(num(c.buyBelowRatio, 0.8), 0.01, 5);
      if (v > buyLimit) { skipped.price++; continue; }
      if (c.momentum && num(good.d) < 0 && num(good.mode) !== 5 && v > buyLimit * 0.75) { skipped.momentum++; continue; }
      var unit = unitCostCookies(m, good);
      if (unit <= 0 || !isFinite(unit)) { skipped.cps++; continue; }
      var canAfford = Math.floor(Math.min(budget, num(g.cookies) * 0.95) / unit);
      var n = Math.min(room, canAfford, clamp(num(c.maxBuyPerTick, 500), 1, 100000));
      if (n < clamp(num(c.minBuyQty, 1), 1, 1e9)) { skipped.budget++; continue; }
      // 期待利益が最低ライン未満なら見送る
      var expect = (rest * clamp(num(c.sellAboveRatio, 1.35), 1.01, 100) - v * oh) * n;
      if (num(c.minProfitCpsSec) > 0 && expect < num(c.minProfitCpsSec)) { skipped.expected++; continue; }
      skipped.buyCalls++;
      budget -= unit * n;
      var buyResult = Bot.marketBuy(i, n);
      if (!buyResult || !buyResult.ok) { skipped.apiFail++; if (!skipped.firstApiError) skipped.firstApiError = (buyResult && buyResult.error) || 'unknown market API failure'; }
      if (budget <= 0) break;
    }
    if (marketDiag.buys > buysBefore || marketDiag.sells > sellsBefore) {
      marketDiag.lastReason = '自動取引成立: 購入 ' + (marketDiag.buys - buysBefore) + '株 / 売却 ' + (marketDiag.sells - sellsBefore) + '株';
    } else {
      marketDiag.lastReason = '売却条件一致 ' + skipped.sold + '件 / 買い見送り: 基準価格 ' + skipped.price + ', 下降傾向 ' + skipped.momentum + ', 上限到達 ' + skipped.full + ', 隠し銘柄 ' + skipped.hidden + ', 非アクティブ在庫0 ' + skipped.inactive + ', 予算/CpS不足 ' + skipped.budget + ', 利益条件 ' + skipped.expected + (skipped.cps ? ', CpS未計測 ' + skipped.cps : '') + (skipped.apiFail ? ' / API拒否 ' + skipped.apiFail + '件: ' + skipped.firstApiError : '');
    }
  }
  Bot.modMarket = modMarket;

  /* ------------------------------------------------------------------ */
  Bot.every('market', 15000, modMarket);

})(window);
