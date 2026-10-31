/* =====================================================================
   Cookie Clicker Bot - in-page engine : ASCENSION (転生) & 天界スキルツリー
   ===================================================================== */
(function (global) {
  'use strict';
  var Bot = global.__CCBOT;
  if (!Bot) return;
  var G = Bot.exported.G, num = Bot.exported.num, fmt = Bot.exported.fmt, clamp = Bot.exported.clamp;

  /* 推奨購入順 (コミュニティで広く使われている優先度)
     ここに無いものは「購入可能な中で一番安いもの」を自動的に選ぶ            */
  var PRESTIGE_PRIORITY = [
    'Legacy', 'Heavenly cookies', 'Tin of british tea biscuits', 'Box of macarons',
    'Box of brand biscuits', 'Tin of butter cookies', 'Starter kit', 'Heralds',
    'Heavenly luck', 'Twin Gates of Transcendence', 'Angels', 'Archangels', 'Virtues',
    'Dominions', 'Kitten angels', 'Cherubim', 'Seraphim', 'God',
    'Persistent memory', 'Starter kitchen', 'Halo gloves', 'Unholy bait', 'Elder spice',
    'Sacrilegious corruption', 'Season switcher', 'Golden switch', 'Residual luck',
    'Lucky digit', 'Lucky number', 'Lasting fortune', 'Decisive fate', 'Lucky payout',
    'Divine discount', 'Divine sales', 'Divine bakeries', 'Five-finger discount',
    'Kitten specialists', 'Kitten experts', 'Classic dairy selection', 'Basic wallpaper assortment',
    'How to bake your dragon', 'Pet the dragon', 'Synergies Vol. I', 'Synergies Vol. II',
    'A crumbly egg', 'Chimera', 'Wrinkly cookies', 'Kitten analysts', 'Eye of the wrinkler',
    'Permanent upgrade slot I', 'Inspired checklist', 'Genius accounting', 'Label printer',
    'Permanent upgrade slot II', 'Stevia Caelestis', 'Diabetica Daemonicus', 'Sucralosia Inutilis',
    'Sugar baking', 'Sugar craving', 'Sugar aging process', 'Sugar crystal cookies',
    'Belphegor', 'Mammon', 'Abaddon', 'Satan', 'Asmodeus', 'Beelzebub', 'Lucifer',
    'Aura gloves', 'Luminous gloves', 'Cat ladies', 'Kitten wages', 'Milkhelp&reg; lactose intolerance relief tablets',
    'Fanciful dairy selection', 'Distinguished wallpaper assortment', 'Sound test',
    'Distilled essence of redoubled luck', 'Shimmering veil', 'Reinforced membrane',
    'Cosmic beginner\'s luck', 'Delicate touch', 'Steadfast murmur', 'Glittering edge',
    'Fortune cookies', 'Fortune #103', 'Fortune #104', 'Keepsakes', 'Wrapping paper',
    'Starspawn', 'Starsnow', 'Starterror', 'Starlove', 'Startrade',
    'Golden cookie alert sound', 'Fantasteel mouse', 'Nevercrack mouse',
    'Box of maybe cookies', 'Box of not cookies', 'Box of pastries',
    'Permanent upgrade slot III', 'Permanent upgrade slot IV', 'Permanent upgrade slot V'
  ];
  Bot.PRESTIGE_PRIORITY = PRESTIGE_PRIORITY;

  /* 恒久アップグレードの推奨 (所持していれば自動でスロットに割り当てる) */
  var PERMA_RECOMMENDED = [
    'Sugar baking', 'Sugar crystal cookies', 'Heavenly cookies', 'Wrinkly cookies',
    'Stevia Caelestis', 'Diabetica Daemonicus', 'Sucralosia Inutilis', 'Keepsakes',
    'Distilled essence of redoubled luck', 'Fortune cookies'
  ];
  Bot.PERMA_RECOMMENDED = PERMA_RECOMMENDED;

  /* ------------------------------------------------------------------ */
  var ascendState = { requestedAt: 0, reason: '', gain: 0, backedUp: false, lastAscendAt: 0, ascendsToday: 0, dayKey: '' };
  Bot.ascendState = ascendState;
  Bot.pendingAscend = null;

  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  Bot.ascendInfo = function () {
    var g = G();
    if (!Bot.ready()) return {};
    var proj = Bot.projectedPrestige();
    var c = Bot.cfg.ascend;
    var need = requiredGain();
    return {
      prestige: num(g.prestige), projected: proj.projected, gain: proj.gain, requiredGain: need,
      chips: num(g.heavenlyChips), chipsSpent: num(g.heavenlyChipsSpent),
      cookiesEarned: num(g.cookiesEarned), cookiesReset: num(g.cookiesReset),
      ready: proj.gain >= need, mode: c.mode, percent: num(c.percent), minGain: num(c.minGain),
      pending: !!Bot.pendingAscend, onAscend: !!g.OnAscend,
      ascensions: num(g.resets), lastAscendAt: ascendState.lastAscendAt,
      ascendsToday: ascendState.ascendsToday
    };
  };

  function requiredGain() {
    var g = G(), c = Bot.cfg.ascend;
    var cur = num(g.prestige);
    var need = num(c.minGain, 1);
    if ((c.mode || 'percent') === 'percent') {
      var pct = clamp(num(c.percent, 50), 0, 100000);
      var byPct = Math.ceil(cur * pct / 100);
      // 序盤(prestige が小さい)は絶対値を優先する
      need = cur < 10 ? Math.max(1, num(c.minGain, 1)) : Math.max(byPct, num(c.minGain, 1));
    }
    return Math.max(1, Math.floor(need));
  }
  Bot.requiredGain = requiredGain;

  /* ------------------------------------------------------------------ */
  function canAscendNow() {
    var g = G(), c = Bot.cfg.ascend;
    if (!c.enabled) return { ok: false, why: 'disabled' };
    if (g.OnAscend || g.AscendTimer > 0 || g.ReincarnateTimer > 0) return { ok: false, why: 'busy' };
    var proj = Bot.projectedPrestige();
    var need = requiredGain();
    if (proj.gain < need) return { ok: false, why: 'gain ' + proj.gain + ' < required ' + need };
    if (num(c.minAbsolutePrestige) > 0 && proj.projected < num(c.minAbsolutePrestige)) return { ok: false, why: 'projected prestige too low' };
    if (num(c.cooldownSec) > 0 && ascendState.lastAscendAt && (Date.now() - ascendState.lastAscendAt) < num(c.cooldownSec) * 1000) return { ok: false, why: 'cooldown' };
    var dk = dayKey();
    if (ascendState.dayKey !== dk) { ascendState.dayKey = dk; ascendState.ascendsToday = 0; }
    if (num(c.maxPerDay) > 0 && ascendState.ascendsToday >= num(c.maxPerDay)) return { ok: false, why: 'daily limit reached' };
    // CpS が十分育ってから転生する (オプション)
    if (num(c.minCpsSeconds) > 0 && num(g.cookiesPs) > 0) {
      if (num(g.cookies) < num(g.cookiesPs) * num(c.minCpsSeconds)) return { ok: false, why: 'banking cookies' };
    }
    return { ok: true, gain: proj.gain, projected: proj.projected };
  }
  Bot.canAscendNow = canAscendNow;

  function modAscend() {
    var g = G(), c = Bot.cfg.ascend;
    if (!Bot.cfg.master || !c.enabled) return;

    /* 昇天画面内での処理 */
    if (g.OnAscend) {
      if (c.prestigeOnAscend !== false && Bot.cfg.prestige.enabled) buyPrestigeUpgrades();
      assignPermanentUpgrades();
      if (c.autoReincarnate) {
        if (!ascendState.reincarnateAt) ascendState.reincarnateAt = Date.now() + clamp(num(c.reincarnateDelaySec, 3), 0, 600) * 1000;
        if (Date.now() >= ascendState.reincarnateAt) {
          ascendState.reincarnateAt = 0;
          Bot.reincarnateNow('auto');
        }
      }
      return;
    }
    ascendState.reincarnateAt = 0;

    /* 昇天アニメーション中は待つ */
    if (g.AscendTimer > 0 || g.ReincarnateTimer > 0) return;

    /* バックアップ待ち */
    if (Bot.pendingAscend) {
      var waited = (Date.now() - Bot.pendingAscend.at) / 1000;
      var timeout = clamp(num(c.backupTimeoutSec, 60), 5, 3600);
      if (Bot.pendingAscend.cleared || waited > timeout) {
        var why = Bot.pendingAscend.cleared ? 'backup done' : ('backup timeout after ' + Math.round(waited) + 's');
        var info = Bot.pendingAscend;
        Bot.pendingAscend = null;
        Bot.ev('ascend', 'backup-' + (info.cleared ? 'ok' : 'timeout'), { reason: why });
        doAscend(info.reason);
      }
      return;
    }

    var chk = canAscendNow();
    if (!chk.ok) return;
    if (c.backupFirst !== false) {
      Bot.pendingAscend = { at: Date.now(), reason: chk.why || 'auto', gain: chk.gain, projected: chk.projected, cleared: false };
      Bot.ev('ascend', 'request', {
        gain: chk.gain, projected: chk.projected, prestige: num(g.prestige),
        cookiesEarned: num(g.cookiesEarned), cookiesPs: num(g.cookiesPs)
      }, { waitingFor: 'save backup' });
    } else {
      doAscend('auto (no backup)');
    }
  }
  Bot.modAscend = modAscend;

  Bot.clearAscendBackup = function () {
    if (Bot.pendingAscend) Bot.pendingAscend.cleared = true;
    return !!Bot.pendingAscend;
  };

  function doAscend(reason) {
    var g = G();
    var proj = Bot.projectedPrestige();
    var chipsBefore = num(g.heavenlyChips) + num(g.heavenlyChipsSpent);
    try { g.Ascend(1); } catch (e) { Bot.ev('ascend', 'error', { reason: reason }, { error: Bot.errStr(e) }); return false; }
    ascendState.lastAscendAt = Date.now();
    ascendState.ascendsToday++;
    ascendState.reincarnateAt = 0;
    Bot.bump('ascensions', 1);
    Bot.bump('chipsGained', Math.max(0, proj.gain));
    Bot.ev('ascend', 'ascend', {
      reason: reason, prestigeBefore: num(g.prestige), projected: proj.projected, gain: proj.gain,
      cookiesEarned: num(g.cookiesEarned), cookiesReset: num(g.cookiesReset), chipsBefore: chipsBefore
    }, { animationSec: 5 });
    return true;
  }

  Bot.ascendNow = function (reason) { return doAscend(reason || 'manual'); };

  Bot.reincarnateNow = function (reason) {
    var g = G();
    if (!g.OnAscend) return false;
    var chips = num(g.heavenlyChips);
    var prestige = num(g.prestige);
    try { g.Reincarnate(1); } catch (e) { Bot.ev('ascend', 'error', { step: 'reincarnate' }, { error: Bot.errStr(e) }); return false; }
    Bot.ev('ascend', 'reincarnate', { reason: reason || 'manual', prestige: prestige },
      { chipsLeft: chips, ascensions: num(g.resets) });
    return true;
  };

  /* ------------------------------------------------------------------ */
  /* 天界スキルツリー (プレステージアップグレード)                          */
  /* ------------------------------------------------------------------ */
  function prestigeCanBuy(u) {
    var g = G();
    if (!u || u.bought) return false;
    var parents = u.parents || [];
    for (var i = 0; i < parents.length; i++) {
      var p = parents[i];
      if (p && p !== -1 && !p.bought) return false;
    }
    if (u.showIf) { try { if (!u.showIf()) return false; } catch (e) { } }
    return num(g.heavenlyChips) >= u.getPrice();
  }
  Bot.prestigeCanBuy = prestigeCanBuy;

  function priorityOf(u) {
    var cfgList = Bot.cfg.prestige.priorityList;
    var list = (cfgList && cfgList.length) ? cfgList : PRESTIGE_PRIORITY;
    var n = u.name || '', d = u.dname || u.name || '';
    for (var i = 0; i < list.length; i++) {
      if (list[i] === n || list[i] === d) return i;
    }
    return 100000;
  }

  function buyPrestigeUpgrades() {
    var g = G(), c = Bot.cfg.prestige;
    if (!g.PrestigeUpgrades) return;
    var reserve = num(c.reserveChips, 0);
    var maxPer = clamp(num(c.maxPerTick, 12), 1, 200);
    var bought = 0, spent = 0, names = [];

    for (var pass = 0; pass < maxPer; pass++) {
      var cands = [];
      for (var i = 0; i < g.PrestigeUpgrades.length; i++) {
        var u = g.PrestigeUpgrades[i];
        if (u.pool === 'prestigeDecor') continue;
        if (!prestigeCanBuy(u)) continue;
        if (num(g.heavenlyChips) - u.getPrice() < reserve) continue;
        if (c.blacklist && c.blacklist.length) {
          var bad = false;
          for (var b = 0; b < c.blacklist.length; b++) if (c.blacklist[b] === u.name || c.blacklist[b] === u.dname) { bad = true; break; }
          if (bad) continue;
        }
        cands.push({ u: u, price: u.getPrice(), prio: priorityOf(u) });
      }
      if (!cands.length) break;
      cands.sort(function (x, y) {
        if (c.strategy === 'cheapest') return (x.price - y.price) || (x.prio - y.prio);
        return (x.prio - y.prio) || (x.price - y.price);
      });
      var pick = cands[0];
      var chipsBefore = num(g.heavenlyChips);
      var ok = false;
      try { ok = !!pick.u.buy(1); } catch (e) { Bot.ev('prestige', 'error', { name: pick.u.name }, { error: Bot.errStr(e) }); break; }
      if (!ok || !pick.u.bought) break;
      var cost = chipsBefore - num(g.heavenlyChips);
      bought++; spent += cost;
      names.push({ name: pick.u.dname || pick.u.name, cost: cost });
      Bot.bump('prestigeBought', 1);
      Bot.ev('prestige', 'buy', { name: pick.u.dname || pick.u.name, internal: pick.u.name },
        { chips: cost, chipsLeft: num(g.heavenlyChips), priority: pick.prio >= 100000 ? null : pick.prio + 1 });
      if (g.BuildAscendTree) { try { g.BuildAscendTree(pick.u); } catch (e) { } }
    }
    if (bought) {
      Bot.ev('prestige', 'summary', { count: bought, items: names.slice(0, 10) }, { spent: spent, chipsLeft: num(g.heavenlyChips) });
    }
  }
  Bot.buyPrestigeUpgrades = buyPrestigeUpgrades;

  function assignPermanentUpgrades() {
    var g = G(), c = Bot.cfg.prestige;
    if (!c.autoAssignPermanent) return;
    var want = (c.permanentUpgrades && c.permanentUpgrades.length) ? c.permanentUpgrades : PERMA_RECOMMENDED;
    for (var slot = 0; slot < 5; slot++) {
      var slotUp = g.Upgrades['Permanent upgrade slot ' + ['I', 'II', 'III', 'IV', 'V'][slot]];
      if (!slotUp || !slotUp.bought) continue;
      var cur = g.permanentUpgrades[slot];
      if (cur !== undefined && cur !== -1) {
        var curUp = g.UpgradesById[cur];
        if (curUp && curUp.bought) continue;      // 既に有効なものが割り当て済み
      }
      // 割り当てる候補を探す
      for (var w = 0; w < want.length; w++) {
        var up = Bot.findUpgrade(want[w]);
        if (!up) continue;
        if (!up.bought || !up.unlocked || up.noPerm) continue;
        if (!(up.pool === '' || up.pool === 'cookie')) continue;
        var taken = false;
        for (var s2 = 0; s2 < 5; s2++) if (g.permanentUpgrades[s2] === up.id) taken = true;
        if (taken) continue;
        g.permanentUpgrades[slot] = up.id;
        if (g.BuildAscendTree) { try { g.BuildAscendTree(); } catch (e) { } }
        Bot.ev('prestige', 'permanent-slot', { slot: slot + 1, name: up.dname || up.name, id: up.id });
        break;
      }
    }
  }
  Bot.assignPermanentUpgrades = assignPermanentUpgrades;

  /* 手動 : 恒久スロットに指定 */
  Bot.setPermanentUpgrade = function (slot, nameOrId) {
    var g = G();
    slot = clamp(num(slot, 0), 0, 4);
    var up = null;
    if (typeof nameOrId === 'number') up = g.UpgradesById[nameOrId];
    else up = Bot.findUpgrade(nameOrId);
    if (nameOrId === -1 || nameOrId === null || nameOrId === '') {
      g.permanentUpgrades[slot] = -1;
      if (g.BuildAscendTree) g.BuildAscendTree();
      Bot.ev('prestige', 'permanent-slot', { slot: slot + 1, name: null });
      return { ok: true };
    }
    if (!up) return { ok: false, error: 'upgrade not found' };
    if (!up.bought) return { ok: false, error: 'upgrade not owned' };
    g.permanentUpgrades[slot] = up.id;
    if (g.BuildAscendTree) { try { g.BuildAscendTree(); } catch (e) { } }
    Bot.ev('prestige', 'permanent-slot', { slot: slot + 1, name: up.dname || up.name, id: up.id }, { manual: true });
    return { ok: true, id: up.id };
  };

  /* 手動 : 特定のプレステージアップグレードを買う */
  Bot.buyPrestigeUpgrade = function (name) {
    var g = G();
    var u = Bot.findUpgrade(name);
    if (!u) return { ok: false, error: 'not found: ' + name };
    if (u.pool !== 'prestige') return { ok: false, error: 'not a prestige upgrade' };
    if (u.bought) return { ok: false, error: 'already owned' };
    if (!g.OnAscend) return { ok: false, error: 'must be on the ascension screen' };
    if (!prestigeCanBuy(u)) return { ok: false, error: 'not purchasable (parents or chips)' };
    var chips = num(g.heavenlyChips);
    var ok = false;
    try { ok = !!u.buy(1); } catch (e) { return { ok: false, error: Bot.errStr(e) }; }
    if (ok) {
      Bot.ev('prestige', 'manual-buy', { name: u.dname || u.name }, { chips: chips - num(g.heavenlyChips), chipsLeft: num(g.heavenlyChips) });
      if (g.BuildAscendTree) { try { g.BuildAscendTree(u); } catch (e) { } }
    }
    return { ok: !!ok };
  };

  /* ------------------------------------------------------------------ */
  Bot.every('ascend', 5000, modAscend);

})(window);
