const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/controller-v1.3.0.js'), 'utf8');

function boot() {
  const modules = {};
  modules['game/audio'] = function(module) { function Sfx() {} module.exports.Sfx = Sfx; };
  modules['game/render'] = function(module) { module.exports.render = function() {}; };
  modules['game/engine'] = function(module) {
    function Game() {}
    Game.prototype.tryFire = function() {};
    Game.prototype.damageTank = function() {};
    Game.prototype.setClass = function() {};
    Game.prototype.updateDrones = function() {};
    module.exports.Game = Game;
  };
  const defs = {
    carrier: { droneCount: 0, droneLeash: 650, droneRole: 'hunter', size: 15 },
    basic: { droneCount: 0, droneLeash: 0, size: 15 }
  };
  const classes = { CLASSES: defs, ABILITIES: {} };
  const window = { __novaModules: modules };
  vm.runInNewContext(source, { window, console: { info() {}, warn() {}, error() {} }, Math, Number, Object, Array, Map }, { filename: 'controller-v1.3.0.js' });

  const module = { exports: {} };
  modules['game/engine'](module, module.exports, request => {
    if (request === './classes') return classes;
    throw new Error('unexpected require: ' + request);
  });
  return module.exports.Game;
}

function tank(id, x, y, extra = {}) {
  return Object.assign({
    id, x, y, vx: 0, vy: 0, hp: 100, maxHp: 100, alive: true,
    spawnShieldT: 0, cls: 'basic', tier: 1, isPlayer: false,
    swarmT: 0, gene: null, droneRespawnT: 999,
    ai: { state: 'hunt', targetId: -1 }
  }, extra);
}

test('AI Controller swarm cannot reacquire a different tank outside Fair Engagement', () => {
  const Game = boot(), g = new Game();
  const fair = tank(2, 190, 0);
  const hidden = tank(3, 240, 35);
  const owner = tank(1, 0, 0, {
    cls: 'carrier', angle: 0,
    ai: { state: 'hunt', targetId: fair.id, __v1112TargetId: fair.id, isElite: false, strafe: 1 }
  });
  g.time = 10;
  g.quality = 'high';
  g.input = null;
  g.sfx = {};
  g.drones = [];
  g.droneCounts = new Map();
  g.tanks = [owner, fair, hidden];
  g.tankById = new Map(g.tanks.map(t => [t.id, t]));
  g.getTank = id => g.tankById.get(id) || null;

  // With dt=1 the legacy command node converges near (190, 59.4).
  // hidden is closer to that node than fair, while x=240 lies beyond a
  // 400px-wide viewport plus the 33px tank margin; fair x=190 remains visible.
  g.updateDrones(1);

  assert.equal(owner.__novaSwarm.targetId, fair.id,
    'swarm target identity must remain the Fair Engagement-selected tank');
});

test('player Controller targeting remains local and is not constrained by the AI fair slot', () => {
  assert.match(source, /fairTankOnly = !owner\.isPlayer/);
});

test('Fair Engagement gate skips only tank reacquisition so hostile-drone fallback remains available', () => {
  assert.match(source, /for \(var i = 0; !fairTankOnly && i < g\.tanks\.length; i\+\+\)/);
  assert.match(source, /for \(var j = 0; j < g\.drones\.length; j\+\+\)/);
});
