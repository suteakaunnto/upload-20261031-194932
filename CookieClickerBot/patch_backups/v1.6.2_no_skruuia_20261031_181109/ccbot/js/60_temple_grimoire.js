/* =====================================================================
   Cookie Clicker Bot - in-page engine : TEMPLE(神殿/スキル) & GRIMOIRE(魔法)
   ===================================================================== */
(function (global) {
  'use strict';
  var Bot = global.__CCBOT;
  if (!Bot) return;
  var G = Bot.exported.G, num = Bot.exported.num, fmt = Bot.exported.fmt, clamp = Bot.exported.clamp;

  function TP() { return Bot.minigame('Temple'); }
  function WP() { return Bot.minigame('Wizard tower'); }
  var pantheonDiag = { lastAction: '', lastReason: '自動配置は未実行', lastAt: 0, moved: 0 };
  var grimoireDiag = { lastSpell: '', lastResult: '', lastAt: 0, casts: 0, failures: 0 };

  /* ================================================================== */
  /* 神殿 (Pantheon) - 神の配置                                           */
  /* ================================================================== */
  Bot.pantheonState = function () {
    var m = TP();
    if (!m) return { ready: false, level: num((Bot.findBuilding('Temple') || {}).level) };
    var out = {
      ready: true, level: num(m.parent.level), swaps: num(m.swaps), maxSwaps: 3,
      enabled: !!(Bot.cfg.master && Bot.cfg.pantheon.enabled), autoSlot: !!Bot.cfg.pantheon.autoSlot,
      loadout: (Bot.cfg.pantheon.loadout || []).slice(0, 3), lastAction: pantheonDiag.lastAction, lastReason: pantheonDiag.lastReason, lastAt: pantheonDiag.lastAt, moved: pantheonDiag.moved,
      swapInSec: 0, slots: [-1, -1, -1], slotNames: ['Diamond', 'Ruby', 'Jade'], gods: []
    };
    try {
      var swapCount = Math.max(0, Math.min(3, Math.floor(num(m.swaps))));
      var t = swapCount >= 3 ? 0 : (swapCount === 2 ? 1000 * 60 * 60 : (swapCount === 1 ? 1000 * 60 * 60 * 4 : 1000 * 60 * 60 * 16));
      out.swapInSec = swapCount >= 3 ? 0 : Math.max(0, (num(m.swapT, Date.now()) + t - Date.now()) / 1000);
    } catch (e) { }
    for (var i = 0; i < 3; i++) out.slots[i] = (m.slot && m.slot[i] !== undefined && m.slot[i] >= 0) ? num(m.slot[i]) : -1;
    for (var k = 0; k < m.godsById.length; k++) {
      var god = m.godsById[k];
      out.gods.push({
        id: god.id, key: god.key || '', name: (god.name || '').replace(/<[^>]+>/g, ''),
        slot: num(god.slot, -1),
        effect: String(god.desc1 || '').replace(/<[^>]+>/g, '').replace(/loc\("/g, '').slice(0, 160)
      });
    }
    return out;
  };

  function findGod(m, want) {
    if (!m) return null;
    if (typeof want === 'number') return m.godsById[want] || null;
    if (!want && want !== 0) return null;
    if (/^\d+$/.test(String(want))) return m.godsById[Number(want)] || null;
    for (var i = 0; i < m.godsById.length; i++) {
      var god = m.godsById[i];
      var key = god.key || '';
      if (key === want) return god;
      var nm = String(god.name || '').toLowerCase();
      if (nm.indexOf(String(want).toLowerCase()) !== -1) return god;
    }
    if (m.gods && m.gods[want]) return m.gods[want];
    return null;
  }
  Bot.findGod = findGod;

  Bot.slotGod = function (want, slot) {
    var m = TP(); if (!m) return { ok: false, error: 'pantheon not ready' };
    var god = findGod(m, want);
    if (!god) return { ok: false, error: 'unknown god: ' + want };
    slot = clamp(num(slot, 0), -1, 2);
    if (num(god.slot) === slot) return { ok: false, error: 'already slotted' };
    var cfg = Bot.cfg.pantheon;
    // Removing a spirit from a slot is free in the game's rules; placing or
    // swapping one into a slot requires one worship swap.
    if (slot >= 0 && cfg.respectSwaps !== false && num(m.swaps) <= 0) return { ok: false, error: 'no worship swaps left' };
    var prevSlot = num(god.slot);
    var swapsBefore = num(m.swaps);
    var displaced = (slot >= 0 && m.slot[slot] >= 0) ? m.godsById[m.slot[slot]] : null;
    var callError = '';
    try { m.slotGod(god, slot); } catch (e) { callError = Bot.errStr(e); }
    var moved = num(god.slot, -1) !== prevSlot || (slot >= 0 && num(m.slot[slot], -1) === num(god.id));
    // Some forks accept the god ID rather than its object; retry only if the
    // first signature had no observable state change, to avoid duplicate moves.
    if (!moved && slot !== prevSlot) {
      try { m.slotGod(god.id, slot); } catch (e2) { callError = Bot.errStr(e2); }
      moved = num(god.slot, -1) !== prevSlot || (slot >= 0 && num(m.slot[slot], -1) === num(god.id));
    }
    if (!moved) {
      pantheonDiag.lastReason = callError || '配置APIがスロット状態を変更しませんでした';
      return { ok: false, error: 'slotGod refused: ' + pantheonDiag.lastReason };
    }
    // The native game may already consume the swap. Only call useSwap when
    // a placement succeeded but the counter did not change in the API itself.
    var swapsConsumed = Math.max(0, swapsBefore - num(m.swaps));
    if (slot >= 0 && cfg.respectSwaps !== false && swapsConsumed === 0 && typeof m.useSwap === 'function') {
      try { m.useSwap(1); swapsConsumed = Math.max(0, swapsBefore - num(m.swaps)); } catch (swapError) { pantheonDiag.lastReason = '配置は成功したがスワップ反映に失敗: ' + Bot.errStr(swapError); }
    }
    G().recalculateGains = 1; G().storeToRefresh = 1;
    if (slot >= 0 && swapsConsumed > 0) Bot.bump('godSwaps', swapsConsumed);
    pantheonDiag.lastAt = Date.now(); pantheonDiag.lastAction = String(god.name || god.key || '') + ' → ' + (slot >= 0 ? (m.slotNames ? m.slotNames[slot] : '#' + slot) : '未配置');
    pantheonDiag.lastReason = slot < 0 ? '神をスロットから外しました' : '配置しました';
    pantheonDiag.moved++;
    Bot.ev('pantheon', 'slot-god', {
      god: String(god.name || god.key || '').replace(/<[^>]+>/g, ''), slot: slot,
      slotName: slot >= 0 ? (m.slotNames ? m.slotNames[slot] : '#' + slot) : 'unslotted',
      displaced: displaced ? String(displaced.name || '').replace(/<[^>]+>/g, '') : null
    }, { swapsBefore: swapsBefore, swapsLeft: num(m.swaps), swapsConsumed: Math.max(0, swapsBefore - num(m.swaps)) });
    return { ok: true, slot: slot, swapsLeft: num(m.swaps) };
  };

  function modPantheon() {
    var m = TP(); if (!m) { pantheonDiag.lastReason = '神殿ミニゲームが未ロード'; return; }
    if (!Bot.cfg.master) { pantheonDiag.lastReason = 'BOT全体が停止中'; return; }
    if (!Bot.cfg.pantheon.enabled) { pantheonDiag.lastReason = 'パンテオンモジュールが無効'; return; }
    if (!Bot.cfg.pantheon.autoSlot) { pantheonDiag.lastReason = '自動配置がOFF'; return; }
    var g = G();
    if (g.OnAscend || g.AscendTimer > 0) { pantheonDiag.lastReason = '転生処理中のため待機'; return; }
    var loadout = Bot.cfg.pantheon.loadout || [];
    if (!loadout.length) { pantheonDiag.lastReason = '配置ロードアウトが空です'; return; }
    var complete = loadout.every(function (want, slot) { var gd = findGod(m, want); return !want || (gd && num(gd.slot) === slot); });
    if (complete) { pantheonDiag.lastReason = '指定ロードアウトは配置済み'; return; }
    if (num(m.swaps) <= 0 && Bot.cfg.pantheon.respectSwaps !== false) { pantheonDiag.lastReason = '礼拝スワップ待ち（次の回復まで ' + Math.ceil(Bot.pantheonState().swapInSec / 60) + ' 分）'; return; }
    if (Bot._lastGodSwapAt && Date.now() - Bot._lastGodSwapAt < 2500) { pantheonDiag.lastReason = '配置間隔の待機中'; return; }

    // One placement per pass, but check often enough to fill the rest of the
    // configured loadout without looking stalled for 20 seconds each time.
    for (var slot = 0; slot < 3; slot++) {
      var want = loadout[slot];
      if (!want) continue;
      var god = findGod(m, want);
      if (!god) { pantheonDiag.lastReason = '指定された神が見つかりません: ' + want; continue; }
      if (num(god.slot) === slot) continue;
      var r = Bot.slotGod(want, slot);
      if (r.ok) { Bot._lastGodSwapAt = Date.now(); return; }
      pantheonDiag.lastReason = r.error || '配置に失敗しました';
    }
  }
  Bot.modPantheon = modPantheon;

  /* ================================================================== */
  /* 魔法書 (Grimoire)                                                    */
  /* ================================================================== */
  Bot.grimoireState = function () {
    var m = WP();
    if (!m) return { ready: false, level: num((Bot.findBuilding('Wizard tower') || {}).level) };
    var out = {
      ready: true, level: num(m.parent.level), magic: +num(m.magic).toFixed(2),
      magicM: +num(m.magicM).toFixed(2), spellsCast: num(m.spellsCast),
      spellsCastTotal: num(m.spellsCastTotal), backfires: num(Bot.stats && Bot.stats.spellsFailed),
      lastSpell: grimoireDiag.lastSpell, lastResult: grimoireDiag.lastResult, lastAt: grimoireDiag.lastAt, automaticCasts: grimoireDiag.casts, failures: grimoireDiag.failures, spells: []
    };
    for (var i = 0; i < m.spellsById.length; i++) {
      var sp = m.spellsById[i];
      var cost = 0; try { cost = m.getSpellCost(sp); } catch (e) { }
      var fail = 0; try { fail = m.getFailChance(sp); } catch (e) { }
      out.spells.push({
        id: i, key: sp.key || '', name: sp.name || '', cost: cost, costMin: num(sp.costMin),
        costPercent: num(sp.costPercent), failChance: +num(fail).toFixed(4),
        castable: num(m.magic) >= cost
      });
    }
    return out;
  };

  function findSpell(m, want) {
    if (!m) return null;
    if (typeof want === 'number') return m.spellsById[want] || null;
    if (!want) return null;
    var key = String(want).toLowerCase();
    for (var i = 0; i < m.spellsById.length; i++) {
      var sp = m.spellsById[i];
      if (String(sp.key || '').toLowerCase() === key) return sp;
      if (String(sp.name || '').toLowerCase() === key) return sp;
      if (String(sp.name || '').toLowerCase().indexOf(key) !== -1) return sp;
    }
    if (m.spells && m.spells[want]) return m.spells[want];
    return null;
  }
  Bot.findSpell = findSpell;

  Bot.castSpell = function (want, silent) {
    var m = WP(); if (!m) return { ok: false, error: 'grimoire not ready' };
    var sp = findSpell(m, want);
    if (!sp) return { ok: false, error: 'unknown spell: ' + want };
    var cost = 0; try { cost = m.getSpellCost(sp); } catch (e) { cost = num(sp.costMin); }
    var failChance = 0; try { failChance = m.getFailChance(sp); } catch (e) { }
    if (num(m.magic) < cost) return { ok: false, error: 'not enough magic', magic: num(m.magic), cost: cost };
    if (!Bot.cfg.grimoire.allowBackfire && failChance > 0.5) return { ok: false, error: 'backfire chance too high' };
    var g = G();
    var beforeC = num(g.cookies), beforeM = num(m.magic), beforeCast = num(m.spellsCastTotal);
    var res = null;
    try { res = m.castSpell(sp); } catch (e) { grimoireDiag.lastSpell = sp.name || sp.key; grimoireDiag.lastResult = Bot.errStr(e); grimoireDiag.lastAt = Date.now(); grimoireDiag.failures++; return { ok: false, error: Bot.errStr(e) }; }
    var cast = num(m.spellsCastTotal) > beforeCast;
    if (!cast) { grimoireDiag.lastSpell = sp.name || sp.key; grimoireDiag.lastResult = 'cast failed: no cast counter change'; grimoireDiag.lastAt = Date.now(); grimoireDiag.failures++; return { ok: false, error: 'cast failed' }; }
    var failed = res === 0 || res === false;
    var gain = num(g.cookies) - beforeC;
    grimoireDiag.lastSpell = sp.name || sp.key; grimoireDiag.lastResult = failed ? 'backfire' : 'success'; grimoireDiag.lastAt = Date.now(); grimoireDiag.casts++; if (failed) grimoireDiag.failures++;
    if (failed) Bot.bump('spellsFailed', 1); else Bot.bump('spellsCast', 1);
    if (!silent) {
      Bot.ev('grimoire', 'cast', {
        spell: sp.name || sp.key, cost: cost, magicLeft: +num(m.magic).toFixed(2),
        backfire: failed ? 1 : 0, failChance: +failChance.toFixed(3)
      }, { cookieDelta: gain, cookieDeltaStr: fmt(gain) });
    }
    return { ok: true, backfire: !!failed, gain: gain, magic: num(m.magic) };
  };

  function modGrimoire() {
    var m = WP(); if (!m) return;
    if (!Bot.cfg.master || !Bot.cfg.grimoire.enabled) return;
    var g = G();
    if (g.OnAscend || g.AscendTimer > 0) return;
    var c = Bot.cfg.grimoire;
    var list = c.spells || [];
    if (!list.length) return;
    var ratio = clamp(num(c.minMagicRatio, 1), 0, 1);
    var reserve = num(c.reserve, 0);
    if (num(m.magic) < num(m.magicM) * ratio) { grimoireDiag.lastResult = '魔力閾値待ち'; return; }

    var available = 0, missing = 0, reserved = 0, risky = 0, failed = 0;
    for (var i = 0; i < list.length; i++) {
      var sp = findSpell(m, list[i]);
      if (!sp) { missing++; continue; }
      var cost = 0; try { cost = m.getSpellCost(sp); } catch (e) { failed++; continue; }
      if (num(m.magic) - cost < reserve) { reserved++; continue; }
      if (!c.allowBackfire) {
        var fc = 0; try { fc = m.getFailChance(sp); } catch (e) { }
        if (fc > 0.5) { risky++; continue; }
      }
      available++;
      var r = Bot.castSpell(list[i]);
      if (r && r.ok) return; // 1 tickにつき1回
      failed++;
    }
    if (!available) {
      grimoireDiag.lastResult = missing === list.length ? '指定呪文が見つからない: 設定名を確認' :
        (risky ? '暴走率が高いため安全設定で待機' : (reserved ? '予約魔力を確保するため待機' : (failed ? '呪文APIが失敗: ログ確認' : '使用可能な呪文がない')));
    } else if (failed) grimoireDiag.lastResult = '呪文APIが失敗: ログ確認';
  }
  Bot.modGrimoire = modGrimoire;

  /* ------------------------------------------------------------------ */
  Bot.every('pantheon', 3000, modPantheon);
  Bot.every('grimoire', 4000, modGrimoire);

})(window);
