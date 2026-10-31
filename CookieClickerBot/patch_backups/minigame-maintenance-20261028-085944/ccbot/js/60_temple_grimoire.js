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

  /* ================================================================== */
  /* 神殿 (Pantheon) - 神の配置                                           */
  /* ================================================================== */
  Bot.pantheonState = function () {
    var m = TP();
    if (!m) return { ready: false, level: num((Bot.findBuilding('Temple') || {}).level) };
    var out = {
      ready: true, level: num(m.parent.level), swaps: num(m.swaps), maxSwaps: 3,
      swapInSec: 0, slots: [-1, -1, -1], slotNames: ['Diamond', 'Ruby', 'Jade'], gods: []
    };
    try {
      var t = 1000 * 60 * 60;
      if (num(m.swaps) === 0) t = 1000 * 60 * 60 * 16;
      else if (num(m.swaps) === 1) t = 1000 * 60 * 60 * 4;
      out.swapInSec = Math.max(0, (num(m.swapT, Date.now()) + t - Date.now()) / 1000);
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
    if (!want) return null;
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
    if (cfg.respectSwaps !== false && num(m.swaps) <= 0) return { ok: false, error: 'no worship swaps left' };
    var prevSlot = num(god.slot);
    var displaced = (slot >= 0 && m.slot[slot] >= 0) ? m.godsById[m.slot[slot]] : null;
    try { m.slotGod(god, slot); } catch (e) { return { ok: false, error: Bot.errStr(e) }; }
    if (num(god.slot) === prevSlot && slot !== prevSlot) return { ok: false, error: 'slotGod refused' };
    if (cfg.respectSwaps !== false && m.useSwap) { try { m.useSwap(1); } catch (e) { } }
    G().recalculateGains = 1; G().storeToRefresh = 1;
    Bot.bump('godSwaps', 1);
    Bot.ev('pantheon', 'slot-god', {
      god: String(god.name || god.key || '').replace(/<[^>]+>/g, ''), slot: slot,
      slotName: slot >= 0 ? (m.slotNames ? m.slotNames[slot] : '#' + slot) : 'unslotted',
      displaced: displaced ? String(displaced.name || '').replace(/<[^>]+>/g, '') : null
    }, { swapsLeft: num(m.swaps) });
    return { ok: true, slot: slot, swapsLeft: num(m.swaps) };
  };

  function modPantheon() {
    var m = TP(); if (!m) return;
    if (!Bot.cfg.master || !Bot.cfg.pantheon.enabled || !Bot.cfg.pantheon.autoSlot) return;
    var g = G();
    if (g.OnAscend || g.AscendTimer > 0) return;
    var loadout = Bot.cfg.pantheon.loadout || [];
    if (!loadout.length) return;
    if (num(m.swaps) <= 0) return;
    // 連続入れ替えを防ぐクールダウン (ゲーム内部のカウンタには依存しない)
    if (Bot._lastGodSwapAt && Date.now() - Bot._lastGodSwapAt < 2500) return;

    for (var slot = 0; slot < 3; slot++) {
      var want = loadout[slot];
      if (!want) continue;
      var god = findGod(m, want);
      if (!god) continue;
      if (num(god.slot) === slot) continue;
      if (num(m.swaps) <= 0) break;
      var r = Bot.slotGod(want, slot);
      if (r.ok) Bot._lastGodSwapAt = Date.now();   // スワップが続く限り続けて配置する
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
      spellsCastTotal: num(m.spellsCastTotal), backfires: num(m.spellsCastTotal ? 0 : 0), spells: []
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
    try { res = m.castSpell(sp); } catch (e) { return { ok: false, error: Bot.errStr(e) }; }
    var cast = num(m.spellsCastTotal) > beforeCast;
    if (!cast) return { ok: false, error: 'cast failed' };
    var failed = res === 0 || res === false;
    var gain = num(g.cookies) - beforeC;
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
    if (num(m.magic) < num(m.magicM) * ratio) return;

    for (var i = 0; i < list.length; i++) {
      var sp = findSpell(m, list[i]);
      if (!sp) continue;
      var cost = 0; try { cost = m.getSpellCost(sp); } catch (e) { continue; }
      if (num(m.magic) - cost < reserve) continue;
      if (!c.allowBackfire) {
        var fc = 0; try { fc = m.getFailChance(sp); } catch (e) { }
        if (fc > 0.5) continue;
      }
      var r = Bot.castSpell(list[i]);
      if (r && r.ok) break;      // 1tickにつき1回
    }
  }
  Bot.modGrimoire = modGrimoire;

  /* ------------------------------------------------------------------ */
  Bot.every('pantheon', 20000, modPantheon);
  Bot.every('grimoire', 4000, modGrimoire);

})(window);
