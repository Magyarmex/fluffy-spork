'use strict';
// The canonical core's native acquireDroneTarget ranks combatants from a
// spatial hash without checking terrain. Tank positions are public on the
// minimap, but hostile drone coordinates are not; only hidden native drones
// must be rejected. The fallback remains visibility-gated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/drone-targeting-v1.5.1.js'), 'utf8');

function scenario(nativeTarget) {
  class Game { acquireDroneTarget() { return nativeTarget; } }
  const mods = { 'game/engine': m => { m.exports.Game = Game; } };
  const win = { __novaModules: mods };
  vm.runInNewContext(source, { window: win, console: { info() {}, error() {} }, Math },
    { filename: 'drone-targeting-v1.5.1.js' });
  const m = { exports: {} };
  mods['game/engine'](m, m.exports, () => ({}));
  const g = new m.exports.Game();
  const owner = { id: 1, kind: 'tank', alive: true, team: 'blue', x: 0, y: 0 };
  const drone = { id: 10, kind: 'drone', ownerId: 1, hp: 30, x: 0, y: 0, leash: 500 };
  g.tanks = [owner]; g.drones = [drone]; g.shapes = [];
  g.tankById = new Map([[1, owner]]);
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  g.hasLineOfSight = () => true;
  return { g, owner, drone, acquire: () => g.acquireDroneTarget(drone, owner, 500) };
}
function tank(id, x, spawnShieldT = 0) {
  return { id, kind: 'tank', alive: true, team: 'red', hp: 100,
    spawnShieldT, x, y: 0 };
}
function shape(id, x) { return { id, kind: 'shape', hp: 20, x, y: 0 }; }
function hostileDrone(id, x) {
  return { id, kind: 'drone', ownerId: 2, hp: 20, x, y: 0 };
}

test('public-minimap tank remains a valid native pursuit target behind cover', () => {
  const hidden = tank(2, 40), visible = tank(3, 120), s = scenario(hidden);
  s.g.tanks.push(hidden, visible);
  s.g.hasLineOfSight = (ax, ay, bx) => bx !== 40;
  assert.equal(s.acquire(), hidden);
});

test('occluded native hostile drone yields to a visible combatant', () => {
  const hidden = hostileDrone(20, 40), visible = tank(3, 120), s = scenario(hidden);
  s.g.tanks.push(tank(2, 400), visible);
  s.g.tankById.set(2, s.g.tanks[1]);
  s.g.drones.push(hidden);
  s.g.hasLineOfSight = (ax, ay, bx) => bx !== 40 && bx !== 400;
  assert.equal(s.acquire(), visible);
});

test('occluded native drone cannot suppress legitimate neutral farming', () => {
  const hidden = hostileDrone(20, 40), harvest = shape(9, 60), s = scenario(hidden);
  const enemyOwner = tank(2, 400);
  s.g.tanks.push(enemyOwner); s.g.tankById.set(2, enemyOwner);
  s.g.drones.push(hidden); s.g.shapes.push(harvest);
  s.g.hasLineOfSight = (ax, ay, bx) => bx !== 40 && bx !== 400;
  assert.equal(s.acquire(), harvest);
});

test('spawn-shielded hostile is excluded from fallback combat selection', () => {
  const protectedTank = tank(2, 40, 2), harvest = shape(9, 60);
  const s = scenario(protectedTank);
  s.g.tanks.push(protectedTank); s.g.shapes.push(harvest);
  assert.equal(s.acquire(), harvest);
});

test('valid visible native combat target remains authoritative', () => {
  const visible = tank(2, 80), s = scenario(visible);
  s.g.tanks.push(visible);
  assert.equal(s.acquire(), visible);
});

test('native neutral-shape target remains valid through routing around cover', () => {
  const harvest = shape(9, 80), s = scenario(harvest);
  s.g.shapes.push(harvest);
  s.g.hasLineOfSight = () => false;
  assert.equal(s.acquire(), harvest, 'Terrain Intelligence may route farming around cover');
});

test('absent visibility API with solid terrain cannot reveal hidden drones', () => {
  const hidden = hostileDrone(20, 40), s = scenario(hidden);
  const enemyOwner = tank(2, 400);
  s.g.tanks.push(enemyOwner); s.g.tankById.set(2, enemyOwner);
  s.g.drones.push(hidden);
  delete s.g.hasLineOfSight;
  s.g.__novaTerrain = [{ solid: true, destructible: false }];
  assert.equal(s.acquire(), null);
});

test('no visibility API in an open arena preserves ordinary hostile acquisition', () => {
  const visible = tank(2, 80), s = scenario(visible);
  s.g.tanks.push(visible);
  delete s.g.hasLineOfSight; s.g.__novaTerrain = [];
  assert.equal(s.acquire(), visible);
});


test('actual Battlefield wall hides a native drone until cover destruction', () => {
  const battlefield = fs.readFileSync(path.join(__dirname,
    '../../nova-updates/battlefield-v1.6.0.js'), 'utf8');
  const hidden = hostileDrone(20, 90);
  class Game {
    constructor() {
      this.tanks = []; this.drones = []; this.shapes = [];
      this.tankById = new Map(); this.time = 10;
      this.__novaTerrain = [{ id: -1000, kind: 'terrain', shape: 'rect',
        x: 45, y: 0, w: 10, h: 70, type: 'cover',
        destructible: true, hp: 100, maxHp: 100, solid: true }];
    }
    acquireDroneTarget() { return hidden; }
    updateDrones() {} updateBullets() {} update() {} moveTank() {}
    spawnPlayer() {} spawnShape() {} spawnPowerup() {} tryFire() {}
    randSpawnPos() { return { x: 0, y: 0 }; }
  }
  const mods = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/ai': m => { m.exports.updateAI = () => {}; },
    'game/render': m => { m.exports.render = () => {}; },
    'game/audio': m => { m.exports.Sfx = class {}; }
  };
  const win = { __novaModules: mods };
  for (const src of [source, battlefield]) {
    vm.runInNewContext(src, { window: win,
      console: { info() {}, warn() {}, error() {} },
      Math, Map, Set, Number, Object, Date,
      performance: { now: () => 0 } });
  }
  const m = { exports: {} };
  mods['game/engine'](m, m.exports, name => name.includes('classes')
    ? { CLASSES: { carrier: { size: 15 }, marksman: { size: 15 } } } : {});
  const g = new Game();
  const owner = { id: 1, kind: 'tank', cls: 'carrier', alive: true,
    team: 'blue', x: 0, y: 0 };
  const visible = { ...tank(3, 90), y: 130 };
  const drone = { id: 10, kind: 'drone', ownerId: 1,
    hp: 30, x: 0, y: 0, leash: 500 };
  const enemyOwner = tank(2, 400);
  g.tanks = [owner, enemyOwner, visible]; g.drones = [drone, hidden];
  g.tankById = new Map(g.tanks.map(t => [t.id, t]));
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  assert.equal(g.hasLineOfSight(0, 0, hidden.x, hidden.y, 2), false);
  assert.equal(g.hasLineOfSight(0, 0, visible.x, visible.y, 2), true);
  assert.equal(g.acquireDroneTarget(drone, owner, 500), visible);
  g.__novaTerrain[0].hp = 0; g.__novaTerrain[0].solid = false;
  assert.equal(g.acquireDroneTarget(drone, owner, 500), hidden);
});
