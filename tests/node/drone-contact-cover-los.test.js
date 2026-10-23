'use strict';
// Regression: short-range drone damage must not pass through solid Battlefield cover.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const swarmSource = fs.readFileSync(path.join(root, 'nova-updates/drone-discipline-v1.5.1.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'nova-updates/controller-v1.3.0.js'), 'utf8');
const solid = { solid: true, destructible: false, shape: 'rect', x: 4.5, y: 0, w: 2, h: 40 };

function swarm(kind, visible = false, options = {}) {
  class Game {
    constructor() {
      this.time = 10; this.drones = []; this.shapes = []; this.tanks = [];
      this.tankById = new Map(); this.hits = [];
      this.__novaTerrain = options.terrain ?? [solid];
      if (!options.noLos) this.hasLineOfSight = () => visible;
    }
    updateDrones() {}
    acquireDroneTarget() { return null; }
    damageDrone(t, n) { this.hits.push(['drone', t.id, n]); t.hp -= n; }
    damageShape(t, n) { this.hits.push(['shape', t.id, n]); t.hp -= n; }
  }
  const modules = { 'game/engine': m => { m.exports.Game = Game; } };
  const win = { __novaModules: modules };
  vm.runInNewContext(swarmSource, { window: win, console: { info() {}, error() {} }, Math, Map, Set, Number },
    { filename: 'drone-discipline-v1.5.1.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({}));
  const g = new Game();
  const owner = { id: 1, cls: 'carrier', alive: true, x: 0, y: 0, team: 'blue', swarmT: 0, __novaSwarm: { active: false, recallUntil: 0 } };
  const enemy = { id: 2, cls: 'marksman', alive: true, x: 20, y: 0, team: 'red' };
  const d = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0, hp: 30, r: 8, dmg: 12, speed: 0, attackCd: 0, leash: 650, role: 'hunter', slot: 0, __novaPhase: 'idle' };
  const target = kind === 'drone'
    ? { id: 11, kind: 'drone', ownerId: 2, x: 9, y: 0, hp: 30, r: 8 }
    : { id: 99, kind: 'shape', x: 9, y: 0, hp: 30, r: 10 };
  g.tanks = [owner, enemy]; g.tankById = new Map(g.tanks.map(t => [t.id, t]));
  g.drones = kind === 'drone' ? [d, target] : [d];
  if (kind === 'shape') g.shapes = [target];
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  g.updateDrones(.016);
  return { g, d, target };
}

function controller(kind, visible = false, options = {}) {
  const anchor = '    function simulateLegacyDrone(g, owner, d, dt) {';
  assert.equal(controllerSource.split(anchor).length, 2);
  const instrumented = controllerSource.replace(anchor,
    '    window.__testFarm = simulateFarm;\n    window.__testLegacy = simulateLegacyDrone;\n' + anchor);
  class Game { updateDrones() {} tryFire() {} damageTank() {} setClass() {} }
  class Input { attach() {} destroy() {} }
  class Sfx {}
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/input': m => { m.exports.Input = Input; },
    'game/audio': m => { m.exports.Sfx = Sfx; },
    'game/render': m => { m.exports.render = () => {}; }
  };
  const win = { __novaModules: modules };
  vm.runInNewContext(instrumented, {
    window: win, console: { info() {}, warn() {}, error() {} }, Math, Map, Set, Number, Object, Array,
    performance: { now: () => 0 }, document: {}
  }, { filename: 'controller-v1.3.0.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, name => name.includes('classes')
    ? { CLASSES: { carrier: { size: 15 }, marksman: { size: 15 } } } : {});
  const shape = { id: 99, kind: 'shape', x: 9, y: 0, r: 10, hp: 30 };
  const owner = { id: 1, cls: 'carrier', x: 0, y: 0, swarmT: 0 };
  const hits = [], g = {
    time: 10, __novaTerrain: options.terrain ?? [solid], shapes: [shape],
    damageShape(t, n) { hits.push([t.id, n]); t.hp -= n; },
    damageDrone() {}, damageTank() {}
  };
  if (!options.noLos) g.hasLineOfSight = () => visible;
  const d = { id: 10, ownerId: 1, kind: 'drone', x: 0, y: 0, r: 8, hp: 30, dmg: 10,
    speed: 0, attackCd: 0, leash: 650, retargetT: 1, targetRef: shape,
    role: 'hunter', slot: 0, orbitA: 0, orbitR: 40, __novaPhase: 'form', __novaFarmTarget: shape };
  if (kind === 'legacy') win.__testLegacy(g, owner, d, .016);
  else win.__testFarm(g, owner, d, [d], { response: 8 }, .016, false);
  return { hits, shape, d };
}
for (const kind of ['drone', 'shape']) {
  test('Swarm Discipline ' + kind + ' contact cannot damage through cover', () => {
    const s = swarm(kind);
    assert.deepEqual(s.g.hits, []);
    assert.equal(s.target.hp, 30);
    assert.equal(s.d.attackCd, 0, 'blocked attack cannot consume cooldown');
  });
  test('Swarm Discipline ' + kind + ' contact retains open-field damage', () => {
    assert.equal(swarm(kind, true).g.hits.length, 1);
  });
}
for (const kind of ['legacy', 'controller']) {
  test(kind + ' farm contact cannot damage through cover', () => {
    const s = controller(kind);
    assert.deepEqual(s.hits, []);
    assert.equal(s.d.attackCd, 0);
  });
  test(kind + ' farm contact retains open-field damage', () => {
    assert.deepEqual(controller(kind, true).hits, [[99, 10]]);
  });
}
test('no line-of-sight authority with live solid terrain fails closed', () => {
  assert.deepEqual(swarm('drone', false, { noLos: true }).g.hits, []);
  assert.deepEqual(controller('legacy', false, { noLos: true }).hits, []);
});
test('missing LOS API without solids retains open arena combat', () => {
  assert.equal(swarm('drone', false, { noLos: true, terrain: [] }).g.hits.length, 1);
  assert.equal(controller('legacy', false, { noLos: true, terrain: [] }).hits.length, 1);
});
test('destroyed cover is not a permanent combat blocker when LOS API is absent', () => {
  const terrain = [{ ...solid, destructible: true, hp: 0 }];
  assert.equal(swarm('shape', false, { noLos: true, terrain }).g.hits.length, 1);
  assert.equal(controller('controller', false, { noLos: true, terrain }).hits.length, 1);
});

test('actual Battlefield LOS and Swarm Discipline composition blocks wall-separated contact', () => {
  const battlefield = fs.readFileSync(path.join(root, 'nova-updates/battlefield-v1.6.0.js'), 'utf8');
  class Game {
    constructor() {
      this.time = 10; this.drones = []; this.tanks = []; this.shapes = [];
      this.tankById = new Map(); this.droneCounts = new Map(); this.hits = [];
      this.__novaTerrain = [{ id: -1000, kind: 'terrain', shape: 'rect', x: 4.5, y: 0,
        w: 2, h: 40, type: 'wall', destructible: false, solid: true, hp: 0 }];
    }
    updateDrones() {} updateBullets() {} update() {} moveTank() {}
    spawnPlayer() {} randSpawnPos() { return { x: 0, y: 0 }; }
    acquireDroneTarget() { return null; }
    damageDrone(d, n) { this.hits.push(['drone', d.id, n]); d.hp -= n; }
    damageShape(d, n) { this.hits.push(['shape', d.id, n]); d.hp -= n; }
    getTank(id) { return this.tankById.get(id); }
  }
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/ai': m => { m.exports.updateAI = () => {}; },
    'game/render': m => { m.exports.render = () => {}; },
    'game/audio': m => { m.exports.Sfx = class {}; }
  };
  const win = { __novaModules: modules };
  for (const src of [swarmSource, battlefield]) {
    vm.runInNewContext(src, { window: win, console: { info() {}, warn() {}, error() {} },
      Math, Map, Set, Number, Object, Date, performance: { now: () => 0 } });
  }
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, name => name.includes('classes')
    ? { CLASSES: { carrier: { size: 15 }, marksman: { size: 15 } } } : {});
  const g = new Game();
  const owner = { id: 1, cls: 'carrier', alive: true, x: 0, y: 0, team: 'blue',
    swarmT: 0, __novaSwarm: { active: false, recallUntil: 0 } };
  const enemy = { id: 2, cls: 'marksman', alive: true, x: 20, y: 0, team: 'red' };
  const d = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0, r: 8, hp: 30, dmg: 12,
    speed: 0, attackCd: 0, leash: 650, role: 'hunter', slot: 0, __novaPhase: 'idle' };
  const target = { id: 11, kind: 'drone', ownerId: 2, x: 9, y: 0, r: 8, hp: 30 };
  g.tanks = [owner, enemy]; g.tankById = new Map(g.tanks.map(t => [t.id, t]));
  g.drones = [d, target]; g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  assert.equal(g.hasLineOfSight(d.x, d.y, target.x, target.y, 2), false);
  g.updateDrones(.016);
  assert.deepEqual(g.hits, []);
  assert.equal(target.hp, 30);
});
