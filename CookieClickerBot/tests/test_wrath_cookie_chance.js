/* =====================================================================
   Cookie Clicker Bot - red/wrath cookie chance tests
     node tests/test_wrath_cookie_chance.js
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { makeMock } = require('./mock_game.js');

const mock = makeMock({ cookies: 1e9, cookiesEarned: 1e9 });
const { Game } = mock;
global.window = global;
global.document = { createElement: () => ({ style: {} }) };
const jsDir = path.join(__dirname, '..', 'ccbot', 'js');
const bundle = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
eval(bundle);
const Bot = global.__CCBOT;
Bot.install();

let pass = 0, fail = 0;
function ok(condition, label, extra) {
  if (condition) { pass++; console.log('  ✔ ' + label); }
  else { fail++; console.log('  ✘ ' + label + (extra === undefined ? '' : ' -- ' + String(extra))); }
}
function configureGolden(overrides) {
  const cfg = Bot.getConfig();
  cfg.master = true;
  cfg.golden = Object.assign({
    enabled: true, popGolden: true, popWrath: true,
    wrathPopChancePercent: 5, popReindeer: true, popOthers: false
  }, overrides || {});
  Bot.setConfig(cfg);
}

console.log('\n== Red/wrath cookie 5% chance tests ==');
ok(Bot.DEFAULTS.golden.wrathPopChancePercent === 5, 'default setting is 5 percent');

// Give 100 shimmer objects deterministic rolls: exactly five pass the 5% threshold.
configureGolden({ wrathPopChancePercent: 5, popGolden: false, popReindeer: false });
const oldRandom = Math.random;
let rolls = Array(5).fill(0.0499).concat(Array.from({ length: 95 }, (_, i) => 0.05 + (i / 100)));
let randomCalls = 0;
Math.random = () => { randomCalls++; return rolls.length ? rolls.shift() : 0.99; };
for (let i = 0; i < 100; i++) Game.spawnShimmer('golden', true);
Bot.modGolden();
ok(Game.shimmers.length === 95, '5 of 100 red cookies are collected at deterministic 5% sample', Game.shimmers.length);
ok(Bot.stats.wrath === 5, 'wrath collection counter increases only for the five collected cookies', Bot.stats.wrath);
ok(randomCalls === 100, 'each red cookie is rolled exactly once on first detection', randomCalls);

// A rejected cookie must not be rolled again on every 120 ms scheduler pass.
Math.random = () => { randomCalls++; return 0; };
Bot.modGolden();
ok(Game.shimmers.length === 95, 'the 95 rejected cookies stay untouched on later scheduler passes', Game.shimmers.length);
ok(randomCalls === 100, 'later passes do not reroll already evaluated red cookies', randomCalls);

// Regular golden cookies and reindeer must remain unaffected by the wrath chance.
configureGolden({ wrathPopChancePercent: 0, popGolden: true, popWrath: true, popReindeer: true });
const beforeGolden = Bot.stats.golden;
const beforeReindeer = Bot.stats.reindeer;
Game.spawnShimmer('golden', false);
Game.spawnShimmer('reindeer', false);
Bot.modGolden();
ok(Bot.stats.golden === beforeGolden + 1, 'ordinary golden cookies still collect at a 0% wrath setting');
ok(Bot.stats.reindeer === beforeReindeer + 1, 'reindeer collection remains unchanged');

// 0% means never; 100% means always for newly encountered red cookies.
configureGolden({ wrathPopChancePercent: 0, popGolden: false, popWrath: true });
Game.spawnShimmer('golden', true);
Bot.modGolden();
ok(Game.shimmers.length === 96, '0% leaves a newly spawned red cookie untouched', Game.shimmers.length);
configureGolden({ wrathPopChancePercent: 100, popGolden: false, popWrath: true });
Game.spawnShimmer('golden', true);
Bot.modGolden();
ok(Game.shimmers.length === 96, '100% collects a newly spawned red cookie', Game.shimmers.length);

// The existing popWrath toggle remains a master on/off switch and does not consume a roll.
configureGolden({ wrathPopChancePercent: 100, popGolden: false, popWrath: false });
const callsBeforeDisabled = randomCalls;
Game.spawnShimmer('golden', true);
Bot.modGolden();
ok(Game.shimmers.length === 97, 'popWrath=false still disables automatic red-cookie collection');
ok(randomCalls === callsBeforeDisabled, 'disabled red-cookie collection does not run a chance roll');

Math.random = oldRandom;
console.log('================================================');
console.log('Result: ' + pass + ' passed / ' + fail + ' failed');
process.exit(fail ? 1 : 0);
