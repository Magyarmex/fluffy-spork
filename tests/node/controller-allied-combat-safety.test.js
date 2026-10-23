'use strict';
// Exercise the real Controller target selector, dash collision and windup paths.
// The test-only hooks are injected into the module wrapper at evaluation time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/controller-v1.3.0.js'), 'utf8');
const anchor = '    function simulateLegacyDrone(g, owner, d, dt) {';
assert.equal(source.split(anchor).length, 2, 'Controller test injection anchor must be unique');

function boot() {
  class Game {
    constructor() { this.time = 7; this.tanks = []; this.drones = []; this.tankById = new Map(); this.__novaTerrain = []; this.sfx = {}; }
    updateDrones() {}
    tryFire() {}
    damageTank() {}
    setClass() {}
    getTank(id) { return this.tankById.get(id) || null; }
  }
  class Input { attach() {} destroy() {} }
  class Sfx {}
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/input': m => { m.exports.Input = Input; },
    'game/audio': m => { m.exports.Sfx = Sfx; },
    'game/render': m => { m.exports.render = () => {}; }
  };
  const win = { __novaModules: modules };
  const instrumented = source.replace(anchor,
    '    window.__testControllerTarget = controllerTarget;\n' +
    '    window.__testFindDashHit = findDashHit;\n' +
    '    window.__testControllerDrone = simulateControllerDrone;\n' + anchor);
  vm.runInNewContext(instrumented, {
    window: win, console: { info() {}, warn() {}, error() {} },
    Math, Number, Map, Object, Array, Set, performance: { now: () => 0 }, document: {}
  }, { filename: 'controller-v1.3.0.js' });
  const mod = { exports: {} };
  modules['game/engine'](mod, mod.exports, name =>
    name.includes('classes') ? { CLASSES: {
      carrier: { size: 15, droneLeash: 650 },
      medium: { size: 15 }, marksman: { size: 15 }
    } } : name.includes('types') ? { TAU: Math.PI * 2, MAP_LIMIT: 2250 } : {});
  return { Game, win };
}
function scenario() {
  const { Game, win } = boot(), g = new Game();
  const owner = { id: 1, kind: 'tank', cls: 'carrier', alive: true, x: 0, y: 0, team: 'blue', swarmT: 0, isPlayer: true };
  const ally = { id: 2, kind: 'tank', cls: 'medium', alive: true, x: 10, y: 0, team: 'blue', spawnShieldT: 0 };
  const enemy = { id: 3, kind: 'tank', cls: 'medium', alive: true, x: 40, y: 0, team: 'red', spawnShieldT: 0 };
  g.tanks = [owner, ally, enemy];
  g.tankById = new Map(g.tanks.map(t => [t.id, t]));
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  const drone = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0, r: 5, hp: 20, speed: 200, dmg: 10 };
  const allyDrone = { id: 11, kind: 'drone', ownerId: 2, x: 18, y: 0, r: 5, hp: 20 };
  const enemyDrone = { id: 12, kind: 'drone', ownerId: 3, x: 60, y: 0, r: 5, hp: 20 };
  g.drones = [drone, allyDrone, enemyDrone];
  const state = { active: true, nodeX: 0, nodeY: 0, markId: -1, markUntil: 0 };
  return { g, win, owner, ally, enemy, drone, allyDrone, enemyDrone, state };
}
const target = s => s.win.__testControllerTarget(s.g, s.owner, s.state, { engage: 155 });
const hit = s => s.win.__testFindDashHit(s.g, s.owner, s.drone, 0, 0, 100, 0, false, 1);

test('command selector skips allied tank even if it is closest', () => {
  const s = scenario();
  assert.equal(target(s), s.enemy);
});
test('command selector skips allied drone but retains hostile drone', () => {
  const s = scenario();
  s.g.tanks = [s.owner, s.ally];
  assert.equal(target(s), s.enemyDrone);
});
test('marked ally never overrides hostility', () => {
  const s = scenario();
  s.state.markId = s.ally.id; s.state.markUntil = 100;
  assert.equal(target(s), s.enemy);
});
test('AI Fair Engagement slot cannot force an allied tank', () => {
  const s = scenario();
  s.owner.isPlayer = false;
  s.owner.ai = { __v1112TargetId: s.ally.id };
  assert.equal(target(s), s.enemyDrone);
});
test('dash ignores allied tank and drone while hitting first hostile tank', () => {
  const s = scenario();
  assert.equal(hit(s), s.enemy);
});
test('dash hits hostile drone when only allied tanks are present', () => {
  const s = scenario();
  s.g.tanks = [s.owner, s.ally];
  assert.equal(hit(s), s.enemyDrone);
});
test('explicit non-hostility blocks both command selection and dash', () => {
  const s = scenario();
  s.g.areAllies = () => false;
  s.g.areHostile = () => false;
  assert.equal(target(s), null);
  assert.equal(hit(s), null);
});
test('teamId fallback preserves team safety without relation hooks', () => {
  const s = scenario();
  delete s.g.areAllies; delete s.g.areHostile;
  for (const t of [s.owner, s.ally, s.enemy]) {
    t.teamId = t.team === 'blue' ? 1 : 2; delete t.team;
  }
  assert.equal(target(s), s.enemy);
  assert.equal(hit(s), s.enemy);
});
test('historical FFA without team metadata preserves hostile targeting', () => {
  const s = scenario();
  delete s.g.areAllies; delete s.g.areHostile;
  for (const t of [s.owner, s.ally, s.enemy]) delete t.team;
  assert.equal(target(s), s.ally);
  assert.equal(hit(s), s.ally);
});
test('orphan and dead-owner drones cannot become accidental targets', () => {
  const s = scenario();
  s.g.tanks = [s.owner, s.ally];
  s.g.tankById.delete(s.enemy.id);
  assert.equal(target(s), null);
  assert.equal(hit(s), null);
});
test('windup aborts if previously hostile target becomes allied', () => {
  const s = scenario();
  s.drone.__novaPhase = 'windup';
  s.drone.__novaPhaseT = .15;
  s.drone.__novaTarget = s.enemy;
  s.drone.__novaCommitted = false;
  s.enemy.team = 'blue';
  s.win.__testControllerDrone(s.g, s.owner, s.drone, [], s.enemy, s.state,
    { recover: .6, response: 8, lock: .1, dash: .3, diveSpeed: 1.7 }, .016, false);
  assert.equal(s.drone.__novaPhase, 'recover');
  assert.equal(s.drone.__novaTarget, null);
});
