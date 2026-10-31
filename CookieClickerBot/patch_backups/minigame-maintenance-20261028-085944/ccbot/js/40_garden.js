/* =====================================================================
   Cookie Clicker Bot - in-page engine : GARDEN (農業)
   - 自動植栽 / 自動収穫 / 土壌切替 / 雑草除去 / 種フルコンプ / 砂糖ランプ農園
   ===================================================================== */
(function (global) {
  'use strict';
  var Bot = global.__CCBOT;
  if (!Bot) return;
  var G = Bot.exported.G, num = Bot.exported.num, fmt = Bot.exported.fmt, clamp = Bot.exported.clamp;

  /* ------------------------------------------------------------------ */
  /* 変異テーブル (minigameGarden.js の M.getMuts から抽出)                 */
  /*   要件: { 植物key: [隣接总数の最小値, 隣接する成熟数の最小値] }          */
  /* ------------------------------------------------------------------ */
  var RECIPES = {
    thumbcorn:      { bakerWheat: [0, 2] },
    cronerice:      { bakerWheat: [0, 1], thumbcorn: [0, 1] },
    bakeberry:      { bakerWheat: [0, 2] },
    gildmillet:     { cronerice: [0, 1], thumbcorn: [0, 1] },
    clover:         { bakerWheat: [0, 1], gildmillet: [0, 1] },
    goldenClover:   { clover: [0, 4] },
    shimmerlily:    { clover: [0, 1], gildmillet: [0, 1] },
    chocoroot:      { bakerWheat: [0, 1], brownMold: [1, 0] },
    whiteChocoroot: { chocoroot: [0, 1], whiteMildew: [1, 0] },
    brownMold:      { whiteMildew: [0, 1] },
    whiteMildew:    { brownMold: [0, 1] },
    whiskerbloom:   { shimmerlily: [0, 1], whiteChocoroot: [0, 1] },
    chimerose:      { shimmerlily: [0, 1], whiskerbloom: [0, 1] },
    nursetulip:     { whiskerbloom: [0, 2] },
    drowsyfern:     { chocoroot: [0, 1], keenmoss: [0, 1] },
    wardlichen:     { cronerice: [0, 1], keenmoss: [0, 1] },
    keenmoss:       { greenRot: [0, 1], brownMold: [0, 1] },
    greenRot:       { whiteMildew: [0, 1], clover: [0, 1] },
    queenbeet:      { chocoroot: [0, 1], bakeberry: [0, 1] },
    duketater:      { queenbeet: [0, 2] },
    queenbeetLump:  { queenbeet: [0, 8] },
    crumbspore:     { crumbspore: [0, 1] },
    glovemorel:     { crumbspore: [0, 1], thumbcorn: [0, 1] },
    cheapcap:       { crumbspore: [0, 1], shimmerlily: [0, 1] },
    foolBolete:     { doughshroom: [0, 1], greenRot: [0, 1] },
    doughshroom:    { crumbspore: [0, 2] },
    wrinklegill:    { crumbspore: [0, 1], brownMold: [0, 1] },
    elderwort:      { shimmerlily: [0, 1], cronerice: [0, 1] },
    shriekbulb:     { wrinklegill: [0, 1], elderwort: [0, 1] },
    tidygrass:      { bakerWheat: [0, 1], whiteChocoroot: [0, 1] },
    everdaisy:      { tidygrass: [0, 3], elderwort: [0, 3] },
    ichorpuff:      { elderwort: [0, 1], crumbspore: [0, 1] },
    /* 特殊 : 自然発生 / 引き抜き時のドロップ */
    meddleweed:     { __special: 'spawn' },
    __meddleweedDrop_brownMold: { __special: 'kill' },
    __meddleweedDrop_crumbspore: { __special: 'kill' }
  };
  Bot.GARDEN_RECIPES = RECIPES;

  /* 雑草・菌類 (放置すると畑を汚す) */
  var WEEDS = { meddleweed: 1, whiteMildew: 1, brownMold: 1, crumbspore: 1, doughshroom: 1 };
  /* 収穫すると得する植物 */
  var HARVEST_WORTH = {
    bakeberry: 'cookies', chocoroot: 'cookies', whiteChocoroot: 'cookies', queenbeet: 'cookies',
    duketater: 'cookies', queenbeetLump: 'lump', crumbspore: 'explode', doughshroom: 'explode',
    bakerWheat: 'drop', elderwort: 'drop', drowsyfern: 'drop', greenRot: 'drop', ichorpuff: 'drop'
  };
  Bot.GARDEN_WEEDS = WEEDS;
  Bot.GARDEN_HARVEST_WORTH = HARVEST_WORTH;

  var SOIL_REQ = { dirt: 0, fertilizer: 50, clay: 100, pebbles: 200, woodchips: 300 };

  /* ------------------------------------------------------------------ */
  function M() { return Bot.minigame('Farm'); }
  Bot.gardenM = M;

  function plantByKey(key) {
    var m = M(); if (!m) return null;
    return m.plants[key] || null;
  }

  function tileKey(x, y) { return x + ',' + y; }

  function unlockedTiles(m) {
    var out = [];
    for (var y = 0; y < 6; y++) for (var x = 0; x < 6; x++) {
      if (m.isTileUnlocked(x, y)) out.push({ x: x, y: y });
    }
    return out;
  }

  function readPlot(m) {
    var tiles = unlockedTiles(m);
    var out = [];
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var raw = m.plot[t.y][t.x];
      var id = raw[0], age = raw[1];
      var p = id >= 1 ? m.plantsById[id - 1] : null;
      out.push({
        x: t.x, y: t.y, empty: !p, key: p ? p.key : null, name: p ? p.name : null,
        age: age, mature: p ? (age >= p.mature) : false, immortal: !!(p && p.immortal),
        weed: !!(p && WEEDS[p.key])
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 状態取得                                                             */
  /* ------------------------------------------------------------------ */
  Bot.gardenBrief = function () {
    var m = M();
    if (!m) return { ready: false, level: num((Bot.findBuilding('Farm') || {}).level) };
    return {
      ready: true, level: num(m.parent.level), farms: num(m.parent.amount),
      unlocked: num(m.plantsUnlockedN), total: num(m.plantsN),
      soil: m.soilsById && m.soilsById[m.soil] ? m.soilsById[m.soil].key : '',
      freeze: !!m.freeze, stepT: num(m.stepT),
      nextStepIn: Math.max(0, (num(m.nextStep, Date.now()) - Date.now()) / 1000),
      harvests: num(m.harvestsTotal), plants: countPlants(m)
    };
  };

  function countPlants(m) {
    var n = 0;
    for (var y = 0; y < 6; y++) for (var x = 0; x < 6; x++) if (m.plot[y] && m.plot[y][x] && m.plot[y][x][0] >= 1) n++;
    return n;
  }

  Bot.gardenState = function () {
    var m = M();
    var brief = Bot.gardenBrief();
    if (!m) return brief;
    brief.plot = readPlot(m);
    brief.seeds = [];
    for (var i = 0; i < m.plantsById.length; i++) {
      var p = m.plantsById[i];
      var cost = 0; try { cost = m.getCost(p); } catch (e) { }
      brief.seeds.push({
        key: p.key, name: p.name, id: p.id, unlocked: !!p.unlocked, plantable: p.plantable !== false,
        mature: p.mature, cost: cost, costStr: fmt(cost), weed: !!WEEDS[p.key],
        worth: HARVEST_WORTH[p.key] || '', missing: !p.unlocked ? (RECIPES[p.key] ? true : false) : false
      });
    }
    brief.soils = [];
    for (var k in m.soils) {
      var s = m.soils[k];
      brief.soils.push({ key: s.key, name: s.name, id: s.id, tick: s.tick, req: s.req, effMult: s.effMult, weedMult: s.weedMult, available: num(m.parent.amount) >= s.req });
    }
    brief.missingSeeds = missingSeeds(m);
    brief.plan = Bot._gp ? { target: Bot._gp.target, phase: Bot._gp.phase, since: Bot._gp.since, attempts: Bot._gp.attempts, reserved: Object.keys(Bot._gp.reserved || {}).length } : null;
    return brief;
  };

  function missingSeeds(m) {
    var out = [];
    for (var i = 0; i < m.plantsById.length; i++) {
      var p = m.plantsById[i];
      if (!p.unlocked) out.push(p.key);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 基本操作                                                             */
  /* ------------------------------------------------------------------ */
  Bot.gardenHarvestAt = function (x, y, reason) {
    var m = M(); if (!m) return false;
    var raw = m.plot[y] && m.plot[y][x];
    if (!raw || raw[0] < 1) return false;
    var p = m.plantsById[raw[0] - 1];
    var age = raw[1], mature = age >= p.mature;
    var before = num(G().cookies), beforeL = num(G().lumps);
    var ok = false;
    try { ok = m.harvest(x, y, 1); } catch (e) { ok = false; }
    if (!ok) return false;
    Bot.bump('gardenHarvests', 1);
    var gained = num(G().cookies) - before;
    var lumps = num(G().lumps) - beforeL;
    Bot.ev('garden', 'harvest', { x: x, y: y, plant: p.key, age: Math.round(age), mature: mature ? 1 : 0, reason: reason || '' },
      { cookies: gained, cookiesStr: fmt(Math.max(0, gained)), lumps: lumps });
    return true;
  };

  Bot.gardenPlantAt = function (key, x, y, reason) {
    var m = M(); if (!m) return false;
    var p = plantByKey(key);
    if (!p) return false;
    if (!p.unlocked) return false;
    if (p.plantable === false) return false;
    if (!m.isTileUnlocked(x, y)) return false;
    if (m.plot[y][x][0] >= 1) return false;      // 既存株は上書きしない
    var cost = 0; try { cost = m.getCost(p); } catch (e) { cost = 0; }
    if (num(G().cookies) < cost) return false;
    var ok = false;
    try { ok = m.useTool(p.id, x, y); } catch (e) { ok = false; }
    if (!ok) return false;
    if (m.plot[y][x][0] !== p.id + 1) return false;
    m.toCompute = true; m.toRebuild = true;
    Bot.bump('gardenPlants', 1);
    Bot.ev('garden', 'plant', { x: x, y: y, plant: p.key, reason: reason || '' }, { cost: cost, costStr: fmt(cost) });
    return true;
  };

  Bot.gardenHarvestAll = function (matureOnly, onlyKeys) {
    var m = M(); if (!m) return { count: 0 };
    var tiles = readPlot(m), n = 0;
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (t.empty) continue;
      if (matureOnly && !t.mature) continue;
      if (onlyKeys && onlyKeys.length && onlyKeys.indexOf(t.key) === -1) continue;
      if (Bot.gardenHarvestAt(t.x, t.y, matureOnly ? 'mature-all' : 'all')) n++;
    }
    return { count: n };
  };

  Bot.gardenSetSoil = function (key) {
    var m = M(); if (!m || !key) return false;
    var target = null;
    for (var k in m.soils) if (m.soils[k].key === key) target = m.soils[k];
    if (!target) return false;
    if (num(m.soil) === target.id) return false;
    if (num(m.parent.amount) < target.req) return false;
    if (num(m.nextSoil, 0) > Date.now()) return false;
    if (m.freeze) return false;
    m.soil = target.id;
    m.nextSoil = Date.now() + (G().Has && G().Has('Turbo-charged soil') ? 1 : 1000 * 60 * 10);
    if (m.computeStepT) m.computeStepT();
    m.toCompute = true;
    Bot.ev('garden', 'soil', { soil: target.key, name: target.name }, { tickMin: target.tick });
    return true;
  };

  Bot.gardenSetFreeze = function (on) {
    var m = M(); if (!m) return false;
    m.freeze = on ? 1 : 0;
    Bot.ev('garden', 'freeze', { on: !!on });
    return true;
  };

  Bot.gardenConvert = function () {
    var m = M(); if (!m) return false;
    if (num(m.plantsUnlockedN) < num(m.plantsN)) return false;
    var before = num(G().lumps);
    try { m.convert(); } catch (e) { return false; }
    Bot.ev('garden', 'convert', {}, { lumpsGained: num(G().lumps) - before });
    return true;
  };

  /* ------------------------------------------------------------------ */
  /* 種フルコンプ計画                                                     */
  /* ------------------------------------------------------------------ */
  var GP = Bot._gp = { target: null, phase: 'idle', since: 0, attempts: 0, reserved: {}, center: null, need: null };

  function planOrder(m) {
    // 依存関係から解锁順を決定する
    var unlocked = {};
    for (var i = 0; i < m.plantsById.length; i++) if (m.plantsById[i].unlocked) unlocked[m.plantsById[i].key] = 1;
    unlocked.bakerWheat = 1;                      // 初期状態
    var order = [], guard = 0;
    var missing = missingSeeds(m);
    while (missing.length && guard++ < 200) {
      var progressed = false;
      for (var k = 0; k < missing.length; k++) {
        var key = missing[k];
        if (depsReady(key, unlocked)) {
          order.push(key);
          unlocked[key] = 1;
          missing.splice(k, 1);
          progressed = true;
          break;
        }
      }
      if (!progressed) {
        // 依存を満たせないものは後回し (自然発生待ち)
        for (var q = 0; q < missing.length; q++) { order.push(missing[q]); unlocked[missing[q]] = 1; }
        break;
      }
    }
    return order;
  }

  function depsReady(key, unlocked) {
    var r = RECIPES[key];
    if (!r) return true;                                  // 未知 = とりあえず試す
    if (r.__special === 'spawn') return true;             // meddleweed は自然発生
    if (r.__special === 'kill') return !!unlocked.meddleweed;
    for (var d in r) {
      if (d === '__special') continue;
      if (!unlocked[d]) return false;
    }
    return true;
  }
  Bot.gardenPlanOrder = function () { var m = M(); return m ? planOrder(m) : []; };

  function clearReservation() { GP.target = null; GP.phase = 'idle'; GP.center = null; GP.need = null; GP.reserved = {}; }

  // 変異で目的の植物が生えた場合、その植物は mature になるまで保護する。
  // Cookie Clicker は成熟した植物を収穫して初めて種を解放するため、
  // 「中心マスを空ける」処理より前に検出して、成熟後に収穫する必要がある。
  function findPlantOnPlot(m, key) {
    for (var y = 0; y < 6; y++) for (var x = 0; x < 6; x++) {
      if (!m.isTileUnlocked(x, y)) continue;
      var raw = m.plot[y] && m.plot[y][x];
      if (!raw || raw[0] < 1) continue;
      var p = m.plantsById[raw[0] - 1];
      if (p && p.key === key) return { x: x, y: y, age: num(raw[1]), plant: p };
    }
    return null;
  }

  function protectAndHarvestTarget(m) {
    if (!GP.target) return false;
    var target = plantByKey(GP.target);
    if (!target || target.unlocked) return false;
    var crop = findPlantOnPlot(m, GP.target);
    if (!crop) return false;

    var nextPhase = crop.age >= num(target.mature) ? 'harvesting-target' : 'waiting-target-mature';
    if (GP.phase !== nextPhase) {
      Bot.ev('garden', nextPhase === 'harvesting-target' ? 'target-mature' : 'target-growing',
        { seed: GP.target, x: crop.x, y: crop.y, age: Math.round(crop.age), matureAt: num(target.mature) }, {});
    }
    GP.phase = nextPhase;
    GP.center = { x: crop.x, y: crop.y };
    // WEEDS に含まれる種（brownMold / whiteMildew / meddleweed 等）でも、
    // 狙いの植物を weedControl が刈り取らないように予約する。
    GP.reserved[tileKey(crop.x, crop.y)] = 'target-crop';

    if (crop.age < num(target.mature)) return true;

    if (Bot.gardenHarvestAt(crop.x, crop.y, 'unlock-seed:' + GP.target)) {
      Bot.ev('garden', 'target-seed-harvested',
        { seed: GP.target, x: crop.x, y: crop.y, age: Math.round(crop.age) }, {});
      GP.phase = 'waiting-seed-unlock';
    } else if (GP.phase !== 'harvest-blocked') {
      GP.phase = 'harvest-blocked';
      Bot.ev('garden', 'target-harvest-blocked',
        { seed: GP.target, x: crop.x, y: crop.y, age: Math.round(crop.age) }, {});
    }
    return true;
  }

  function chooseMutationSpot(m, needCount) {
    // 空きタイルのうち、周囲に必要数だけの空き(=後で植え替える)がある場所を探す
    var tiles = unlockedTiles(m);
    var best = null, bestScore = -1;
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (m.plot[t.y][t.x][0] >= 1) continue;             // 中心は空きであること
      var free = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = t.x + dx, ny = t.y + dy;
        if (!m.isTileUnlocked(nx, ny)) continue;
        free++;
      }
      var score = free;
      if (free >= needCount && score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  function gardenUnlockStep(m) {
    var missing = missingSeeds(m);
    if (!missing.length) {
      if (GP.phase !== 'idle') { Bot.ev('garden', 'unlock-complete', {}, { seeds: num(m.plantsUnlockedN) }); clearReservation(); }
      return false;
    }
    var order = planOrder(m);
    if (!order.length) return false;

    // 現在対象が解锁されたら次へ
    if (GP.target) {
      var tp = plantByKey(GP.target);
      if (tp && tp.unlocked) {
        Bot.ev('garden', 'seed-unlocked', { seed: GP.target, via: GP.phase }, { remaining: missing.length - 1 });
        Bot.bump('seedsUnlocked', 1);
        clearReservation();
      } else if (protectAndHarvestTarget(m)) {
        // 目的の植物が発生済み。成熟するまで配置変更・草刈り・タイムアウトをしない。
        return true;
      } else if (Date.now() - GP.since > 45 * 60 * 1000) {
        Bot.ev('garden', 'unlock-timeout', { seed: GP.target, attempts: GP.attempts }, {});
        GP.attempts++;
        clearReservation();
      }
    }
    if (!GP.target) {
      // 対象を選ぶ
      for (var i = 0; i < order.length; i++) {
        if (missing.indexOf(order[i]) !== -1) { GP.target = order[i]; break; }
      }
      if (!GP.target) GP.target = missing[0];
      GP.phase = 'start'; GP.since = Date.now(); GP.attempts = 0; GP.reserved = {};
      Bot.ev('garden', 'unlock-start', { seed: GP.target, recipe: RECIPES[GP.target] ? Object.keys(RECIPES[GP.target]) : [] });
    }

    // ページ再読込などで計画状態が失われた場合も、既に生えている目的の植物を拾う。
    if (protectAndHarvestTarget(m)) return true;

    var rec = RECIPES[GP.target] || {};

    /* --- 特殊: meddleweed (孤立した空きタイルに自然発生) --- */
    if (rec.__special === 'spawn') {
      GP.phase = 'waiting-spawn';
      var tiles = unlockedTiles(m);
      // 隣接する全タイルが空きの場所を1つ確保する
      for (var s = 0; s < tiles.length; s++) {
        var t = tiles[s];
        var isolated = true;
        for (var dy = -1; dy <= 1 && isolated; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = t.x + dx, ny = t.y + dy;
          if (!m.isTileUnlocked(nx, ny)) continue;
          if (m.plot[ny][nx][0] >= 1) { isolated = false; break; }
        }
        if (isolated) { GP.center = { x: t.x, y: t.y }; GP.reserved[tileKey(t.x, t.y)] = 'spawn'; break; }
      }
      if (!GP.center) {
        // 空きが無い → 隅のエリアを空ける
        var corner = tiles[0];
        for (var c = 0; c < tiles.length; c++) {
          if (m.plot[tiles[c].y][tiles[c].x][0] >= 1) Bot.gardenHarvestAt(tiles[c].x, tiles[c].y, 'clear-for-meddleweed');
        }
        GP.center = corner;
      }
      return true;
    }

    /* --- 特殊: meddleweed を引き抜いて brownMold / crumbspore を狙う --- */
    if (rec.__special === 'kill') {
      GP.phase = 'waiting-kill';
      // 成熟meddleweed を探して引き抜く (age が大きいほどドロップ率が高い)
      var plot = readPlot(m);
      var cand = null;
      for (var pi = 0; pi < plot.length; pi++) {
        if (plot[pi].key === 'meddleweed' && plot[pi].age >= 80) { cand = plot[pi]; break; }
      }
      if (cand) {
        Bot.gardenHarvestAt(cand.x, cand.y, 'meddleweed-drop');
        return true;
      }
      // meddleweed を植えて育てる
      var md = plantByKey('meddleweed');
      if (md && md.unlocked) {
        var empt = emptyUnreserved(m);
        for (var ei = 0; ei < empt.length && ei < 2; ei++) Bot.gardenPlantAt('meddleweed', empt[ei].x, empt[ei].y, 'grow-for-drop');
      }
      return true;
    }

    /* --- 通常の変異 --- */
    var need = [];
    for (var d in rec) { if (d === '__special') continue; need.push({ key: d, total: rec[d][0], mature: rec[d][1] }); }
    var needCount = 0;
    for (var ni = 0; ni < need.length; ni++) needCount = Math.max(needCount, need[ni].total, need[ni].mature);
    // queenbeetLump のような 8 近傍要件は 8 タイル必要
    var sumReq = 0;
    for (ni = 0; ni < need.length; ni++) sumReq = Math.max(sumReq, need[ni].mature || need[ni].total);

    if (!GP.center) {
      var spot = chooseMutationSpot(m, Math.max(1, sumReq));
      if (!spot) { GP.phase = 'no-space'; return true; }
      GP.center = spot;
      GP.reserved[tileKey(spot.x, spot.y)] = 'target';
      GP.since = Date.now();
      GP.phase = 'planting';
      Bot.ev('garden', 'unlock-spot', { seed: GP.target, x: spot.x, y: spot.y, need: need });
    }

    // 周囲に必要株を配置する
    var slots = [];
    for (var ddy = -1; ddy <= 1; ddy++) for (var ddx = -1; ddx <= 1; ddx++) {
      if (!ddx && !ddy) continue;
      var ax = GP.center.x + ddx, ay = GP.center.y + ddy;
      if (!m.isTileUnlocked(ax, ay)) continue;
      slots.push({ x: ax, y: ay });
    }
    for (var si = 0; si < slots.length; si++) GP.reserved[tileKey(slots[si].x, slots[si].y)] = 'helper';

    // 必要数の集計
    var have = {};
    for (si = 0; si < slots.length; si++) {
      var raw = m.plot[slots[si].y][slots[si].x];
      if (raw[0] >= 1) {
        var pp = m.plantsById[raw[0] - 1];
        if (!have[pp.key]) have[pp.key] = { total: 0, mature: 0, tiles: [] };
        have[pp.key].total++;
        if (raw[1] >= pp.mature) have[pp.key].mature++;
        have[pp.key].tiles.push(slots[si]);
      }
    }
    // 余計な株は撤去
    for (si = 0; si < slots.length; si++) {
      var r2 = m.plot[slots[si].y][slots[si].x];
      if (r2[0] >= 1) {
        var p2 = m.plantsById[r2[0] - 1];
        var wanted = false;
        for (ni = 0; ni < need.length; ni++) if (need[ni].key === p2.key) wanted = true;
        if (!wanted) Bot.gardenHarvestAt(slots[si].x, slots[si].y, 'clear-helper-slot');
      }
    }
    // 必要な株を植える
    for (ni = 0; ni < need.length; ni++) {
      var nk = need[ni].key;
      var want = Math.max(need[ni].total, need[ni].mature);
      var got = have[nk] ? have[nk].total : 0;
      for (var add = got; add < want; add++) {
        // 空きスロットを探す
        var placed = false;
        for (si = 0; si < slots.length && !placed; si++) {
          if (m.plot[slots[si].y][slots[si].x][0] >= 1) continue;
          if (Bot.gardenPlantAt(nk, slots[si].x, slots[si].y, 'unlock:' + GP.target)) placed = true;
        }
        if (!placed) break;
      }
    }
    // 中心マスに目的の植物が発生していた場合は上の protectAndHarvestTarget が先に
    // 処理する。目的以外の植物だけを除去し、変異直後の目的植物は絶対に刈らない。
    var centerRaw = m.plot[GP.center.y] && m.plot[GP.center.y][GP.center.x];
    if (centerRaw && centerRaw[0] >= 1) {
      var centerPlant = m.plantsById[centerRaw[0] - 1];
      if (!centerPlant || centerPlant.key !== GP.target) {
        Bot.gardenHarvestAt(GP.center.x, GP.center.y, 'clear-non-target-center');
      }
    }

    GP.phase = 'waiting-mutation';
    return true;
  }

  function emptyUnreserved(m) {
    var tiles = unlockedTiles(m), out = [];
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (m.plot[t.y][t.x][0] >= 1) continue;
      if (GP.reserved[tileKey(t.x, t.y)]) continue;
      out.push(t);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* ランプ農園 (queenbeet 8株で中央に queenbeetLump を変異させる)          */
  /* ------------------------------------------------------------------ */
  function lumpFarmStep(m) {
    var qb = plantByKey('queenbeet');
    if (!qb || !qb.unlocked) return false;
    if (!m.plants['queenbeetLump']) return false;

    // 3x3 の塊を複数作る (中心は空き)
    var tiles = unlockedTiles(m);
    var centers = [];
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var ok = true, n = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = t.x + dx, ny = t.y + dy;
        if (!m.isTileUnlocked(nx, ny)) { ok = false; break; }
        n++;
      }
      if (ok && n === 8) centers.push(t);
    }
    if (!centers.length) return false;

    var acted = 0;
    var used = {};
    for (var ci = 0; ci < centers.length; ci++) {
      var c = centers[ci];
      var conflict = false;
      for (var dy2 = -1; dy2 <= 1; dy2++) for (var dx2 = -1; dx2 <= 1; dx2++) {
        if (used[tileKey(c.x + dx2, c.y + dy2)]) conflict = true;
      }
      if (conflict) continue;
      for (dy2 = -1; dy2 <= 1; dy2++) for (dx2 = -1; dx2 <= 1; dx2++) used[tileKey(c.x + dx2, c.y + dy2)] = 1;

      // 周囲8マスに queenbeet
      for (dy2 = -1; dy2 <= 1; dy2++) for (dx2 = -1; dx2 <= 1; dx2++) {
        if (!dx2 && !dy2) continue;
        var px = c.x + dx2, py = c.y + dy2;
        var raw = m.plot[py][px];
        if (raw[0] < 1) { if (Bot.gardenPlantAt('queenbeet', px, py, 'lumpfarm')) acted++; }
        else {
          var pp = m.plantsById[raw[0] - 1];
          // queenbeet 以外は撤去して植え直す。queenbeet 自体は age100 で自然に枯れるので
          // 待ってから植え直したほうが植栽コスト(=CpSの90分)を節約できる。
          if (pp.key !== 'queenbeet') {
            Bot.gardenHarvestAt(px, py, 'lumpfarm-clear');
            if (Bot.gardenPlantAt('queenbeet', px, py, 'lumpfarm')) acted++;
          }
        }
      }
      // 中央 : queenbeetLump が生えていたら成熟を待つ
      var mid = m.plot[c.y][c.x];
      if (mid[0] >= 1) {
        var mp = m.plantsById[mid[0] - 1];
        if (mp.key === 'queenbeetLump') {
          if (mid[1] >= mp.mature) { Bot.gardenHarvestAt(c.x, c.y, 'sugar-lump'); acted++; }
        } else {
          Bot.gardenHarvestAt(c.x, c.y, 'lumpfarm-keep-center-empty'); acted++;
        }
      }
    }
    return acted >= 0;
  }

  /* ------------------------------------------------------------------ */
  /* メインモジュール                                                     */
  /* ------------------------------------------------------------------ */
  function pickSoil(m, mode) {
    var farms = num(m.parent.amount);
    var want;
    if (mode === 'unlock') want = farms >= SOIL_REQ.woodchips ? 'woodchips' : (farms >= SOIL_REQ.fertilizer ? 'fertilizer' : 'dirt');
    else if (mode === 'lumpfarm') want = farms >= SOIL_REQ.fertilizer ? 'fertilizer' : 'dirt';
    else want = farms >= SOIL_REQ.clay ? 'clay' : (farms >= SOIL_REQ.fertilizer ? 'fertilizer' : 'dirt');
    return want;
  }

  function modGarden() {
    var m = M();
    if (!m) return;
    if (!Bot.cfg.master || !Bot.cfg.garden.enabled) return;
    var g = G();
    if (g.OnAscend || g.AscendTimer > 0) return;
    var c = Bot.cfg.garden;

    // 新しく解锁された種を検出してログ
    detectNewSeeds(m);

    var mode = c.mode || 'auto';
    var missing = missingSeeds(m);
    var unlocking = false;

    if (mode === 'off') return;

    if (mode === 'auto' || mode === 'unlock') {
      if (c.unlockAll !== false && missing.length) { unlocking = gardenUnlockStep(m); }
      else if (mode === 'auto') {
        if (c.lumpFarm && plantByKey('queenbeet') && plantByKey('queenbeet').unlocked) mode = 'lumpfarm';
        else mode = 'farm';
      }
    } else if (mode === 'lumpfarm') {
      if (!(plantByKey('queenbeet') && plantByKey('queenbeet').unlocked)) mode = 'farm';
    }

    // 土壌
    var soilCfg = c.soil || 'auto';
    var wantSoil = soilCfg === 'auto' ? pickSoil(m, unlocking ? 'unlock' : (mode === 'lumpfarm' ? 'lumpfarm' : 'farm')) : soilCfg;
    if (wantSoil) Bot.gardenSetSoil(wantSoil);

    if (unlocking && mode !== 'lumpfarm' && mode !== 'farm') {
      // 解锁中は予約エリア以外を掃除する
      if (c.weedControl !== false) weedControl(m, true);
      return;
    }

    if (mode === 'lumpfarm') {
      lumpFarmStep(m);
      if (c.weedControl !== false) weedControl(m, false);
      return;
    }

    /* --- 通常栽培 : farmSeed を枯らさないように維持 --- */
    var seed = c.farmSeed || 'bakerWheat';
    var sp = plantByKey(seed);
    if (!sp || !sp.unlocked) {
      // 代替を探す
      var fallbacks = ['bakerWheat', 'thumbcorn', 'clover', 'chocoroot', 'cronerice'];
      for (var f = 0; f < fallbacks.length; f++) {
        var fp = plantByKey(fallbacks[f]);
        if (fp && fp.unlocked && fp.plantable !== false) { seed = fallbacks[f]; sp = fp; break; }
      }
    }
    if (!sp || !sp.unlocked) return;

    var plot = readPlot(m);
    var harvested = 0, planted = 0;
    var maxPlant = clamp(num(c.maxPlantPerTick, 6), 1, 36);

    for (var i = 0; i < plot.length; i++) {
      var t = plot[i];
      if (t.empty) continue;
      if (t.key === seed) {
        // 収穫価値があるものだけ収穫する
        var worth = HARVEST_WORTH[t.key];
        if (c.harvestMature && t.mature && worth && (worth === 'cookies' || worth === 'lump' || worth === 'explode')) {
          if (Bot.gardenHarvestAt(t.x, t.y, 'mature-reward')) harvested++;
        }
        continue;
      }
      // 雑草は除去する
      if (t.weed && c.weedControl !== false) {
        if (Bot.gardenHarvestAt(t.x, t.y, 'weed')) harvested++;
        continue;
      }
      // 収穫すると得をする植物 (bakeberry / queenbeet / juicy queenbeet など) は
      // 未成熟のうちに刈り取らない。成熟したら収穫し、それ以外は育て続ける。
      var worth2 = HARVEST_WORTH[t.key];
      if (worth2 === 'cookies' || worth2 === 'lump' || worth2 === 'explode') {
        if (t.mature && c.harvestMature) {
          if (Bot.gardenHarvestAt(t.x, t.y, 'bonus-crop')) harvested++;
        }
        continue;
      }
      // 突然変異で生えた「価値のない」植物だけ撤去して作物を植え直す
      if (c.weedControl !== false && harvested + planted < maxPlant) {
        if (Bot.gardenHarvestAt(t.x, t.y, 'clear-for-crop')) harvested++;
      }
    }

    // 空きタイルに植える
    var empt = emptyUnreserved(m);
    for (var e = 0; e < empt.length && planted < maxPlant; e++) {
      if (Bot.gardenPlantAt(seed, empt[e].x, empt[e].y, 'farm')) planted++;
      else break;      // クッキー不足など
    }
  }
  Bot.modGarden = modGarden;

  function weedControl(m, keepPlan) {
    var plot = readPlot(m);
    for (var i = 0; i < plot.length; i++) {
      var t = plot[i];
      if (t.empty || !t.weed) continue;
      if (keepPlan && GP.reserved[tileKey(t.x, t.y)]) continue;
      // meddleweed は drop 狙いで age>=80 のときだけ抜く
      if (t.key === 'meddleweed') {
        if (t.age >= 80 || !keepPlan) Bot.gardenHarvestAt(t.x, t.y, 'weed-control');
        continue;
      }
      Bot.gardenHarvestAt(t.x, t.y, 'weed-control');
    }
  }
  Bot.gardenWeedControl = weedControl;

  var knownSeeds = null;
  function detectNewSeeds(m) {
    var cur = {};
    for (var i = 0; i < m.plantsById.length; i++) {
      var p = m.plantsById[i];
      if (p.unlocked) cur[p.key] = p.name || p.key;
    }
    if (knownSeeds) {
      for (var k in cur) {
        if (!knownSeeds[k]) {
          Bot.bump('seedsUnlocked', 1);
          Bot.ev('garden', 'seed-unlocked', { seed: k, name: cur[k] },
            { unlocked: num(m.plantsUnlockedN), total: num(m.plantsN) });
        }
      }
    }
    knownSeeds = cur;
  }

  /* ------------------------------------------------------------------ */
  Bot.every('garden', 4000, modGarden);

})(window);
