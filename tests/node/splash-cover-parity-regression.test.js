'use strict';
// Issue #171: execute the materialized core splash method with actual
// Battlefield, Combined Arms, Blast Hardening and optional Performance layers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function load(performanceLayer) {
  const hi = html.indexOf('class SHash {');
  const he = html.indexOf('\n// ---------------- game', hi);
  const si = html.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {');
  const se = html.indexOf('\n    clusterBurst(b) {', si);
  assert.ok(hi >= 0 && he > hi && si >= 0 && se > si);
  const SHash = new Function(html.slice(hi, he) + '\nreturn SHash;')();
  const Game = new Function('types_1', 'return class Game {\n' + html.slice(si, se) + '\n}')({
    dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2,
  });
  Game.prototype.damageTank = function(t, damage) { t.hp -= damage; };
  Game.prototype.damageDrone = function(d, damage) { d.hp -= damage; d.hits = (d.hits || 0) + 1; };
  Game.prototype.killShape = function(s) { this.kills.push(s); };
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles', 'addFlash',
    'updateDrones', 'update', 'getTank', 'moveTank', 'updateBullets',
    'randSpawnPos', 'addRing']) Game.prototype[name] = function() {};
  function Sfx() {}
  Sfx.prototype.resume = function() {};
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const context = { window: { __novaModules: modules },
    console: { info() {}, error() {}, warn() {} },
    Math, Object, Map, Date, performance: { now: () => 0 } };
  const layers = ['battlefield-v1.6.0.js', 'combined-arms-v1.7.2.js',
    'blast-cover-hardening-v1.7.2.js'];
  if (performanceLayer) layers.push('performance-v1.7.5.js');
  for (const name of layers) vm.runInNewContext(
    fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
    context, { filename: name });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 15 } },
      lineageForClass() { return null; } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('Unexpected dependency ' + spec);
  });
  return { Game: m.exports.Game, SHash };
}
function scene(perf, terrain, blast = [0, 0], target = [50, 0], radius = 72, damage = 20) {
  const { Game, SHash } = load(perf), g = new Game();
  g.__novaTerrain = terrain.map((s, i) => ({
    id: -i - 1, solid: true, destructible: false, ...s,
  }));
  g.hash = new SHash(); g.tmp = []; g.tanks = []; g.kills = [];
  g.cam = { shake: 0 }; g.sfx = { explode() {} };
  const tank = { kind: 'tank', id: 2, cls: 'scout', x: target[0],
    y: target[1], hp: 100, alive: true };
  const shape = { kind: 'shape', id: 3, type: 'circle', r: 12,
    x: target[0], y: target[1], hp: 100, flash: 0 };
  const drone = { kind: 'drone', id: 4, r: 10, ownerId: 2,
    x: target[0], y: target[1], hp: 100 };
  g.tanks = [tank];
  for (const e of [tank, shape, drone]) g.hash.insert(e);
  const query = g.hash.query;
  g.splashAt(blast[0], blast[1], radius, .4, 1, 0, '#fff', damage);
  assert.equal(g.hash.query, query, 'spatial query must be restored');
  assert.equal(Object.hasOwn(g.hash, 'query'), false);
  assert.equal(Object.hasOwn(tank, 'r'), false, 'temporary tank radius restored');
  return { g, tank, shape, drone };
}
function wall(h = 150) { return [{ shape: 'rect', x: 20, y: 0, w: 8, h }]; }
for (const perf of [false, true]) {
  const mode = perf ? 'Battlefield + Performance' : 'Battlefield';
  test(mode + ': unoccluded splash damages all three entity kinds equally', () => {
    const { tank, shape, drone } = scene(perf, []);
    assert.ok(tank.hp < 100);
    assert.ok(Math.abs(tank.hp - shape.hp) < 1e-8);
    assert.ok(Math.abs(tank.hp - drone.hp) < 1e-8);
  });
  test(mode + ': permanent wall blocks tank, shape and drone', () => {
    const { tank, shape, drone, g } = scene(perf, wall());
    assert.deepEqual([tank.hp, shape.hp, drone.hp], [100, 100, 100]);
    assert.equal(g.kills.length, 0);
  });
  test(mode + ': partial edge exposure applies partial shape damage', () => {
    const { tank, shape, drone } = scene(perf, wall(4));
    assert.ok(tank.hp > 94 && tank.hp < 100);
    assert.ok(Math.abs(tank.hp - shape.hp) < 1e-8);
    assert.equal(drone.hp, 100, 'smaller drone hull remains covered');
  });
  test(mode + ': wall-face blast escapes outward but not inward', () => {
    const outward = scene(perf, wall(), [16, 0], [0, 0]);
    assert.ok(outward.tank.hp < 100 && outward.shape.hp < 100 && outward.drone.hp < 100);
    const inward = scene(perf, wall(), [16, 0], [50, 0]);
    assert.deepEqual([inward.tank.hp, inward.shape.hp, inward.drone.hp], [100, 100, 100]);
  });
  test(mode + ': pillar blocks occluded splash', () => {
    const { tank, shape, drone } = scene(perf,
      [{ shape: 'circle', x: 20, y: 0, r: 12 }]);
    assert.deepEqual([tank.hp, shape.hp, drone.hp], [100, 100, 100]);
  });
  test(mode + ': destroyed cover no longer occludes', () => {
    const { tank, shape, drone } = scene(perf,
      [{ shape: 'rect', x: 20, y: 0, w: 8, h: 150,
        destructible: true, hp: 0, solid: false }]);
    assert.ok(tank.hp < 100 && shape.hp < 100 && drone.hp < 100);
  });
  test(mode + ': drone owner immunity and shape kill semantics preserved', () => {
    const { Game, SHash } = load(perf), g = new Game();
    g.__novaTerrain = []; g.hash = new SHash(); g.tmp = [];
    g.cam = { shake: 0 }; g.sfx = { explode() {} }; g.kills = []; g.tanks = [];
    const shape = { kind: 'shape', id: 3, type: 'circle', r: 12,
      x: 20, y: 0, hp: 1, flash: 0 };
    const ally = { kind: 'drone', id: 4, ownerId: 1, r: 10, x: 20, y: 0, hp: 100 };
    g.hash.insert(shape); g.hash.insert(ally);
    g.splashAt(0, 0, 72, .4, 1, 0, '#fff', 20);
    assert.ok(shape.hp <= 0);
    assert.equal(g.kills.length, 1);
    assert.equal(g.kills[0], shape, 'kill receives original entity identity');
    assert.equal(ally.hp, 100);
  });
}
test('exception restores spatial query, tank radii and blast context', () => {
  const { Game, SHash } = load(false), g = new Game();
  g.hash = new SHash(); g.tmp = []; g.tanks = [];
  g.cam = { shake: 0 }; g.sfx = { explode() {} };
  const tank = { kind: 'tank', cls: 'scout', id: 2, x: 20, y: 0, alive: true, hp: 100 };
  g.tanks = [tank]; g.hash.insert(tank);
  const query = g.hash.query;
  g.damageTank = () => { throw new Error('synthetic failure'); };
  assert.throws(() => g.splashAt(0, 0, 72, .4, 1, 0, '#fff', 20), /synthetic failure/);
  assert.equal(g.hash.query, query);
  assert.equal(Object.hasOwn(tank, 'r'), false);
  assert.equal(g.__v172HardBlast.active, false);
});

test('mixed splash contacts retain original spatial order: shape, tank, drone', () => {
  const { Game, SHash } = load(false), g = new Game(), events = [];
  g.__novaTerrain = []; g.hash = new SHash(); g.tmp = []; g.kills = [];
  g.cam = { shake: 0 }; g.sfx = { explode() {} };
  const shape = { kind: 'shape', id: 3, type: 'circle', r: 12,
    x: 20, y: 0, hp: 1, flash: 0 };
  const tank = { kind: 'tank', id: 2, cls: 'scout', x: 20, y: 0,
    hp: 100, alive: true };
  const drone = { kind: 'drone', id: 4, r: 10, ownerId: 2,
    x: 20, y: 0, hp: 100 };
  g.tanks = [tank];
  for (const e of [shape, tank, drone]) g.hash.insert(e);
  g.killShape = () => { events.push('shape'); };
  g.damageTank = (t, d) => { events.push('tank'); t.hp -= d; };
  g.damageDrone = (d, n) => { events.push('drone'); d.hp -= n; };
  g.splashAt(0, 0, 72, .4, 1, 0, '#fff', 20);
  assert.deepEqual(events, ['shape', 'tank', 'drone']);
});
test('nested same-origin splashes isolate their spatial query and restore state', () => {
  const { Game, SHash } = load(false), g = new Game();
  g.__novaTerrain = []; g.hash = new SHash(); g.tmp = []; g.tanks = [];
  g.kills = []; g.cam = { shake: 0 }; g.sfx = { explode() {} };
  const shape = { kind: 'shape', id: 3, type: 'circle', r: 12,
    x: 20, y: 0, hp: 100, flash: 0 };
  g.hash.insert(shape);
  let nested = false;
  g.addRing = () => {
    if (nested) return;
    nested = true;
    g.splashAt(0, 0, 72, .4, 1, 0, '#fff', 20);
  };
  const originalQuery = g.hash.query;
  g.splashAt(0, 0, 72, .4, 1, 0, '#fff', 20);
  const one = 20 * .4 * (1 - 20 / 72 * .5);
  assert.ok(Math.abs(shape.hp - (100 - 2 * one)) < 1e-9,
    'each blast must independently apply exactly one contact');
  assert.equal(g.hash.query, originalQuery);
  assert.equal(g.__v172HardBlast.active, false);
});
