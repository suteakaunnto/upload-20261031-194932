'use strict';
const fs = require('fs');
const path = require('path');
const { makeMock } = require('./mock_game.js');

const { Game } = makeMock({ cookies: 1e9, cookiesEarned: 1e9, prestige: 0, heavenlyChips: 0, lumps: 0 });
global.window = global;
global.document = { createElement: () => ({ style: {} }) };
const jsDir = path.join(__dirname, '..', 'ccbot', 'js');
const bundle = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
eval(bundle);
const Bot = global.__CCBOT;
let pass = 0, fail = 0;
function check(condition, label, detail) {
  if (condition) { pass++; console.log('  ✔ ' + label); }
  else { fail++; console.log('  ✘ ' + label + (detail === undefined ? '' : ' -- ' + JSON.stringify(detail))); }
}

console.log('== Ascension completion & backup safety tests ==');
Bot.cfg.master = true;
Bot.cfg.ascend = {
  enabled: true, mode: 'percent', percent: 50, minGain: 1,
  minAbsolutePrestige: 0, firstAscendMinPrestige: 365,
  cooldownSec: 0, maxPerDay: 0, backupFirst: true, backupTimeoutSec: 5,
  autoReincarnate: true, reincarnateDelaySec: 0, prestigeOnAscend: true
};
Bot.cfg.prestige = {
  enabled: true, strategy: 'priority', reserveChips: 0, maxPerTick: 12,
  blacklist: [], permanentUpgrades: [], autoAssignPermanent: false, priorityList: []
};
Game.OnAscend = 0; Game.AscendTimer = 0; Game.ReincarnateTimer = 0;
Game.resets = 0; Game.prestige = 0;
const originalHowMuchPrestige = Game.HowMuchPrestige;
Game.HowMuchPrestige = () => 200;
let eligibility = Bot.canAscendNow();
check(!eligibility.ok && /first ascension threshold/.test(eligibility.why || ''),
  'first ascension is blocked below the configured prestige target', eligibility);
Game.HowMuchPrestige = () => 365;
eligibility = Bot.canAscendNow();
check(eligibility.ok, 'first ascension becomes eligible at the configured prestige target', eligibility);
Game.resets = 1;
Game.HowMuchPrestige = () => 200;
eligibility = Bot.canAscendNow();
check(eligibility.ok, 'first-ascension-only target does not block later ascensions', eligibility);
Game.HowMuchPrestige = originalHowMuchPrestige;

// A backup timeout must hold the requested ascension rather than proceeding without a verified backup.
Game.resets = 1; Game.OnAscend = 0; Game.AscendTimer = 0; Game.ReincarnateTimer = 0;
Bot.pendingAscend = { at: Date.now() - 60000, reason: 'test', gain: 1, projected: 1, cleared: false, attempts: 0 };
Bot.modAscend();
check(!!Bot.pendingAscend && Game.AscendTimer === 0 && Game.OnAscend === 0,
  'backup timeout holds ascension and preserves pending request');
Bot.pendingAscend = null;

// Simulate 27 currently affordable prestige upgrades with maxPerTick=12.
const fakeUpgrades = [];
for (let i = 0; i < 27; i++) {
  const up = {
    id: 5000 + i, name: 'Test prestige ' + i, dname: 'Test prestige ' + i,
    pool: 'prestige', bought: 0, unlocked: 1, parents: [], basePrice: 1,
    getPrice() { return 1; },
    buy() { if (Game.heavenlyChips < 1) return false; Game.heavenlyChips -= 1; this.bought = 1; return true; }
  };
  fakeUpgrades.push(up);
}
Game.PrestigeUpgrades = fakeUpgrades;
Game.heavenlyChips = 1000;
// The only owned permanent slot should not remain empty just because none of the named recommendations is owned.
if (Game.Upgrades['Permanent upgrade slot I']) Game.Upgrades['Permanent upgrade slot I'].bought = 1;
if (Game.Upgrades['Reinforced index finger']) Game.Upgrades['Reinforced index finger'].bought = 1;
Game.permanentUpgrades = [-1, -1, -1, -1, -1];
Bot.cfg.prestige.autoAssignPermanent = true;
Bot.assignPermanentUpgrades();
check(Game.permanentUpgrades[0] === (Game.Upgrades['Reinforced index finger'] && Game.Upgrades['Reinforced index finger'].id),
  'permanent slot is filled with an eligible owned upgrade when no recommended choice is owned', Game.permanentUpgrades[0]);
Bot.cfg.prestige.autoAssignPermanent = false;
Game.OnAscend = 1; Game.AscendTimer = 0; Game.ReincarnateTimer = 0;
Game.resets = 1;
const beforeResets = Game.resets;
Bot.ascendState.reincarnateAt = 0;
Bot.ascendState.purchaseWaitState = '';
Bot.modAscend();
check(fakeUpgrades.filter(u => u.bought).length === 12 && Game.resets === beforeResets,
  'first purchase pass buys at most 12 and does not reincarnate early', fakeUpgrades.filter(u => u.bought).length);
Bot.modAscend();
check(fakeUpgrades.filter(u => u.bought).length === 24 && Game.resets === beforeResets,
  'second purchase pass continues buying and does not reincarnate early', fakeUpgrades.filter(u => u.bought).length);
Bot.modAscend();
check(fakeUpgrades.every(u => u.bought) && Game.resets === beforeResets,
  'third purchase pass buys the remaining upgrades but waits for a final verification', fakeUpgrades.filter(u => u.bought).length);
Bot.modAscend();
check(fakeUpgrades.every(u => u.bought) && Game.resets === beforeResets + 1 && Game.OnAscend === 0,
  'reincarnation occurs only after the final check finds no affordable prestige upgrades', { bought: fakeUpgrades.filter(u => u.bought).length, resets: Game.resets });

console.log('================================================');
console.log(`Result: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
