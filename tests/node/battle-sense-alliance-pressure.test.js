const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBattleSense() {
  function Game() {}
  Game.prototype.tryFire = function () {};
  Game.prototype.updatePowerups = function () {};
  const modules = {
    'game/engine': function (module) { module.exports = { Game }; },
    'game/ai': function (module) { module.exports = { updateAI() {} }; },
    'game/classes': function (module) { module.exports = { CLASSES: {}, lineageForClass() { return null; } }; },
  };
  const context = { window: { __novaModules: modules }, console, Math };
  const src = fs.readFileSync(path.join(__dirname, '../../nova-updates/battle-sense-v1.8.1.js'), 'utf8');
  vm.runInNewContext(src, context, { filename: 'battle-sense-v1.8.1.js' });
  const cache = {};
  function load(id) {
    if (cache[id]) return cache[id].exports;
    const module = { exports: {} };
    cache[id] = module;
    modules[id](module, module.exports, (spec) => {
      if (spec === './classes') return load('game/classes');
      throw new Error(`unexpected require ${spec}`);
    });
    return module.exports;
  }
  load('game/engine');
  load('game/ai');
  return context.window.__NOVA_BATTLE_SENSE_TEST__;
}

function tank(id, teamId, x = 0, y = 0) {
  const t = { id, x, y, alive: true, hp: 100, maxHp: 100 };
  if (teamId !== undefined) t.teamId = teamId;
  return t;
}

test('Battle Sense local pressure excludes allies and counts visible hostiles', () => {
  const helper = loadBattleSense();
  const self = tank(1, 7);
  const ally = tank(2, 7, 80, 0);
  const enemy = tank(3, 9, 120, 0);
  const game = {
    tanks: [self, ally, enemy],
    areAllies: (a, b) => a.teamId != null && b.teamId != null && a.teamId === b.teamId,
    areHostile: (a, b) => a.teamId != null && b.teamId != null ? a.teamId !== b.teamId : true,
    hasLineOfSight: () => true,
  };
  assert.equal(helper.localCount(game, self, 560), 1);
  assert.equal(helper.hostile(game, self, ally), false);
  assert.equal(helper.hostile(game, self, enemy), true);
});

test('Battle Sense preserves free-for-all pressure without relationship metadata', () => {
  const helper = loadBattleSense();
  const self = tank(1, undefined);
  const a = tank(2, undefined, 70, 0);
  const b = tank(3, undefined, 140, 0);
  const game = { tanks: [self, a, b], hasLineOfSight: () => true };
  assert.equal(helper.localCount(game, self, 560), 2);
});

test('Battle Sense team-field fallback excludes same-side tanks when helpers are absent', () => {
  const helper = loadBattleSense();
  const self = tank(1, 4);
  const ally = tank(2, 4, 90, 0);
  const enemy = tank(3, 5, 100, 0);
  const game = { tanks: [self, ally, enemy], hasLineOfSight: () => true };
  assert.equal(helper.localCount(game, self, 560), 1);
});
