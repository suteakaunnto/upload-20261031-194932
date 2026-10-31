/* =====================================================================
   Cookie Clicker Bot - JS エンジンの統合テスト (Node で実行)
     node tests/run_engine_test.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeMock } = require('./mock_game.js');

const mock = makeMock({ cookies: 1e9, cookiesEarned: 1e9, prestige: 5, heavenlyChips: 0, lumps: 30, levels: { 2: 6, 3: 2, 5: 4, 6: 3, 7: 3 }, unlockSeeds: false });
const { Game, advance, garden, market, pantheon, grim } = mock;

global.window = global;
global.document = { createElement: () => ({ style: {} }) };

// JS バンドルを読み込む (本番と同じく ccbot/js/*.js を辞書順に連結)
const jsDir = path.join(__dirname, '..', 'ccbot', 'js');
const bundle = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
eval(bundle);

const Bot = global.__CCBOT;

/* ---------------- テスト基盤 ---------------- */
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  \x1b[32m✔\x1b[0m ' + label); }
  else { fail++; fails.push(label); console.log('  \x1b[31m✘\x1b[0m ' + label + (extra ? '  -- ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n\x1b[36m== ' + t + ' ==\x1b[0m'); }

const CFG = Bot.getConfig();
CFG.master = true;
CFG.clicker = { enabled: true, cps: 12, direct: false, boostOnFrenzy: true, boostMult: 3, maxPerTick: 2 };
CFG.golden = { enabled: true, popGolden: true, popWrath: true, wrathPopChancePercent: 100, popReindeer: true, popOthers: true }; // Baseline test: guarantee wrath shimmer is collected.
CFG.wrinkler = { enabled: true, popShiny: true, popAboveSucked: 0, keep: 3 };
CFG.upgrade = { enabled: true, reserveCookies: 0, reserveRatio: 0, buyToggles: false, buyTech: true, buyLumpUpgrades: true, maxPerTick: 8, blacklist: [], whitelist: [], grandmapocalypse: 'ignore' };
CFG.building = { enabled: true, strategy: 'payback', reserveCookies: 0, reserveRatio: 0, maxPerTick: 25, maxPaybackSec: 0, ignore: [], measureEveryMs: 0, maxMeasure: 20 };
CFG.lump = { enabled: true, autoHarvest: true, autoLevel: true, reserve: 0, maxLevel: 10, priority: CFG.lump.priority };
CFG.garden = { enabled: true, mode: 'farm', farmSeed: 'bakerWheat', harvestMature: false, soil: 'dirt', unlockAll: false, lumpFarm: false, maxPlantPerTick: 6, weedControl: true };
CFG.market = { enabled: true, buyBelowRatio: 1.5, sellAboveRatio: 0.5, momentum: false, spendRatio: 0.5, minProfitCpsSec: 0, stopLossRatio: 0, minProfitRatio: 0.01, partialSellRatio: 1, maxStockRatio: 1, maxBuyPerTick: 50, minBuyQty: 1, autoBrokers: true, autoOffice: false };
CFG.grimoire = { enabled: true, spells: ['conjure baked goods'], minMagicRatio: 0.5, reserve: 0, allowBackfire: true };
CFG.pantheon = { enabled: true, autoSlot: true, loadout: ['creation', 'scorn', 'order'], respectSwaps: true };
CFG.dragon = { enabled: true, autoTrain: true, aura1: 'Dragon God', aura2: 'Reality Bending' };
CFG.santa = { enabled: true, autoUpgrade: true, maxLevel: 14, maxCostRatio: 1 };
CFG.season = { enabled: false, autoSwitch: false };
CFG.ascend = { enabled: false, backupFirst: false };
CFG.prestige = { enabled: true, strategy: 'priority', reserveChips: 0, maxPerTick: 12, blacklist: [], permanentUpgrades: [], autoAssignPermanent: true, priorityList: [] };
CFG.housekeep = { enabled: true, closePrompts: true, muteSound: true, muteMusic: true, reduceParticles: true, keepAwake: true, autoResume: true, autosaveSec: 60 };
Bot.setConfig(CFG);

/* ---------------- 1. 初期化 ---------------- */
section('1. エンジンの初期化');
ok(!!Bot, '__CCBOT が定義されている');
ok(Bot.ready(), 'ゲームの ready 判定');
// setInterval を待たずに直接 install
Bot.install();
ok(Bot.hookInstalled === true, 'logic フックの登録');
const caps = Bot.run('capabilities');
ok(caps.ok && caps.data.game, 'capabilities の取得', caps);
ok(caps.data.probes['Game.ClickCookie'] && caps.data.probes.garden && caps.data.probes.market &&
   caps.data.probes.pantheon && caps.data.probes.grimoire, '全ミニゲームの検出', caps.data.probes);

/* ---------------- 2. クリッカー ---------------- */
section('2. クリッカー');
let before = Game.cookieClicks;
Game.frame(120);           // 4 秒
ok(Game.cookieClicks > before, 'クリックが発生した (' + (Game.cookieClicks - before) + '回/4秒)', { got: Game.cookieClicks - before });
const cps = (Game.cookieClicks - before) / 4;
ok(cps <= 14.6, 'クリック速度が上限以下 (' + cps.toFixed(1) + '/秒)');
ok(Game.handmadeCookies > 0, 'handmadeCookies が増加');
ok(Game.autoclickerDetected < Game.fps * 5, 'オートクリッカー検出が閾値未満 (' + Game.autoclickerDetected + ')');

/* ---------------- 3. ゴールデンクッキー ---------------- */
section('3. ゴールデンクッキー / トナカイ');
const gc0 = Bot.stats.golden;
Game.spawnShimmer('golden', false);
Game.spawnShimmer('golden', true);
Game.spawnShimmer('reindeer', false);
Game.frame(10);
ok(Bot.stats.golden > gc0, 'ゴールデンを回収 (' + Bot.stats.golden + ')');
ok(Bot.stats.wrath >= 1, 'レイスクッキーを回収 (' + Bot.stats.wrath + ')');
ok(Bot.stats.reindeer >= 1, 'トナカイを回収 (' + Bot.stats.reindeer + ')');
ok(Game.shimmers.length === 0, '画面からシマーが消えた');

/* ---------------- 4. シワシワ ---------------- */
section('4. シワシワおばあちゃん');
Game.spawnWrinkler(6, false);
Game.spawnWrinkler(1, true);
const w0 = Game.wrinklersPopped;
Game.frame(120);
ok(Game.wrinklersPopped > w0, 'シワシワを破裂させた (' + (Game.wrinklersPopped - w0) + '匹)');
let alive = Game.wrinklers.filter(w => w.phase > 0).length;
ok(alive <= 4, '残す匹数を守っている (残り' + alive + ')');

/* ---------------- 5. アップグレード / 施設 ---------------- */
section('5. アップグレードと施設の購入');
function countBought() { let n = 0; for (const k in Game.Upgrades) if (Game.Upgrades[k].bought && Game.Upgrades[k].pool !== 'prestige') n++; return n; }
function namesBought() { return Object.keys(Game.Upgrades).filter(k => Game.Upgrades[k].bought && Game.Upgrades[k].pool !== 'prestige'); }

// 施設購入を止めてアップグレードだけを検証する
CFG.building.enabled = false; Bot.setConfig(CFG);
// 一度リセットして「これから買う」状態にする
Object.keys(Game.Upgrades).forEach(k => { if (Game.Upgrades[k].pool !== 'prestige') Game.Upgrades[k].bought = 0; });
Game.refreshStore();
Game.cookies = 1e12; Game.cookiesEarned = 1e12;
const up0 = countBought();
Game.frame(300);
ok(countBought() > up0, 'アップグレードを購入した (' + up0 + ' -> ' + countBought() + ': ' + namesBought().join(', ') + ')');
ok(Game.UpgradesInStore.every(u => u.pool === 'toggle'), '残りはトグル系(季節)のみ = 意図通り買い控えている',
   Game.UpgradesInStore.map(u => u.name));
ok(namesBought().includes('One mind'), '大惨事系も ignore 設定なら購入する');

// トグルを許可すると買う
CFG.upgrade.buyToggles = true; Bot.setConfig(CFG);
Game.cookies = 1e15;
Game.frame(120);
ok(Game.Upgrades['Elder Pledge'].bought || Game.Upgrades['Festive biscuit'].bought, 'buyToggles=ON ならトグル系も買う');
CFG.upgrade.buyToggles = false; Bot.setConfig(CFG);

// ブラックリスト
Object.keys(Game.Upgrades).forEach(k => { if (Game.Upgrades[k].pool !== 'prestige') Game.Upgrades[k].bought = 0; });
Game.refreshStore();
CFG.upgrade.blacklist = ['One mind', 'Kitten helpers']; Bot.setConfig(CFG);
Game.cookies = 1e15;
Game.frame(200);
ok(!Game.Upgrades['One mind'].bought && !Game.Upgrades['Kitten helpers'].bought, 'ブラックリスト指定した UP は買わない');
ok(Game.Upgrades['Thousand fingers'].bought, 'ブラックリスト以外は買う');
CFG.upgrade.blacklist = []; Bot.setConfig(CFG);

// 施設購入
CFG.building.enabled = true; Bot.setConfig(CFG);
Game.cookies = 1e12;
const b1 = Game.buildingsOwned;
const cursorBefore = Game.Objects['Cursor'].amount;
Game.frame(300);
ok(Game.buildingsOwned > b1, '施設を自動購入した (+' + (Game.buildingsOwned - b1) + ')');
ok(Game.Objects['Cursor'].amount > cursorBefore, 'Cursor が増えた (' + cursorBefore + ' -> ' + Game.Objects['Cursor'].amount + ')');
ok(Bot.stats.buildings > 0 && Bot.stats.buildingsSpent > 0, '統計: buildings=' + Bot.stats.buildings + ' spent=' + Bot.stats.buildingsSpent.toExponential(2));
// cheapest 戦略でも動く
CFG.building.strategy = 'cheapest'; Bot.setConfig(CFG);
Game.cookies = 1e12;
const b2 = Game.buildingsOwned;
Game.frame(200);
ok(Game.buildingsOwned > b2, 'cheapest 戦略でも購入できる (+' + (Game.buildingsOwned - b2) + ')');
CFG.building.strategy = 'payback'; Bot.setConfig(CFG);

/* ---------------- 6. 砂糖ランプ ---------------- */
section('6. 砂糖ランプと建物レベル');
const lumps0 = Game.lumps;
const lv0 = Game.Objects['Farm'].level;
Game.lumpT = Date.now() - Game.lumpRipeAge - 1000;   // 熟成済みにする
Game.frame(700);
ok(Game.lumps !== lumps0 || Game.lumpT > Date.now() - Game.lumpRipeAge, 'ランプを収穫した');
ok(Game.Objects['Farm'].level >= lv0, '建物レベルが下がっていない (Lv' + Game.Objects['Farm'].level + ')');
ok(Bot.stats.levelUps >= 0, '統計: levelUps=' + Bot.stats.levelUps);

/* ---------------- 7. 庭 ---------------- */
section('7. 農業 (庭)');
garden.nextStep = 0;
Game.frame(60);
let planted = 0;
for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (garden.plot[y][x][0] > 0) planted++;
ok(planted > 0, '庭に植栽した (' + planted + ' 株)');
ok(Bot.stats.gardenPlants > 0, '統計: gardenPlants=' + Bot.stats.gardenPlants);
const gs = Bot.run('gardenState');
ok(gs.ok && gs.data.ready && Array.isArray(gs.data.plot), 'gardenState の取得');
ok(gs.data.seeds.length === garden.plantsN, '種の数を返す (' + gs.data.seeds.length + ')');
ok(Bot.run('gardenSetSoil', { key: 'dirt' }).ok, 'gardenSetSoil がエラーにならない');
ok(Bot.run('gardenHarvestAll', { includeImmature: true }).ok, 'gardenHarvestAll がエラーにならない');

/* ---------------- 8. 種の解放 ---------------- */
section('8. 種の自動解放 (unlock モード)');
CFG.garden.mode = 'unlock'; CFG.garden.unlockAll = true; CFG.garden.soil = 'auto';
Bot.setConfig(CFG);
garden.nextStep = 0;
for (let i = 0; i < 60; i++) { garden.nextStep = 0; Game.frame(30); }
const st = Bot.run('gardenState').data;
ok(st.unlocked >= 2, '種が解放され始めた (' + st.unlocked + '/' + st.total + ')', { plan: st.plan });
ok(!!st.plan && !!st.plan.target, '解放計画が動いている', st.plan);
// Circular fungal recipes need the Meddleweed drop path as the first-seed escape hatch.
ok(Bot.GARDEN_RECIPES.brownMold && Bot.GARDEN_RECIPES.brownMold.__special === 'kill', 'Brown Moldの初回解放がMeddleweed収穫を使う');
ok(Bot.GARDEN_RECIPES.crumbspore && Bot.GARDEN_RECIPES.crumbspore.__special === 'kill', 'Crumbsporeの初回解放がMeddleweed収穫を使う');
const unlockOrder = Bot.gardenPlanOrder();
ok(garden.plants.meddleweed.unlocked || (unlockOrder.indexOf('meddleweed') >= 0 && (unlockOrder.indexOf('brownMold') < 0 || unlockOrder.indexOf('meddleweed') < unlockOrder.indexOf('brownMold'))), '循環依存の前にMeddleweed解放を計画する');
// When both first fungal seeds and Meddleweed are locked, the planner must start with naturally spawning Meddleweed.
const savedPlantUnlocksForOrder = garden.plantsById.map(p => !!p.unlocked);
try {
  garden.plants.meddleweed.unlocked = false;
  garden.plants.brownMold.unlocked = false;
  garden.plants.crumbspore.unlocked = false;
  garden.getUnlockedN();
  const lockedOrder = Bot.gardenPlanOrder();
  ok(lockedOrder[0] === 'meddleweed' && lockedOrder.indexOf('meddleweed') < lockedOrder.indexOf('brownMold') && lockedOrder.indexOf('meddleweed') < lockedOrder.indexOf('crumbspore'), 'Meddleweed未解放時はBrown Mold/Crumbsporeより先に計画');
} finally {
  garden.plantsById.forEach((p, i) => { p.unlocked = savedPlantUnlocksForOrder[i]; });
  garden.getUnlockedN();
}


// Isolated regression check: mature seed cycles advance once, while immature crops are preserved.
const gardenBeforeRotation = {
  plot: JSON.parse(JSON.stringify(garden.plot)),
  unlocks: garden.plantsById.map(p => !!p.unlocked),
  cfg: { mode: CFG.garden.mode, autoSeedSwitch: CFG.garden.autoSeedSwitch, farmSeed: CFG.garden.farmSeed, harvestMature: CFG.garden.harvestMature, unlockAll: CFG.garden.unlockAll, lumpFarm: CFG.garden.lumpFarm, weedControl: CFG.garden.weedControl },
  gp: { activeFarmSeed: Bot._gp.activeFarmSeed, activeFarmSeedStarted: Bot._gp.activeFarmSeedStarted, seedSwitches: Bot._gp.seedSwitches, target: Bot._gp.target, phase: Bot._gp.phase, since: Bot._gp.since, attempts: Bot._gp.attempts, reserved: Object.assign({}, Bot._gp.reserved), center: Bot._gp.center, need: Bot._gp.need }
};
try {
  garden.plantsById.forEach(p => { p.unlocked = true; }); garden.getUnlockedN();
  Game.cookies = 1e100; Game.CalculateGains(); garden.freeze = 0;
  garden.plot.forEach(row => row.forEach((cell, x) => { /* replaced below using nested loops */ }));
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) garden.plot[y][x] = [0, 0];
  CFG.garden.mode = 'farm'; CFG.garden.autoSeedSwitch = true; CFG.garden.farmSeed = 'bakerWheat'; CFG.garden.harvestMature = false; CFG.garden.unlockAll = false; CFG.garden.lumpFarm = false; CFG.garden.weedControl = true;
  Bot.setConfig(CFG);
  Bot._gp.target = null; Bot._gp.phase = 'idle'; Bot._gp.since = 0; Bot._gp.attempts = 0; Bot._gp.reserved = {}; Bot._gp.center = null; Bot._gp.need = null;
  Bot._gp.activeFarmSeed = 'bakerWheat'; Bot._gp.activeFarmSeedStarted = true;
  const firstTile = (() => { for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (garden.isTileUnlocked(x,y)) return {x,y}; return null; })();
  if (firstTile) garden.plot[firstTile.y][firstTile.x] = [garden.plants.bakerWheat.id + 1, garden.plants.bakerWheat.mature];
  const switchesBefore = Bot._gp.seedSwitches;
  Bot.modGarden();
  ok(Bot._gp.activeFarmSeed === 'thumbcorn' && Bot._gp.seedSwitches > switchesBefore, '通常栽培は成熟後に次の種へ切り替わる');
  const thumbcornTile = (() => { for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (garden.plot[y][x][0] === garden.plants.thumbcorn.id + 1) return {x,y}; return null; })();
  ok(!!thumbcornTile, '自動切替後に新しい種が実際に植えられる');
  if (thumbcornTile) {
    const plantedCount = garden.plot.flat().filter(cell => cell[0] === garden.plants.thumbcorn.id + 1).length;
    const switchesAfterPlant = Bot._gp.seedSwitches;
    Bot.modGarden();
    ok(Bot._gp.activeFarmSeed === 'thumbcorn' && Bot._gp.seedSwitches === switchesAfterPlant && garden.plot.flat().filter(cell => cell[0] === garden.plants.thumbcorn.id + 1).length >= plantedCount, '未成熟株がある間は種切替を繰り返さない');
  } else {
    ok(false, '未成熟株がある間は種切替を繰り返さない', { reason: 'thumbcorn not planted' });
  }
  // Rotation is its own feature and must clear previous mature crops even when weed control is OFF.
  const rotTiles = [];
  for (let ry = 0; ry < 6; ry++) for (let rx = 0; rx < 6; rx++) if (garden.isTileUnlocked(rx, ry)) rotTiles.push({x: rx, y: ry});
  if (rotTiles.length >= 2) {
    for (let ry = 0; ry < 6; ry++) for (let rx = 0; rx < 6; rx++) garden.plot[ry][rx] = [0, 0];
    garden.plot[rotTiles[0].y][rotTiles[0].x] = [garden.plants.thumbcorn.id + 1, 1];
    garden.plot[rotTiles[1].y][rotTiles[1].x] = [garden.plants.bakerWheat.id + 1, garden.plants.bakerWheat.mature];
    Bot._gp.activeFarmSeed = 'thumbcorn'; Bot._gp.activeFarmSeedStarted = true;
    CFG.garden.mode = 'farm'; CFG.garden.autoSeedSwitch = true; CFG.garden.farmSeed = 'bakerWheat'; CFG.garden.weedControl = false; Bot.setConfig(CFG);
    Bot.modGarden();
    ok(garden.plot[rotTiles[1].y][rotTiles[1].x][0] !== garden.plants.bakerWheat.id + 1, 'weedControl OFFでも成熟済み旧種を撤去して自動切替を継続');
  } else ok(false, 'weedControl OFFでも成熟済み旧種を撤去して自動切替を継続', { reason: 'not enough unlocked tiles' });
  // Unlock mode should surface the currently selected recipe ingredient and not force the normal farm crop.
  garden.plants.cronerice.unlocked = false; garden.plants.bakerWheat.unlocked = true; garden.plants.thumbcorn.unlocked = true; garden.getUnlockedN();
  CFG.garden.mode = 'unlock'; CFG.garden.unlockAll = true; Bot.setConfig(CFG);
  Bot._gp.target = 'cronerice'; Bot._gp.phase = 'planting'; Bot._gp.center = null; Bot._gp.need = null; Bot._gp.reserved = {};
  Bot.modGarden();
  const unlockingState = Bot.run('gardenState');
  ok(unlockingState.ok && unlockingState.data.plan && unlockingState.data.plan.target === 'cronerice' && unlockingState.data.plan.autoPlantSeeds.some(n => n.key === 'bakerWheat') && unlockingState.data.plan.autoPlantSeeds.some(n => n.key === 'thumbcorn'), 'unlockモードは目的種に必要な材料種を自動選択する');
  // A valid mutation can take hours; the planner must not reset its target after the old 45-minute timeout.
  garden.plants.goldenClover.unlocked = false; garden.getUnlockedN();
  for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 6; xx++) garden.plot[yy][xx] = [0, 0];
  CFG.garden.mode = 'unlock'; CFG.garden.unlockAll = true; CFG.garden.soil = 'auto'; Bot.setConfig(CFG);
  Bot._gp.target = 'goldenClover'; Bot._gp.phase = 'waiting-mutation'; Bot._gp.since = Date.now() - 2 * 60 * 60 * 1000; Bot._gp.attempts = 7;
  Bot._gp.center = { x: 2, y: 2 }; Bot._gp.reserved = { '2,2': 'target' }; Bot._gp.need = null;
  Bot.modGarden();
  ok(Bot._gp.target === 'goldenClover' && Bot._gp.attempts === 7 && Bot._gp.phase === 'waiting-mutation', '長時間の変異待ちで解放対象を自動リセットしない');

} finally {
  garden.plot = gardenBeforeRotation.plot;
  garden.plantsById.forEach((p,i) => { p.unlocked = gardenBeforeRotation.unlocks[i]; }); garden.getUnlockedN();
  Object.assign(CFG.garden, gardenBeforeRotation.cfg); Bot.setConfig(CFG);
  Object.assign(Bot._gp, gardenBeforeRotation.gp);
}

/* ---------------- 9. 市場 ---------------- */
section('9. クッキー取引所');
// 施設購入がクッキーを全部使ってしまうので、この区間では止めて切り分ける
const _saved = Bot.getConfig();
['building','upgrade','garden','lump','clicker','golden','wrinkler','grimoire','pantheon','santa','dragon'].forEach(k => { CFG[k].enabled = false; });
Bot.setConfig(CFG);
Game.cookies = 1e15; Game.cookiesPsRawHighest = 1e6;
market.brokers = 2;
market.goodsById.forEach(g => { g.val = market.getRestingVal(g.id) * 0.3; g.d = 0.5; g.hidden = false; g.stock = 0; g.last = 0; });
market.brokers = 2;
Game.frame(700);
ok(Bot.stats.marketBuys > 0, '安値で買い注文を出した (' + Bot.stats.marketBuys + '株)');
ok(market.goodsById.some(g => g.stock > 0), '在庫を保有している');
// ブローカーは「CpSの20分」なので、十分余裕がある状態で自動雇用されることを確認する
market.brokers = 2;
Game.cookies = market.getBrokerPrice() * 50;
Game.frame(30);
Bot.run('runModuleOnce', { name: 'market' });
ok(market.brokers > 2, 'ブローカーを自動雇用した (' + market.brokers + '/' + market.getMaxBrokers() + ')');
Game.cookies = 1e15;
market.goodsById.forEach(g => { g.val = market.getRestingVal(g.id) * 5; g.last = 0; });
Game.frame(700);
ok(Bot.stats.marketSells > 0, '高値で売り注文を出した (' + Bot.stats.marketSells + '株)');
ok(market.profit !== 0, '損益が記録されている (' + Math.round(market.profit) + ' CpS秒)');
const ms = Bot.run('marketState');
ok(ms.ok && ms.data.items.length === market.goodsById.length, 'marketState の取得');
ok(ms.ok && ms.data.items[0].history.length > 1, '価格の履歴を返す');
ok(ms.ok && ms.data.automation && ms.data.automation.runs > 0 && typeof ms.data.automation.lastReason === 'string', '市場の自動取引診断を取得');
// The fallback warehouse formula must use building high-water mark and office bonuses, not building level.
const savedMaxStockFn = market.getGoodMaxStock;
const savedOfficeLevel = market.officeLevel;
try {
  market.getGoodMaxStock = null; market.officeLevel = 0;
  const capBase = market.goodsById[0].building.highest;
  const baseState = Bot.run('marketState').data.items[0];
  ok(baseState.maxStock === capBase, '市場上限フォールバックは建物最高保有数を基準にする');
  market.officeLevel = 1;
  ok(Bot.run('marketState').data.items[0].maxStock === capBase + 50, '市場オフィス1の倉庫+50を反映');
  market.officeLevel = 4;
  ok(Bot.run('marketState').data.items[0].maxStock === Math.ceil((capBase + 225) * 1.5), '市場最終オフィスの累積容量と1.5倍を反映');
} finally { market.getGoodMaxStock = savedMaxStockFn; market.officeLevel = savedOfficeLevel; }
// A same-tick trade rejection must be surfaced, not hidden behind a fake success.
const rejectGood = market.goodsById[0]; const rejectStock = rejectGood.stock; const rejectCookies = Game.cookies; const rejectLast = rejectGood.last;
try {
  rejectGood.last = 2; rejectGood.stock = 0; Game.cookies = 1e15;
  const rejectedBuy = Bot.marketBuy(0, 1);
  ok(!rejectedBuy.ok && /市場APIは取引を拒否/.test(rejectedBuy.error || ''), '市場の同一ティック拒否を診断に表示');
  ok(rejectGood.stock === 0, '拒否された市場取引は在庫を変えない');
} finally { rejectGood.stock = rejectStock; rejectGood.last = rejectLast; Game.cookies = rejectCookies; }
Object.keys(_saved).forEach(k => { if (k !== 'market' && typeof _saved[k] === 'object') CFG[k] = _saved[k]; });
CFG.building.enabled = true; CFG.upgrade.enabled = true; CFG.garden.enabled = true;
CFG.lump.enabled = true; CFG.clicker.enabled = true; CFG.golden.enabled = true; CFG.wrinkler.enabled = true;
CFG.grimoire.enabled = true; CFG.pantheon.enabled = true; CFG.santa.enabled = true; CFG.dragon.enabled = true;
Bot.setConfig(CFG);

/* ---------------- 10. 魔法 ---------------- */
section('10. 魔法書 (グリモア)');
grim.magic = grim.magicM;
const cast0 = Bot.stats.spellsCast + Bot.stats.spellsFailed;
Game.frame(200);
ok(Bot.stats.spellsCast + Bot.stats.spellsFailed > cast0, '呪文を詠唱した (' + (Bot.stats.spellsCast + Bot.stats.spellsFailed) + '回)');
ok(grim.magic < grim.magicM, '魔力を消費した (' + grim.magic.toFixed(1) + '/' + grim.magicM + ')');
const gri = Bot.run('grimoireState');
ok(gri.ok && gri.data.spells.length === 9, 'grimoireState の取得 (' + gri.data.spells.length + '呪文)');
ok(gri.ok && typeof gri.data.lastResult === 'string' && (gri.data.lastSpell || gri.data.lastResult === '魔力閾値待ち'), '魔法書の直近詠唱結果を診断');

/* ---------------- 11. 神殿 ---------------- */
section('11. 神殿 (パンテオン)');
pantheon.swaps = 3; pantheon.slot = [-1, -1, -1];
pantheon.godsById.forEach(g => g.slot = -1);
Game.frame(700);
const slotted = pantheon.slot.filter(x => x >= 0).length;
ok(slotted >= 1, '神を配置した (' + slotted + '体)');
ok(Bot.stats.godSwaps >= 1, '統計: godSwaps=' + Bot.stats.godSwaps);
ok(pantheon.swaps < 3, 'スワップを消費した (残り' + pantheon.swaps + ')');
const pan = Bot.run('pantheonState');
ok(pan.ok && pan.data.gods.length === 11, 'pantheonState の取得');
ok(slotted === 3, '設定ロードアウト3枠を段階的に自動配置できる (' + slotted + '/3)');
ok(pan.ok && pan.data.moved >= 1 && typeof pan.data.lastReason === 'string', 'パンテオン診断状態を取得');
const savedPanSwapsForTimer = pantheon.swaps;
pantheon.swaps = 3;
ok(Bot.run('pantheonState').data.swapInSec === 0, 'スワップ3/3では回復待ち時間を0秒と表示');
pantheon.swaps = savedPanSwapsForTimer;

// Unslotting must be free even when no swaps remain.
const unslotGod = pantheon.godsById[pantheon.slot.find(x => x >= 0)];
if (unslotGod) {
  const zeroSwapBefore = pantheon.swaps;
  const unslotRes = Bot.slotGod(unslotGod.key, -1);
  ok(unslotRes.ok && unslotGod.slot === -1 && pantheon.swaps === zeroSwapBefore, 'スワップ0でも神を無料で外せる');
  pantheon.slotGod(unslotGod, 0); // restore mock test setup directly without consuming a simulated swap
} else ok(false, 'スワップ0でも神を無料で外せる', { reason: 'no god placed' });

/* ---------------- 12. ドラゴン / サンタ ---------------- */
section('12. ドラゴンとサンタ');
Game.dragonLevel = 0; Game.dragonAura = 0; Game.dragonAura2 = 0;
Game.Upgrades['A crumbly egg'].bought = 0;
Game.santaLevel = 0; Game.cookies = 1e15;
const dragonCallsBeforeLock = Game.dragonUpgradeCalls;
Game.frame(300);
ok(Game.dragonLevel === 0 && Game.dragonUpgradeCalls === dragonCallsBeforeLock, 'ドラゴン未解放時は自動育成を呼び出さない');
ok(Game.dragonAura === 0 && Game.dragonAura2 === 0, 'ドラゴン未解放時はオーラを変更しない');
const lockedDragon = Bot.run('trainDragon');
ok(lockedDragon.ok && lockedDragon.data.ok === false && Game.dragonLevel === 0, 'ドラゴン未解放時は手動育成も拒否');
const lockedAura = Bot.run('setAura', { slot: 0, aura: 'Dragon God' });
ok(lockedAura.ok && lockedAura.data.ok === false, 'ドラゴン未解放時はオーラ設定も拒否');
ok(Bot.run('dragonAuras').data.every(a => !a.unlocked), 'ドラゴン未解放時はオーラ一覧をロック');
Game.Upgrades['A crumbly egg'].bought = 1;
Game.dragonLevel = 20;
const lockedSecondSlot = Bot.run('setAura', { slot: 1, aura: 'Reality Bending' });
ok(lockedSecondSlot.ok && lockedSecondSlot.data.ok === false, '2枠目はドラゴン最大レベル到達前に拒否');
Game.dragonAura = 0; Game.dragonAura2 = 0;
Game.frame(300);
ok(Game.dragonLevel > 20, 'A crumbly egg 購入後はドラゴン育成が可能 (' + Game.dragonLevel + ')');
ok(Game.dragonAura === 8 || Game.dragonAura2 === 8, 'オーラ "Dragon God"(8) を設定', { a1: Game.dragonAura, a2: Game.dragonAura2 });
ok(Game.dragonAura2 === 0, '最大レベル未到達時は2枠目を変更しない');
Game.dragonLevel = Game.dragonLevels.length - 1;
Game.frame(300);
ok(Game.dragonAura2 === 18 || Game.dragonAura === 18, '最大レベル到達後は2枠目に "Reality Bending"(18) を設定', { a1: Game.dragonAura, a2: Game.dragonAura2 });
ok(Bot.run('dragonAuras').data.length === 21, 'dragonAuras の取得');
const dragonSnap = Bot.run('snapshot');
ok(dragonSnap.ok && dragonSnap.data.dragonUnlocked === true, 'snapshot に dragonUnlocked を含む');
ok(dragonSnap.ok && dragonSnap.data.dragonSecondAuraUnlocked === true, 'snapshot に dragonSecondAuraUnlocked を含む');
ok(Game.santaLevel === 0, 'サンタ未解放時は自動強化しない', { level: Game.santaLevel });
const lockedSanta = Bot.run('upgradeSanta');
ok(lockedSanta.ok && lockedSanta.data.ok === false && Game.santaLevel === 0, 'サンタ未解放時は手動強化も拒否');
Game.Upgrades['A festive hat'].bought = 1;
Game.frame(300);
ok(Game.santaLevel > 0, 'A festive hat 購入後はサンタをレベルアップ (' + Game.santaLevel + ')');

/* ---------------- 13. 転生 ---------------- */
section('13. 転生と天界スキルツリー');
CFG.ascend = { enabled: true, mode: 'percent', percent: 10, minGain: 1, backupFirst: true, backupTimeoutSec: 60, autoReincarnate: true, reincarnateDelaySec: 2, prestigeOnAscend: true, cooldownSec: 0, maxPerDay: 0 };
Bot.setConfig(CFG);
Game.cookiesEarned = 1e16; Game.cookiesReset = 0; Game.prestige = 5; Game.heavenlyChips = 0;
Game.frame(200);
ok(!!Bot.pendingAscend, '転生を要求した (バックアップ待ち)', Bot.ascendInfo());
Bot.run('clearAscendBackup');
Game.frame(300);
ok(Game.OnAscend === 1 || Game.resets > 0, '転生が実行された', {timer:Game.AscendTimer,on:Game.OnAscend,resets:Game.resets});
Game.frame(100);
Game.heavenlyChips = 5000;
Game.frame(300);
ok(Bot.stats.prestigeBought > 0, '天界アップグレードを購入 (' + Bot.stats.prestigeBought + '個)');
const boughtNames = Object.keys(Game.Upgrades).filter(k => Game.Upgrades[k].bought && Game.Upgrades[k].pool === 'prestige');
ok(boughtNames.includes('Legacy'), 'Legacy を購入した');
ok(boughtNames.includes('Heavenly cookies'), '親 prerequisite の順を守って Heavenly cookies を購入', boughtNames.slice(0, 8));
Game.frame(300);
ok(Game.OnAscend === 0, '自動で現世に復帰した (resets=' + Game.resets + ')');
ok(Bot.stats.ascensions >= 1, '統計: ascensions=' + Bot.stats.ascensions);

/* ---------------- 14. イベント / ログ ---------------- */
section('14. イベントバッファ');
const drained = Bot.run('drainEvents', { since: 0, limit: 5000 });
const _errs = drained.data.events.filter(e => /error/i.test(e.a));
_errs.slice(0, 8).forEach(e => console.log('   ! ' + e.m + '/' + e.a + ' ' + JSON.stringify(e.d) + ' ' + JSON.stringify(e.r)));
ok(_errs.length === 0, 'モジュールエラーが発生していない', _errs.slice(0, 3));
ok(drained.ok, 'drainEvents が成功');
const evs = drained.data.events;
ok(evs.length > 50, 'イベントが ' + evs.length + ' 件記録された');
const mods = [...new Set(evs.map(e => e.m))].sort();
ok(mods.length >= 8, '複数モジュールのイベントがある: ' + mods.join(','));
ok(evs.every(e => e.t && e.m && e.a), '全イベントに t/m/a がある');
const second = Bot.run('drainEvents', { since: drained.data.seq, limit: 100 });
ok(second.data.events.length === 0, 'drain 後は同じイベントを返さない');

/* ---------------- 15. スナップショット ---------------- */
section('15. スナップショット');
const snap = Bot.run('snapshot', { store: true, garden: true, market: true, prestige: true });
ok(snap.ok, 'snapshot が成功');
const d = snap.data;
ok(typeof d.cookies === 'number' && typeof d.cookiesPs === 'number', 'cookies / cookiesPs');
ok(Array.isArray(d.buildings) && d.buildings.length === 20, 'buildings (20)');
ok(Array.isArray(d.store), 'store');
ok(Array.isArray(d.buffs), 'buffs');
ok(d.mg && d.mg.garden && d.mg.market && d.mg.pantheon && d.mg.grimoire, 'ミニゲームの状態');
ok(Array.isArray(d.prestigeTree) && d.prestigeTree.length === Game.PrestigeUpgrades.length, 'prestigeTree');
ok(d.permanentUpgrades.length === 5, 'permanentUpgrades');
ok(JSON.stringify(d).length < 400000, 'スナップショットのサイズが適正 (' + Math.round(JSON.stringify(d).length / 1024) + 'KB)');

/* ---------------- 16. 手動 API ---------------- */
section('16. 手動 API');
Game.cookies = 1e15;
ok(Bot.run('click', { times: 3 }).ok, 'click');
ok(Bot.run('buyBuilding', { key: 'Cursor', count: 5 }).data.bought >= 0, 'buyBuilding');
ok(Bot.run('popShimmers', { all: true }).ok, 'popShimmers');
ok(Bot.run('popWrinklers', {}).ok, 'popWrinklers');
ok(Bot.run('harvestLump').ok !== undefined, 'harvestLump');
ok(Bot.run('levelUpBuilding', { key: 'Farm' }).ok !== undefined, 'levelUpBuilding');
ok(Bot.run('saveGame').ok, 'saveGame');
ok(Bot.run('exportSaveCode').data.code, 'exportSaveCode');
ok(Bot.run('mute', { on: true }).data.muted === true, 'mute');
ok(Bot.run('schedule').data.length >= 15, 'schedule (' + Bot.run('schedule').data.length + ' モジュール)');
ok(Bot.run('stats').data.clicks > 0, 'stats');
ok(Bot.run('nonexistentAction').ok === false, '未知のアクションは ok=false');

/* ---------------- 17. エラー耐性 ---------------- */
section('17. エラー耐性');
const savedReady = Game.ready;
Game.ready = 0;
const r1 = Bot.run('snapshot');
ok(r1 && r1.ok === false && /not ready/.test(String(r1.error)), 'ゲーム未起動時は安全にエラーを返す', r1);
const r2 = Bot.run('buyBuilding', { key: 'Cursor' });
ok(r2.ok === false, '未起動時のアクションはエラーを返す');
Game.ready = savedReady;
ok(Bot.run('ping').data.ready === true, '復帰後に again 正常');

/* ---------------- 18. 状態を壊さないこと ---------------- */
section('18. ゲーム状態の安全性');
// measureCps は一時的に amount を増やして CpS 増分を測る。必ず元に戻すこと。
Game.cookies = 1e15;
const beforeAmts = Game.ObjectsById.map(o => o.amount);
Bot.measureCps(true);
const afterAmts = Game.ObjectsById.map(o => o.amount);
ok(JSON.stringify(beforeAmts) === JSON.stringify(afterAmts), 'CpS計測後に施設数が元に戻る');
const cpsBefore = Game.cookiesPs;
Game.CalculateGains();
ok(Math.abs(Game.cookiesPs - cpsBefore) < 1e-6 * Math.max(1, cpsBefore), 'CpS も元に戻る');
// choicesFunction を持つアップグレードは絶対に買わない
const fakeChoice = Game.Upgrades['Milk selector'] || null;
if (fakeChoice) {
  fakeChoice.pool = 'main'; fakeChoice.bought = 0; fakeChoice.basePrice = 1;
  fakeChoice.choicesFunction = function () { return []; };
  Game.refreshStore();
  Game.frame(120);
  ok(!fakeChoice.bought, 'choicesFunction を持つ UP は自動購入しない');
}
ok(Game.T > 0 && isFinite(Game.cookies) && Game.cookies >= 0, 'cookies が有限かつ非負');
ok(Game.ObjectsById.every(o => o.amount >= 0 && isFinite(o.amount)), '施設数が正常');

/* ---------------- 結果 ---------------- */
console.log('\n' + '='.repeat(56));
console.log(`  結果: ${pass} 成功 / ${fail} 失敗`);
if (fails.length) { console.log('  失敗項目:'); fails.forEach(f => console.log('   - ' + f)); }
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
