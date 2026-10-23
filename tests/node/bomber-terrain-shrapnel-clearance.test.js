'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function realCoreMethod(name, types) {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const marker = '    ' + name + '(' + (name === 'updateBullets' ? 'dt' : 'b') + ') {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core ' + name + ' missing');
  let end = start + marker.length, depth = 1;
  for (; end < html.length && depth; end++) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'unbalanced ' + name);
  return new Function('types_1', 'classes_1', 'M',
    'return function(' + (name === 'updateBullets' ? 'dt' : 'b') + '){' +
    html.slice(start + marker.length, end - 1) + '}')(
      types, { CLASSES: { scout: { size: 14 } } }, 2250);
}

const types = {
  TAU: Math.PI * 2, rnd: (a, b) => (a + b) / 2,
  dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2,
};
const coreUpdate = realCoreMethod('updateBullets', types);
const coreCluster = realCoreMethod('clusterBurst', types);

function boot(optimized) {
  function Game() {
    this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
    this.tmp = [];
    this.cam = { shake: 0 };
    this.nextId = 10;
    this.sfx = { explode() {} };
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles', 'addFlash',
    'addRing', 'splashAt', 'updateDrones', 'update', 'weakenBullet']) {
    Game.prototype[name] = function () {};
  }
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = () => null;
  Game.prototype.updateBullets = coreUpdate;
  Game.prototype.clusterBurst = coreCluster;
  function Sfx() {}
  Sfx.prototype.resume = function () {};
  const modules = {
    'game/audio': m => { m.exports = { Sfx }; },
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const ctx = { window: { __novaModules: modules }, console, Math, Map, Date,
    performance: { now: () => 0 } };
  const files = ['battlefield-v1.6.0.js'];
  if (optimized) files.push('performance-v1.7.5.js');
  for (const file of files) vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8'),
    ctx, { filename: file });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw Error('Unexpected dependency ' + spec);
  });
  return module.exports.Game;
}

function fire(Game, shape, fps, opts = {}) {
  const g = new Game();
  g.time = 1;
  g.__novaBattlefield = { coverBroken: 0 };
  const terrain = [{ id: -1, shape, x: 0, y: 0, w: 160, h: 160,
    r: 80, solid: true, destructible: false }];
  if (opts.neighbor) {
    // Flanking cover does not intersect the parent at y=0, but catches
    // upward/downward shrapnel after it exits the impact face.
    for (const y of [-10, 10]) terrain.push({
      id: y, shape: 'rect', x: -90, y, w: 20, h: 16,
      solid: true, destructible: false,
    });
  }
  g.__novaTerrain = opts.natural ? [] : terrain;
  g.bullets = [{
    id: 1, x: opts.natural ? -120 : -120, y: 0,
    vx: opts.natural ? 0 : 6000, vy: 0,
    r: 2, dmg: 12, ttl: opts.natural ? 0.001 : 2,
    shell: true, ownerId: 1, pen: 0, hits: 0, dead: false,
    color: '#aef', clusterDmg: 8,
  }];
  g.updateBullets(1 / fps);
  return g;
}

for (const optimized of [false, true]) {
  const label = optimized ? 'Battlefield + Performance' : 'Battlefield';
  for (const shape of ['rect', 'circle']) {
    for (const fps of [30, 60, 120, 240]) {
      test(label + ': outward Bomber shrapnel survives ' + shape + ' terrain at ' + fps + 'Hz', () => {
        const g = fire(boot(optimized), shape, fps);
        assert.equal(g.bullets.length, 3, 'three outward child rounds should remain');
        assert.ok(g.bullets.every(b => b.shell === false && !b.dead));
        assert.ok(g.bullets.every(b => b.vx < 0), 'inward rounds must hit cover');
        assert.ok(g.bullets.every(b => b.x < -80), 'survivors must remain outside cover');
      });
    }
  }
  test(label + ': natural expiry preserves all six shrapnel children', () => {
    const g = fire(boot(optimized), 'rect', 60, { natural: true });
    assert.equal(g.bullets.length, 6);
  });
  test(label + ': neighboring solid still blocks outward shrapnel', () => {
    const g = fire(boot(optimized), 'rect', 60, { neighbor: true });
    assert.equal(g.bullets.length, 1, 'flanking cover must stop the diagonal children');
  });
}
