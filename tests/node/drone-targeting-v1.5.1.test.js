const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/drone-targeting-v1.5.1.js'), 'utf8');

function boot(nativeTarget) {
  class Game {
    acquireDroneTarget() { return nativeTarget; }
  }
  const modules = {
    'game/engine'(module) { module.exports = { Game }; },
  };
  const window = { __novaModules: modules };
  vm.runInNewContext(source, { window, console: { info(){}, error(){} }, Math }, { filename: 'drone-targeting-v1.5.1.js' });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, () => ({}));
  return { Game: module.exports.Game, hooks: window.__NOVA_DRONE_TARGET_FILTER_TEST__ };
}

function baseGame(Game, nativeTarget) {
  const g = new Game();
  g.tanks = [];
  g.drones = [];
  g.shapes = [];
  g.tankById = new Map();
  g.areAllies = (a, b) => a.team != null && b.team != null && a.team === b.team;
  g.areHostile = (a, b) => a.team == null || b.team == null || a.team !== b.team;
  g.hasLineOfSight = () => true;
  return g;
}

const spotter = { id: 99, kind: 'drone', __novaSpotter: true, ownerId: 9, x: 20, y: 0, hp: 10 };
const owner = { id: 1, kind: 'tank', team: 'blue', alive: true, x: 0, y: 0 };
const drone = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0, hp: 20, leash: 500 };

test('spotter decoy cannot make an autonomous drone farm a shape while a visible hostile tank is in leash', () => {
  const { Game } = boot(spotter);
  const g = baseGame(Game);
  const hostile = { id: 2, kind: 'tank', team: 'red', alive: true, x: 180, y: 0 };
  const shape = { id: 3, kind: 'shape', hp: 20, x: 40, y: 0 };
  g.tanks = [owner, hostile];
  g.shapes = [shape];
  assert.equal(g.acquireDroneTarget(drone, owner, 500), hostile);
});

test('combat fallback respects visibility and preserves the historical neutral-shape fallback', () => {
  const { Game } = boot(spotter);
  const g = baseGame(Game);
  const hostile = { id: 2, kind: 'tank', team: 'red', alive: true, x: 120, y: 0 };
  const shape = { id: 3, kind: 'shape', hp: 20, x: 80, y: 0 };
  g.tanks = [owner, hostile];
  g.shapes = [shape];
  g.hasLineOfSight = (ax, ay, bx) => bx !== hostile.x;
  assert.equal(g.acquireDroneTarget(drone, owner, 500), shape);
});

test('allied tanks are never introduced as fallback targets', () => {
  const { Game } = boot(spotter);
  const g = baseGame(Game);
  const ally = { id: 4, kind: 'tank', team: 'blue', alive: true, x: 80, y: 0 };
  const shape = { id: 3, kind: 'shape', hp: 20, x: 140, y: 0 };
  g.tanks = [owner, ally];
  g.shapes = [shape];
  assert.equal(g.acquireDroneTarget(drone, owner, 500), shape);
});

test('nearest visible hostile non-spotter drone can take over from a spotter', () => {
  const { Game } = boot(spotter);
  const g = baseGame(Game);
  const enemyOwner = { id: 5, kind: 'tank', team: 'red', alive: true, x: 300, y: 0 };
  const enemyDrone = { id: 6, kind: 'drone', ownerId: 5, hp: 12, x: 90, y: 0 };
  g.tanks = [owner, enemyOwner];
  g.tankById.set(1, owner);
  g.tankById.set(5, enemyOwner);
  g.drones = [drone, spotter, enemyDrone];
  assert.equal(g.acquireDroneTarget(drone, owner, 500), enemyDrone);
});

test('native non-spotter selection is returned unchanged', () => {
  const native = { id: 7, kind: 'tank', team: 'red', alive: true, x: 50, y: 0 };
  const { Game } = boot(native);
  const g = baseGame(Game);
  assert.equal(g.acquireDroneTarget(drone, owner, 500), native);
});
