'use strict';
// Isolated regression for Garden seed-unlock lifecycle. It uses only the mock game,
// never connects to the real Cookie Clicker page and never touches real saves.
const fs = require('fs');
const path = require('path');
const { makeMock } = require('./mock_game.js');
const mock = makeMock({ cookies: 1e15, cookiesEarned: 1e15, prestige: 0, heavenlyChips: 0, lumps: 0, levels: { 2: 6 }, unlockSeeds: false });
const { Game, garden } = mock;
global.window = global;
global.document = { createElement: () => ({ style: {} }) };
const jsDir = path.join(__dirname, '..', 'ccbot', 'js');
const bundle = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
eval(bundle);
const Bot = global.__CCBOT;
const cfg = Bot.getConfig();
cfg.master = true;
cfg.garden = { enabled: true, mode: 'unlock', farmSeed: 'bakerWheat', harvestMature: false, soil: 'dirt', unlockAll: true, lumpFarm: false, maxPlantPerTick: 6, weedControl: true };
Bot.setConfig(cfg);
Bot.install();

let pass = 0, fail = 0;
function ok(condition, label) {
  if (condition) { pass++; console.log('PASS ' + label); }
  else { fail++; console.error('FAIL ' + label); }
}
function resetPlot() {
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) garden.plot[y][x] = [0, 0];
}

try {
  garden.freeze = 0;
  resetPlot();
  garden.plantsById.forEach(p => { p.unlocked = 0; });
  garden.plants.bakerWheat.unlocked = 1;
  garden.getUnlockedN();
  const target = garden.plants.thumbcorn;
  target.unlocked = 0;
  garden.getUnlockedN();

  const x = 3, y = 3;
  if (!garden.isTileUnlocked(x, y)) throw new Error('Mock Garden tile is unexpectedly locked');
  garden.plot[y][x] = [target.id + 1, Math.max(1, Math.floor(target.mature / 2))];
  Bot._gp.target = 'thumbcorn';
  Bot._gp.phase = 'waiting-mutation';
  Bot._gp.since = Date.now();
  Bot._gp.attempts = 0;
  Bot._gp.center = { x, y };
  Bot._gp.need = null;
  Bot._gp.reserved = { [x + ',' + y]: 'target' };

  Bot.modGarden();
  ok(!target.unlocked, 'immature target plant does not unlock the seed early');
  ok(garden.plot[y][x][0] === target.id + 1, 'immature target plant is preserved rather than harvested');
  ok(Bot._gp.phase === 'waiting-target-mature', 'planner enters waiting-target-mature phase');

  garden.plot[y][x][1] = target.mature;
  Bot.modGarden();
  ok(!!target.unlocked, 'mature target plant is harvested and unlocks the seed');
  ok(garden.plot[y][x][0] === 0, 'target plant is removed only after mature harvest');
  ok(Bot._gp.phase === 'waiting-seed-unlock', 'planner records that seed harvest was completed');
} catch (err) {
  console.error('TEST ERROR: ' + (err && err.stack || err));
  fail++;
}
console.log('RESULT: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
