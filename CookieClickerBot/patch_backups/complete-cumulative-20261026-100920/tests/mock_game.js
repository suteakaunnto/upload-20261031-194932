/* =====================================================================
   Cookie Clicker のモック (テスト用)
   実ゲーム main.js / minigame*.js の API 表面を再現する
   ===================================================================== */
'use strict';

function makeMock(opts) {
  opts = opts || {};

  /* ---------------- 偽時計 ---------------- */
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) super(clock); else super(...a); }
    static now() { return clock; }
  };
  function advance(ms) { clock += ms; }

  /* ---------------- ユーティリティ ---------------- */
  global.Beautify = function (v, dec) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (Math.abs(v) < 10000) return dec ? v.toFixed(dec) : String(Math.round(v * 100) / 100);
    return v.toExponential(2);
  };
  global.loc = function (s) { return s; };
  global.l = function () { return null; };
  global.choose = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  global.PlaySound = function () { };
  global.PlayCue = function () { };
  global.PlayMusicSound = function () { };
  global.randomFloor = function (n) { return Math.floor(n); };

  /* ---------------- Game ---------------- */
  const Game = global.Game = {
    version: '2.052 (mock)',
    ready: 1, fps: 30, T: 1000,
    cookies: opts.cookies !== undefined ? opts.cookies : 1e6,
    cookiesEarned: opts.cookiesEarned !== undefined ? opts.cookiesEarned : 1e6,
    cookiesReset: opts.cookiesReset || 0,
    cookiesPs: 0, rawCookiesPs: 0, cookiesPsRawHighest: 100,
    computedMouseCps: 5, unbuffedCps: 0,
    cookieClicks: 0, handmadeCookies: 0, clicksThisSession: 0, lastClick: 0,
    buildingsOwned: 0, upgradesOwned: 0, AchievementsOwned: 12,
    milkProgress: 1.5, Milk: { name: 'milk' },
    prestige: opts.prestige || 0, heavenlyChips: opts.heavenlyChips || 0,
    heavenlyChipsSpent: 0, heavenlyCookies: 0, resets: opts.resets || 0,
    lumps: opts.lumps !== undefined ? opts.lumps : 12, lumpsTotal: 40,
    lumpT: clock - 30 * 3600 * 1000, lumpMatureAge: 20 * 3600 * 1000,
    lumpRipeAge: 23 * 3600 * 1000, lumpOverripeAge: 25 * 3600 * 1000,
    lumpCurrentType: 0, lumpRefill: 0,
    goldenClicks: 3, missedGoldenClicks: 1, wrinklersPopped: 0, autoclickerDetected: 0,
    cookiesSucked: 0, cpsSucked: 0, elderWrath: 0,
    season: '', baseSeason: '', seasonT: 0, seasonUses: 0,
    santaLevel: 0, dragonLevel: 25, dragonAura: 0, dragonAura2: 0,
    OnAscend: 0, AscendTimer: 0, ReincarnateTimer: 0,
    timedout: false, promptOn: 0, promptL: { innerHTML: '' },
    volume: 75, volumeMusic: 50, lastActivity: clock,
    accumulatedDelay: 0, delayTimeouts: 0, currentFps: 30,
    toSave: false, isSaving: false, bakeryName: 'Test Bakery',
    recalculateGains: 0, storeToRefresh: 0, upgradesToRebuild: 0,
    buyBulk: 1, buyMode: 1, priceIncrease: 1.15,
    permanentUpgrades: [-1, -1, -1, -1, -1],
    ascensionMode: 0, nextAscensionMode: 0,
    vault: [], keys: [], buffs: {}, effs: {},
    shimmers: [], wrinklers: [], shimmerTypes: {},
    autosave: 1, modHooks: {}, mods: {}, sortedMods: [], modSaveData: {},
    ascendMeterPercent: 0, ascendMeterLevel: 0, gainedPrestige: 0,
    prefs: { particles: 1, numbers: 1, autosave: 1, cookiesound: 1, askLumps: 1, timeout: 1, notifs: 1 },
    HCfactor: 2,
    events: [],
  };
  function note(kind, detail) { Game.events.push({ kind, detail, at: clock }); }

  Game.registerHook = function (h, f) { (Game.modHooks[h] = Game.modHooks[h] || []).push(f); };
  Game.runModHook = function (h, p) { (Game.modHooks[h] || []).forEach(f => f(p)); };
  Game.Earn = function (n) { if (Game.OnAscend) return; Game.cookies += n; Game.cookiesEarned += n; };
  Game.Spend = function (n) { if (Game.OnAscend) return; Game.cookies -= n; };
  Game.Notify = function (t, d) { note('notify', t); };
  Game.Win = function (n) { note('achievement', n); };
  Game.Popup = function () { };
  Game.ClosePrompt = function () { Game.promptOn = 0; note('closePrompt'); };
  Game.Prompt = function () { Game.promptOn = 1; };
  Game.Has = function () { return false; };
  Game.HasAchiev = function () { return false; };
  Game.hasBuff = function (n) { const b = Game.buffs[n]; return b && b.time > 0 ? b : 0; };
  Game.auraMult = function () { return 0; };
  Game.eff = function (n, d) { return Game.effs[n] === undefined ? (d === undefined ? 1 : d) : Game.effs[n]; };
  Game.canLumps = function () { return Game.lumpsTotal > -1; };
  Game.computeLumpType = function () { Game.lumpCurrentType = 0; };
  Game.harvestLumps = function (n) {
    if (!Game.canLumps()) return;
    Game.lumpT = clock;
    Game.lumps += n; Game.lumpsTotal += n;
    note('lump', n);
  };
  Game.spendLump = function (n, str, func) {
    return function () {
      if (Game.lumps < n) return false;
      Game.lumps -= n;
      if (func) func();
      return true;
    };
  };
  Game.HowMuchPrestige = function (c) { return Math.pow(c / 1e12, 1 / Game.HCfactor); };
  Game.HowManyCookiesReset = function (c) { return Math.pow(c, Game.HCfactor) * 1e12; };
  Game.WriteSave = function (type) { if (type === 1) return 'MOCKSAVECODE' + Math.floor(Game.cookies); Game.toSave = false; return 'MOCKSAVE'; };
  Game.LoadSave = function (d) { note('loadSave', String(d).slice(0, 20)); };
  Game.sayTime = function (n) { return (n / 30) + 's'; };

  /* ---------------- 施設 ---------------- */
  const BUILDINGS = ['Cursor', 'Grandma', 'Farm', 'Mine', 'Factory', 'Bank', 'Temple', 'Wizard tower',
    'Shipment', 'Alchemy lab', 'Portal', 'Time machine', 'Antimatter condenser', 'Prism',
    'Chancemaker', 'Fractal engine', 'Javascript console', 'Idleverse', 'Cortex baker', 'You'];
  const MINIGAMES = { Farm: ['minigameGarden.js', 'Garden'], Bank: ['minigameMarket.js', 'Stock Market'], Temple: ['minigamePantheon.js', 'Pantheon'], 'Wizard tower': ['minigameGrimoire.js', 'Grimoire'] };
  Game.Objects = {}; Game.ObjectsById = []; Game.ObjectsN = 0;
  BUILDINGS.forEach((name, i) => {
    const base = Math.pow(10, i) * (i === 0 ? 15 : 100);
    const me = {
      id: i, name, dname: name, bsingle: name.toLowerCase(), plural: name.toLowerCase() + 's',
      amount: opts.buildings ? (opts.buildings[i] || 0) : (i < 8 ? 30 - i * 3 : 0),
      bought: 1, highest: opts.buildings ? (opts.buildings[i] || 0) : (i < 8 ? 30 - i * 3 : 0), free: 0, level: opts.levels ? (opts.levels[i] || 0) : (i >= 2 && i <= 6 ? 3 : 0),
      basePrice: base, baseCps: base / 10, price: base, muted: false, totalCookies: 0,
      minigameUrl: MINIGAMES[name] ? MINIGAMES[name][0] : 0,
      minigameName: MINIGAMES[name] ? MINIGAMES[name][1] : 0,
      minigame: null, minigameLoaded: !!MINIGAMES[name], onMinigame: false,
      vanilla: true,
    };
    me.getPrice = function () { return Math.ceil(me.basePrice * Math.pow(Game.priceIncrease, Math.max(0, me.amount - me.free))); };
    me.getSumPrice = function (n) { let p = 0; for (let i = 0; i < n; i++) p += me.getPrice(); return p; };
    me.buy = function (amount) {
      if (Game.buyMode === -1) return 0;
      if (!amount) amount = Game.buyBulk;
      if (amount === -1) amount = 1000;
      let bought = 0;
      for (let i = 0; i < amount; i++) {
        const price = me.getPrice();
        if (Game.cookies >= price) { Game.Spend(price); me.amount++; me.bought++; bought++; Game.buildingsOwned++; me.highest = Math.max(me.highest, me.amount); }
      }
      return bought;
    };
    me.sell = function (amount) { if (amount === -1) amount = me.amount; me.amount = Math.max(0, me.amount - amount); return amount; };
    me.sacrifice = function (amount) { if (amount === -1) amount = me.amount; const s = Math.min(me.amount, amount); me.amount -= s; return s; };
    me.levelUp = function () {
      return function (free) {
        Game.spendLump(me.level + 1, 'level up', function () { me.level += 1; note('levelUp', me.name + '->' + me.level); if (me.minigame && me.minigame.onLevel) me.minigame.onLevel(me.level); })();
      };
    };
    me.refresh = function () { };
    me.switchMinigame = function () { };
    Game.Objects[name] = me; Game.ObjectsById[i] = me;
  });
  Game.isMinigameReady = function (me) { return !!(me && me.minigameUrl && me.minigameLoaded && me.level > 0); };

  Game.CalculateGains = function () {
    let cps = 0;
    Game.ObjectsById.forEach(me => { cps += me.amount * me.baseCps * (1 + 0.02 * me.level); });
    cps *= 1 + 0.01 * Game.prestige * (1 + Game.GetHeavenlyMultiplier());
    Game.cookiesPs = cps; Game.rawCookiesPs = cps;
    Game.cookiesPsRawHighest = Math.max(Game.cookiesPsRawHighest, cps);
    Game.computedMouseCps = 1 + cps * 0.01;
    return cps;
  };
  Game.GetHeavenlyMultiplier = function () { return 0.05; };
  Game.recalculateGains = 1;

  /* ---------------- アップグレード ---------------- */
  const UPGRADES = [];
  function addUp(name, price, pool, parents, extra) {
    const u = Object.assign({
      id: UPGRADES.length, name, dname: name, basePrice: price, pool: pool || '',
      bought: 0, unlocked: 1, order: UPGRADES.length, priceLumps: 0, tier: 0,
      parents: parents || [], icon: [0, 0], type: 'upgrade',
    }, extra || {});
    u.getPrice = function () { return u.priceFunc ? u.priceFunc(u) : u.basePrice; };
    u.canBuy = function () { return u.priceLumps > 0 ? Game.lumps >= u.priceLumps : Game.cookies >= u.getPrice(); };
    u.isVaulted = function () { return Game.vault.indexOf(u.id) !== -1; };
    u.buy = function (bypass) {
      if (u.pool === 'prestige') {
        const price = u.getPrice();
        if (Game.heavenlyChips >= price && !u.bought) {
          Game.heavenlyChips -= price; Game.heavenlyChipsSpent += price;
          u.unlocked = 1; u.bought = 1; note('prestigeBuy', u.name);
          return 1;
        }
        return 0;
      }
      if (u.canBuy() && !u.bought) {
        if (!u.priceLumps) Game.Spend(u.getPrice());
        else Game.lumps -= u.priceLumps;
        u.bought = 1; Game.upgradesOwned++; note('upgradeBuy', u.name);
        return 1;
      }
      return 0;
    };
    UPGRADES.push(u);
    Game.Upgrades = Game.Upgrades || {};
    Game.Upgrades[name] = u;
    return u;
  }
  Game.Upgrades = {}; Game.UpgradesById = []; Game.UpgradesInStore = [];
  addUp('Reinforced index finger', 100);
  addUp('Carpal tunnel prevention cream', 500);
  addUp('Thousand fingers', 10000);
  addUp('Kitten helpers', 900000, '', [], { kitten: 1 });
  addUp('One mind', 1e9, '', [], { apocalypse: 1 });
  addUp('Elder Pledge', 1e6, 'toggle');
  addUp('Festive biscuit', 2.5e11, 'toggle');
  addUp('Lovesick biscuit', 2.5e11, 'toggle');
  addUp('Sugar baking', 0, 'prestige', [], { priceFunc: () => 200000000 });
  addUp('Legacy', 0, 'prestige');
  addUp('Heavenly cookies', 3, 'prestige', ['Legacy']);
  addUp('Heavenly luck', 77, 'prestige', ['Heavenly cookies']);
  addUp('Persistent memory', 500, 'prestige', ['Heavenly luck']);
  addUp('Permanent upgrade slot I', 100, 'prestige', []);
  // UI 選択ダイアログを開くだけのアップグレード (実ゲームの Milk selector 相当)
  const milkSel = addUp('Milk selector', 1, 'toggle');
  milkSel.choicesFunction = function () { return [{ name: 'a', icon: [0, 0] }, { name: 'b', icon: [1, 0] }]; };
  addUp('A festive hat', 25, '', [], { unlocked: 0 });
  UPGRADES.forEach(u => { Game.UpgradesById[u.id] = u; });
  Game.PrestigeUpgrades = UPGRADES.filter(u => u.pool === 'prestige' || u.pool === 'prestigeDecor');
  Game.PrestigeUpgrades.forEach(u => {
    u.parents = (u.parents || []).map(p => typeof p === 'string' ? Game.Upgrades[p] : p);
  });
  // Legacy を親に持つもの
  Game.Upgrades['Heavenly cookies'].parents = [Game.Upgrades['Legacy']];
  Game.Upgrades['Heavenly luck'].parents = [Game.Upgrades['Heavenly cookies']];
  Game.Upgrades['Persistent memory'].parents = [Game.Upgrades['Heavenly luck']];
  Game.refreshStore = function () {
    Game.UpgradesInStore = UPGRADES.filter(u => !u.bought && u.unlocked && u.pool !== 'prestige');
    Game.UpgradesInStore.sort((a, b) => a.getPrice() - b.getPrice());
  };
  Game.refreshStore();
  Game.CountsAsUpgradeOwned = function (p) { return p === '' || p === 'cookie' || p === 'tech'; };
  Game.PutUpgradeInPermanentSlot = function () { };
  Game.BuildAscendTree = function () { };
  Game.PurchaseHeavenlyUpgrade = function (id) { Game.UpgradesById[id].buy(); };
  Game.AssignPermanentSlot = function () { };

  /* ---------------- クリック ---------------- */
  Game.ClickCookie = function (e, amount) {
    const t = clock;
    if (e && e.preventDefault) e.preventDefault();
    if (Game.OnAscend || Game.AscendTimer > 0 || Game.T < 3 || t - Game.lastClick < 1000 / ((e ? e.detail : 1) === 0 ? 3 : 50)) { return; }
    const amt = amount || Game.computedMouseCps;
    Game.Earn(amt); Game.handmadeCookies += amt; Game.cookieClicks++; Game.clicksThisSession++;
    Game.lastClick = t;
    note('click', amt);
  };
  Game.mouseCps = function () { return Game.computedMouseCps; };

  /* ---------------- シマー / シワシワ ---------------- */
  Game.shimmerTypes = {
    golden: { n: 0, popFunc: function (me) { Game.Earn(Game.cookiesPs * 60 * 13); me.die(); note('goldenPop', me.wrath ? 'wrath' : 'golden'); } },
    reindeer: { n: 0, popFunc: function (me) { Game.Earn(Game.cookiesPs * 60 * 3); me.die(); note('reindeerPop'); } },
  };
  function Shimmer(type, wrath) {
    this.type = type; this.wrath = wrath ? 1 : 0; this.popped = false; this.force = ''; this.noCount = 0;
    this.die = function () { const i = Game.shimmers.indexOf(this); if (i >= 0) Game.shimmers.splice(i, 1); };
    this.pop = function (e) { if (this.popped) return; this.popped = true; if (e && e.preventDefault) e.preventDefault(); Game.shimmerTypes[this.type].popFunc(this); };
    Game.shimmers.push(this);
  }
  Game.spawnShimmer = function (type, wrath) { return new Shimmer(type, wrath); };
  Game.killShimmers = function () { Game.shimmers.length = 0; };

  Game.wrinklerLimit = 14; Game.wrinklerHP = 2.1;
  Game.wrinklers = [];
  for (let i = 0; i < Game.wrinklerLimit; i++) Game.wrinklers.push({ id: i, close: 0, sucked: 0, phase: 0, hp: Game.wrinklerHP, type: 0, clicks: 0, hurt: 0, selected: 0 });
  Game.getWrinklersMax = function () { return 10; };
  Game.spawnWrinkler = function (n, shiny) {
    let c = 0;
    for (let i = 0; i < Game.wrinklers.length && c < n; i++) {
      const w = Game.wrinklers[i];
      if (w.phase === 0) { w.phase = 2; w.sucked = 1e5; w.type = shiny ? 1 : 0; c++; }
    }
    return c;
  };
  Game.updateWrinklers = function () {
    for (const w of Game.wrinklers) {
      if (w.phase > 0 && w.hp <= 0.5) {
        w.phase = 0; w.hp = Game.wrinklerHP * (w.type === 1 ? 3 : 1);
        const gain = w.sucked * 1.1 * (w.type === 1 ? 3 : 1);
        Game.Earn(gain); Game.wrinklersPopped++; w.sucked = 0;
        note('wrinklerPop', gain);
      }
    }
  };

  /* ---------------- サンタ / ドラゴン / 季節 ---------------- */
  Game.UpgradeSanta = function () {
    const hat = Game.Upgrades && Game.Upgrades['A festive hat'];
    if (!hat || !hat.bought) return;
    const moni = Math.pow(Game.santaLevel + 1, Game.santaLevel + 1);
    if (Game.cookies > moni && Game.santaLevel < 14) { Game.Spend(moni); Game.santaLevel++; note('santa', Game.santaLevel); }
  };
  Game.dragonLevels = [];
  for (let i = 0; i < 26; i++) Game.dragonLevels.push({ name: 'dl' + i, pic: 0, cost: function () { return Game.cookies >= (i + 1) * 1e6; }, buy: function () { Game.Spend((i + 1) * 1e6); }, costStr: function () { return ''; } });
  Game.UpgradeDragon = function () {
    if (Game.dragonLevel < Game.dragonLevels.length - 1 && Game.dragonLevels[Game.dragonLevel].cost()) {
      Game.dragonLevels[Game.dragonLevel].buy(); Game.dragonLevel++; note('dragon', Game.dragonLevel);
    }
  };
  Game.dragonAuras = {};
  ['No aura', 'Breath of Milk', 'Dragon Cursor', 'Elder Battalion', 'Reaper of Fields', 'Earth Shatterer',
    'Master of the Armory', 'Fierce Hoarder', 'Dragon God', 'Arcane Aura', 'Dragonflight', 'Ancestral Metamorphosis',
    'Unholy Fervor', 'Sensorial Optimization', 'Maillard Reaction', 'Fortune of the Sea', 'Dragon Guts',
    'Supreme Intellect', 'Reality Bending', 'Dragon Orbs', 'Ruler of Worlds'].forEach((n, i) => { Game.dragonAuras[i] = { name: n, pic: [0, 0], desc: '' }; });
  Game.SelectDragonAura = function () { };
  Game.seasonTriggerBasePrice = 1111111;
  Game.seasons = {
    christmas: { name: 'Christmas', trigger: 'Festive biscuit' },
    valentines: { name: "Valentine's day", trigger: 'Lovesick biscuit' },
  };
  Game.computeSeasonPrices = function () { };

  /* ---------------- 転生 ---------------- */
  Game.Ascend = function (bypass) {
    if (!bypass) { Game.Prompt(); return; }
    Game.AscendTimer = 1;
    note('ascendStart');
  };
  Game.finishAscendIntro = function () {
    const proj = Math.floor(Game.HowMuchPrestige(Game.cookiesReset + Game.cookiesEarned));
    const diff = proj - Game.prestige;
    Game.gainedPrestige = diff; Game.heavenlyChips += diff; Game.prestige = proj;
    Game.AscendTimer = 0; Game.OnAscend = 1;
    note('ascendDone', { prestige: Game.prestige, chips: Game.heavenlyChips });
  };
  Game.Reincarnate = function (bypass) {
    if (!bypass) { Game.Prompt(); return; }
    Game.cookiesReset += Game.cookiesEarned;
    Game.cookies = 0; Game.cookiesEarned = 0;
    Game.OnAscend = 0; Game.resets++;
    Game.ObjectsById.forEach(me => { me.amount = 0; });
    UPGRADES.forEach(u => { if (u.pool !== 'prestige') { u.bought = 0; } });
    Game.refreshStore();
    note('reincarnate', Game.resets);
  };
  Game.Reset = function () { };

  /* ---------------- ミニゲーム : 庭 ---------------- */
  const garden = {
    plants: {}, plantsById: [], plantsN: 0, plantsUnlockedN: 0,
    plot: [], plotBoost: [], soil: 0, soils: {}, soilsById: [],
    seedSelected: -1, freeze: 0, stepT: 1, nextStep: 0, harvests: 0, harvestsTotal: 0,
    parent: Game.Objects['Farm'],
  };
  const PLANT_DEFS = [
    ['bakerWheat', 1, 30, 35, 7, {}],
    ['thumbcorn', 5, 100, 20, 6, {}],
    ['cronerice', 15, 250, 55, 0.4, {}],
    ['gildmillet', 15, 1500, 40, 2, {}],
    ['clover', 25, 77777, 35, 1, {}],
    ['goldenClover', 125, 777777777777, 50, 4, {}],
    ['shimmerlily', 60, 777777, 70, 5, {}],
    ['elderwort', 180, 1e8, 90, 0.3, { immortal: 1 }],
    ['bakeberry', 45, 1e8, 50, 1, { onHarvest: function (x, y, age) { if (age >= this.mature) { const m = Math.min(Game.cookies * 0.03, Game.cookiesPs * 60 * 30); Game.Earn(m); note('bakeberry', m); } } }],
    ['chocoroot', 15, 1e5, 25, 4, { onHarvest: function (x, y, age) { if (age >= this.mature) Game.Earn(Math.min(Game.cookies * 0.03, Game.cookiesPs * 180)); } }],
    ['whiteChocoroot', 15, 1e5, 25, 4, {}],
    ['whiteMildew', 20, 9999, 70, 8, { fungus: 1 }],
    ['brownMold', 20, 9999, 70, 8, { fungus: 1 }],
    ['meddleweed', 1, 10, 50, 10, { weed: 1, onKill: function (x, y, age) { if (Math.random() < 0.2 * (age / 100)) { garden.plot[y][x] = [garden.plants[choose(['brownMold', 'crumbspore'])].id + 1, 0]; } } }],
    ['whiskerbloom', 20, 1e6, 60, 2, {}],
    ['chimerose', 15, 242424, 30, 1, {}],
    ['nursetulip', 40, 1e9, 60, 0.5, {}],
    ['drowsyfern', 90, 1e5, 30, 0.05, {}],
    ['wardlichen', 10, 1e4, 65, 5, {}],
    ['keenmoss', 50, 1e6, 65, 4, {}],
    ['queenbeet', 90, 1e9, 80, 1, { onHarvest: function (x, y, age) { if (age >= this.mature) Game.Earn(Math.min(Game.cookies * 0.04, Game.cookiesPs * 3600)); } }],
    ['queenbeetLump', 120, 1e12, 85, 0.04, { plantable: false, noContam: true, onHarvest: function (x, y, age) { if (age >= this.mature) { Game.lumps += 1; Game.lumpsTotal += 1; note('lumpFromGarden'); } } }],
    ['duketater', 480, 1e12, 95, 0.4, {}],
    ['crumbspore', 10, 999, 65, 3, { fungus: 1 }],
    ['doughshroom', 100, 1e8, 85, 1, { fungus: 1 }],
    ['glovemorel', 30, 1e4, 80, 3, { fungus: 1 }],
    ['cheapcap', 40, 1e5, 40, 6, { fungus: 1 }],
    ['foolBolete', 15, 1e4, 50, 5, { fungus: 1 }],
    ['wrinklegill', 20, 1e6, 65, 1, { fungus: 1 }],
    ['greenRot', 60, 1e6, 65, 12, { fungus: 1 }],
    ['shriekbulb', 60, 4.4e12, 60, 3, {}],
    ['tidygrass', 90, 1e13, 1e21, 0.5, {}],
    ['everdaisy', 180, 1e19, 75, 0.3, { immortal: 1 }],
    ['ichorpuff', 120, 987654321, 35, 1, { fungus: 1 }],
  ];
  PLANT_DEFS.forEach((d, i) => {
    const p = Object.assign({ key: d[0], name: d[0], icon: i, cost: d[1], costM: d[2], mature: d[3], matureBase: d[3], ageTick: d[4], ageTickR: 0, id: i, unlocked: 0, children: [] }, d[5]);
    garden.plants[d[0]] = p; garden.plantsById[i] = p;
  });
  garden.plants['bakerWheat'].unlocked = 1;
  if (opts.unlockSeeds) PLANT_DEFS.forEach(d => { garden.plants[d[0]].unlocked = 1; });
  garden.plantsN = garden.plantsById.length;
  garden.getUnlockedN = function () { garden.plantsUnlockedN = garden.plantsById.filter(p => p.unlocked).length; };
  garden.getUnlockedN();
  for (let y = 0; y < 6; y++) { garden.plot[y] = []; for (let x = 0; x < 6; x++) garden.plot[y][x] = [0, 0]; }
  const SOILS = [['dirt', 5, 0, 1, 1], ['fertilizer', 3, 50, 0.75, 1.2], ['clay', 15, 100, 1.25, 1], ['pebbles', 5, 200, 0.25, 0.1], ['woodchips', 5, 300, 0.25, 0.1]];
  SOILS.forEach((s, i) => { const o = { key: s[0], name: s[0], icon: i, tick: s[1], req: s[2], effMult: s[3], weedMult: s[4], id: i }; garden.soils[s[0]] = o; garden.soilsById[i] = o; });
  garden.plotLimits = [[2, 2, 4, 4], [2, 2, 5, 4], [2, 2, 5, 5], [1, 2, 5, 5], [1, 1, 5, 5], [1, 1, 6, 5], [1, 1, 6, 6], [0, 1, 6, 6], [0, 0, 6, 6]];
  garden.isTileUnlocked = function (x, y) {
    let lv = Math.max(1, Math.min(garden.plotLimits.length, garden.parent.level)) - 1;
    const L = garden.plotLimits[lv];
    return x >= L[0] && x < L[2] && y >= L[1] && y < L[3];
  };
  garden.getCost = function (me) { return Math.max(me.costM, Game.cookiesPs * me.cost * 60); };
  garden.canPlant = function (me) { return Game.cookies >= garden.getCost(me); };
  garden.getTile = function (x, y) { if (x < 0 || x > 5 || y < 0 || y > 5 || !garden.isTileUnlocked(x, y)) return [0, 0]; return garden.plot[y][x]; };
  garden.unlockSeed = function (me) { if (me.unlocked) return false; me.unlocked = 1; garden.getUnlockedN(); note('seedUnlocked', me.key); return true; };
  garden.lockSeed = function (me) { me.unlocked = 0; garden.getUnlockedN(); return true; };
  garden.harvest = function (x, y, manual) {
    const tile = garden.plot[y][x];
    if (tile[0] >= 1) {
      const me = garden.plantsById[tile[0] - 1];
      const age = tile[1];
      if (me.onHarvest) me.onHarvest(x, y, age);
      if (age >= me.mature) { garden.unlockSeed(me); garden.harvests++; garden.harvestsTotal++; }
      garden.plot[y][x] = [0, 0];
      if (me.onKill) me.onKill(x, y, age);
      return true;
    }
    return false;
  };
  garden.useTool = function (what, x, y) {
    if (garden.harvest(x, y, 1)) return false;
    if (what >= 0 && garden.canPlant(garden.plantsById[what])) {
      garden.plot[y][x] = [what + 1, 0];
      Game.Spend(garden.getCost(garden.plantsById[what]));
      return true;
    }
    return false;
  };
  garden.harvestAll = function (type, mature) {
    let n = 0;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      if (garden.plot[y][x][0] >= 1) {
        const me = garden.plantsById[garden.plot[y][x][0] - 1];
        if (type && me !== type) continue;
        if (mature && garden.plot[y][x][1] < me.mature) continue;
        if (garden.harvest(x, y)) n++;
      }
    }
    return n;
  };
  garden.computeStepT = function () { garden.stepT = garden.soilsById[garden.soil].tick * 60; };
  garden.computeStepT();
  garden.convert = function () {
    if (garden.plantsUnlockedN < garden.plantsN) return false;
    garden.harvestAll();
    garden.plantsById.forEach(p => garden.lockSeed(p));
    garden.unlockSeed(garden.plants['bakerWheat']);
    Game.lumps += 10; Game.lumpsTotal += 10;
    note('gardenConvert');
    return true;
  };
  /* 変異 & 成長をシミュレートする簡易ロジック */
  garden.MUTS = [
    [function (n, nm) { return nm.bakerWheat >= 2; }, ['bakerWheat', 0.9], ['thumbcorn', 0.9], ['bakeberry', 0.5]],
    [function (n, nm) { return nm.bakerWheat >= 1 && nm.thumbcorn >= 1; }, ['cronerice', 0.9]],
    [function (n, nm) { return nm.cronerice >= 1 && nm.thumbcorn >= 1; }, ['gildmillet', 0.9]],
    [function (n, nm) { return nm.bakerWheat >= 1 && nm.gildmillet >= 1; }, ['clover', 0.9], ['goldenClover', 0.05]],
    [function (n, nm) { return nm.clover >= 1 && nm.gildmillet >= 1; }, ['shimmerlily', 0.9]],
    [function (n, nm) { return nm.clover >= 4; }, ['goldenClover', 0.9]],
    [function (n, nm) { return nm.shimmerlily >= 1 && nm.cronerice >= 1; }, ['elderwort', 0.9]],
    [function (n, nm) { return n.bakerWheat >= 1 && n.brownMold >= 1; }, ['chocoroot', 0.9]],
    [function (n, nm) { return nm.chocoroot >= 1 && n.whiteMildew >= 1; }, ['whiteChocoroot', 0.9]],
    [function (n, nm) { return nm.whiteMildew >= 1 && n.brownMold <= 1; }, ['brownMold', 0.9]],
    [function (n, nm) { return nm.brownMold >= 1 && n.whiteMildew <= 1; }, ['whiteMildew', 0.9]],
    [function (n, nm) { return nm.shimmerlily >= 1 && nm.whiteChocoroot >= 1; }, ['whiskerbloom', 0.9]],
    [function (n, nm) { return nm.shimmerlily >= 1 && nm.whiskerbloom >= 1; }, ['chimerose', 0.9]],
    [function (n, nm) { return nm.whiskerbloom >= 2; }, ['nursetulip', 0.9]],
    [function (n, nm) { return nm.chocoroot >= 1 && nm.keenmoss >= 1; }, ['drowsyfern', 0.9]],
    [function (n, nm) { return (nm.cronerice >= 1 && nm.keenmoss >= 1) || (nm.cronerice >= 1 && nm.whiteMildew >= 1); }, ['wardlichen', 0.9]],
    [function (n, nm) { return nm.greenRot >= 1 && nm.brownMold >= 1; }, ['keenmoss', 0.9]],
    [function (n, nm) { return nm.chocoroot >= 1 && nm.bakeberry >= 1; }, ['queenbeet', 0.9]],
    [function (n, nm) { return nm.queenbeet >= 8; }, ['queenbeetLump', 0.9]],
    [function (n, nm) { return nm.queenbeet >= 2; }, ['duketater', 0.5]],
    [function (n, nm) { return nm.crumbspore >= 1 && n.crumbspore <= 1; }, ['crumbspore', 0.9]],
    [function (n, nm) { return nm.crumbspore >= 1 && nm.thumbcorn >= 1; }, ['glovemorel', 0.9]],
    [function (n, nm) { return nm.crumbspore >= 1 && nm.shimmerlily >= 1; }, ['cheapcap', 0.9]],
    [function (n, nm) { return nm.doughshroom >= 1 && nm.greenRot >= 1; }, ['foolBolete', 0.9]],
    [function (n, nm) { return nm.crumbspore >= 2; }, ['doughshroom', 0.9]],
    [function (n, nm) { return nm.crumbspore >= 1 && nm.brownMold >= 1; }, ['wrinklegill', 0.9]],
    [function (n, nm) { return nm.whiteMildew >= 1 && nm.clover >= 1; }, ['greenRot', 0.9]],
    [function (n, nm) { return nm.wrinklegill >= 1 && nm.elderwort >= 1; }, ['shriekbulb', 0.9]],
    [function (n, nm) { return nm.bakerWheat >= 1 && nm.whiteChocoroot >= 1; }, ['tidygrass', 0.9]],
    [function (n, nm) { return nm.tidygrass >= 3 && nm.elderwort >= 3; }, ['everdaisy', 0.9]],
    [function (n, nm) { return nm.elderwort >= 1 && nm.crumbspore >= 1; }, ['ichorpuff', 0.9]],
  ];
  garden.tickOnce = function () {
    if (garden.freeze) return;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      if (!garden.isTileUnlocked(x, y)) continue;
      const t = garden.plot[y][x];
      if (t[0] > 0) {
        const me = garden.plantsById[t[0] - 1];
        t[1] += me.ageTick + (me.ageTickR || 0) * Math.random();
        if (!me.immortal && t[1] >= 100) garden.plot[y][x] = [0, 0];
      } else {
        // 変異
        const n = {}, nm = {};
        garden.plantsById.forEach(p => { n[p.key] = 0; nm[p.key] = 0; });
        let any = 0;
        [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(d => {
          const nt = garden.getTile(x + d[0], y + d[1]);
          if (nt[0] > 0) {
            const np = garden.plantsById[nt[0] - 1];
            any++; n[np.key]++; if (nt[1] >= np.mature) nm[np.key]++;
          }
        });
        if (any > 0) {
          const cands = [];
          garden.MUTS.forEach(rule => { if (rule[0](n, nm)) { for (let k = 1; k < rule.length; k++) if (Math.random() < rule[k][1]) cands.push(rule[k][0]); } });
          if (cands.length) garden.plot[y][x] = [garden.plants[choose(cands)].id + 1, 0];
        } else if (Math.random() < 0.25) {
          garden.plot[y][x] = [garden.plants['meddleweed'].id + 1, 0];
        }
      }
    }
  };
  garden.logic = function () { };
  garden.draw = function () { };
  garden.save = function () { return ''; };
  garden.load = function () { };
  garden.reset = function () { };
  garden.onLevel = function () { };
  garden.minigameLoaded = true;
  Game.Objects['Farm'].minigame = garden;

  /* ---------------- ミニゲーム : 市場 ---------------- */
  const market = {
    goods: {}, goodsById: [], officeLevel: 0, brokers: 5, profit: 0, ticks: 0,
    secondsPerTick: 60, parent: Game.Objects['Bank'], graphLines: 0, graphCols: 0,
    offices: [{ name: 'Credit garage', cost: [100, 2] }, { name: 'Tiny bank', cost: [200, 4] }, { name: 'Grand bakery', cost: [400, 8] }, { name: 'International chain', cost: [800, 16] }, { name: 'Interplanetary syndicate', cost: [1600, 32] }, { name: 'Max' }],
    loanTypes: [],
  };
  const GOODS = ['Farm', 'Mine', 'Factory', 'Bank', 'Temple', 'Wizard tower', 'Shipment', 'Alchemy lab', 'Portal', 'Time machine', 'Antimatter condenser', 'Prism', 'Chancemaker', 'Fractal engine', 'Javascript console', 'Idleverse'];
  GOODS.forEach((k, i) => {
    const o = { id: i, name: 'good' + i, symbol: 'G' + i, company: 'c', building: Game.Objects[k], stock: 0, mode: 0, dur: 100, prev: 0, val: 10 + 10 * i, vals: [10 + 10 * i], d: 0, hidden: i > 3, active: false, last: 0, icon: [0, 0] };
    market.goods[k] = o; market.goodsById[i] = o;
  });
  market.getRestingVal = function (id) { return 10 + 10 * id + (Game.Objects['Bank'].level - 1); };
  market.getGoodPrice = function (g) { return g.val; };
  market.getGoodMaxStock = function (g) { return Math.ceil(g.building.highest + 25 * market.officeLevel + g.building.level * 10); };
  market.getMaxBrokers = function () { return Math.ceil(Game.Objects['Grandma'].highest / 10 + Game.Objects['Grandma'].level); };
  market.getBrokerPrice = function () { return Game.cookiesPsRawHighest * 60 * 20; };
  market.buyGood = function (id, n) {
    const me = market.goodsById[id];
    let cost = Game.cookiesPsRawHighest * me.val * (1 + 0.01 * (20 * Math.pow(0.95, market.brokers)));
    if (n === 10000) n = Math.floor(Game.cookies / cost);
    n = Math.min(n, market.getGoodMaxStock(me) - me.stock);
    if (n > 0 && me.last !== 2 && Game.cookies >= cost * n) {
      market.profit -= me.val * n; Game.Spend(cost * n); me.stock += n; me.last = 1; me.prev = me.val;
      note('marketBuy', { id, n }); return true;
    }
    return false;
  };
  market.sellGood = function (id, n) {
    const me = market.goodsById[id];
    if (n === 10000) n = me.stock;
    n = Math.min(n, me.stock);
    if (n > 0 && me.last !== 1) {
      market.profit += me.val * n; Game.cookies += Game.cookiesPsRawHighest * me.val * n;
      me.stock -= n; me.last = 2; note('marketSell', { id, n }); return true;
    }
    return false;
  };
  market.takeLoan = function () { return true; };
  market.tick = function () {
    market.goodsById.forEach(me => {
      me.last = 0; me.d *= 0.97; me.d += 0.1 * (Math.random() - 0.5);
      me.val += (market.getRestingVal(me.id) - me.val) * 0.01 + me.d;
      me.val = Math.max(1, me.val);
      me.vals.unshift(me.val); if (me.vals.length > 65) me.vals.pop();
      me.dur--; if (me.dur <= 0) { me.dur = 400; me.mode = Math.floor(Math.random() * 6); }
    });
    market.ticks++;
  };
  market.logic = function () { }; market.draw = function () { };
  market.save = function () { return ''; }; market.load = function () { }; market.reset = function () { };
  market.minigameLoaded = true;
  Game.Objects['Bank'].minigame = market;

  /* ---------------- ミニゲーム : 神殿 ---------------- */
  const pantheon = { gods: {}, godsById: [], slot: [-1, -1, -1], swaps: 3, swapT: clock, lastSwapT: 1000, slotNames: ['Diamond', 'Ruby', 'Jade'], parent: Game.Objects['Temple'] };
  ['asceticism', 'decadence', 'ruin', 'ages', 'seasons', 'creation', 'labor', 'industry', 'mother', 'scorn', 'order'].forEach((k, i) => {
    const o = { id: i, key: k, name: 'God ' + k, slot: -1, icon: [0, 0], desc1: 'effect of ' + k };
    pantheon.gods[k] = o; pantheon.godsById[i] = o;
  });
  pantheon.slotGod = function (god, slot) {
    if (slot === god.slot) return false;
    if (slot !== -1 && pantheon.slot[slot] !== -1) {
      pantheon.godsById[pantheon.slot[slot]].slot = god.slot;
      if (god.slot !== -1) pantheon.slot[god.slot] = pantheon.slot[slot];
    } else if (god.slot !== -1) pantheon.slot[god.slot] = -1;
    if (slot !== -1) pantheon.slot[slot] = god.id;
    god.slot = slot;
    note('slotGod', { god: god.key, slot });
  };
  pantheon.useSwap = function (n) { pantheon.swapT = clock; pantheon.swaps = Math.max(0, pantheon.swaps - n); };
  pantheon.logic = function () { pantheon.lastSwapT++; }; pantheon.draw = function () { };
  pantheon.save = function () { return ''; }; pantheon.load = function () { }; pantheon.reset = function () { };
  pantheon.minigameLoaded = true;
  Game.Objects['Temple'].minigame = pantheon;
  Game.hasGod = function (what) {
    for (let i = 0; i < 3; i++) { const id = pantheon.slot[i]; if (id >= 0 && pantheon.godsById[id].key === what) return i + 1; }
    return 0;
  };

  /* ---------------- ミニゲーム : 魔法 ---------------- */
  const grim = { spells: {}, spellsById: [], magic: 100, magicM: 100, spellsCast: 0, spellsCastTotal: 0, parent: Game.Objects['Wizard tower'] };
  const SPELLS = [['conjure baked goods', 2, 0.4], ['hand of fate', 10, 0.6], ['stretch time', 8, 0.2], ['spontaneous edifice', 20, 0.75], ['haggler\'s charm', 10, 0.1], ['summon crafty pixies', 10, 0.2], ['gambler\'s fever dream', 3, 0.05], ['resurrect abomination', 20, 0.1], ['diminish ineptitude', 5, 0.2]];
  SPELLS.forEach((s, i) => {
    const o = {
      id: i, key: s[0], name: s[0].replace(/\b\w/g, c => c.toUpperCase()), costMin: s[1], costPercent: s[2],
      win: function () { Game.Earn(Math.min(Game.cookies * 0.15, Game.cookiesPs * 1800)); note('spellWin', o.key); return 1; },
      fail: function () { note('spellFail', o.key); return 1; },
    };
    grim.spells[s[0]] = o; grim.spellsById[i] = o;
  });
  grim.getSpellCost = function (sp) { return Math.floor(sp.costMin + grim.magicM * (sp.costPercent || 0)); };
  grim.getFailChance = function () { return 0.15; };
  grim.castSpell = function (sp) {
    const cost = grim.getSpellCost(sp);
    if (grim.magic < cost) return false;
    grim.magic -= cost;
    const out = Math.random() < 0.85 ? sp.win() : sp.fail();
    grim.spellsCast++; grim.spellsCastTotal++;
    return out;
  };
  grim.computeMagicM = function () { };
  grim.logic = function () { }; grim.draw = function () { };
  grim.save = function () { return ''; }; grim.load = function () { }; grim.reset = function () { };
  grim.minigameLoaded = true;
  Game.Objects['Wizard tower'].minigame = grim;

  /* ---------------- フレーム進行 ---------------- */
  Game.frame = function (frames) {
    frames = frames || 1;
    for (let f = 0; f < frames; f++) {
      Game.T++;
      advance(1000 / Game.fps);
      if (Game.AscendTimer > 0) {
        Game.AscendTimer++;
        if (Game.AscendTimer > Game.fps * 5) Game.finishAscendIntro();
      }
      if (Game.ReincarnateTimer > 0) { Game.ReincarnateTimer++; if (Game.ReincarnateTimer > Game.fps) Game.ReincarnateTimer = 0; }
      Game.CalculateGains();
      Game.Earn(Game.cookiesPs / Game.fps);
      if (Game.lumpRefill > 0) Game.lumpRefill--;
      const age = clock - Game.lumpT;
      if (age > Game.lumpOverripeAge) { Game.harvestLumps(1); Game.computeLumpType(); }
      Game.updateWrinklers();
      if (Game.autoclickerDetected > 0) Game.autoclickerDetected--;
      Game.refreshStore();
      // ミニゲームの tick (庭は 5 分毎)
      if (!garden.freeze && clock >= garden.nextStep) { garden.nextStep = clock + garden.stepT * 1000; garden.tickOnce(); }
      if (clock >= (market._nextTick || 0)) { market._nextTick = clock + market.secondsPerTick * 1000; market.tick(); }
      grim.magic = Math.min(grim.magicM, grim.magic + grim.magicM / 300);
      // 実ゲームと同様、準備できたミニゲームの logic を毎フレーム呼ぶ
      [garden, market, pantheon, grim].forEach(mm => { if (mm && mm.logic) mm.logic(); });
      Game.runModHook('logic');
      Game.runModHook('draw');
    }
  };

  return { Game, advance, clock: () => clock, garden, market, pantheon, grim };
}

module.exports = { makeMock };
