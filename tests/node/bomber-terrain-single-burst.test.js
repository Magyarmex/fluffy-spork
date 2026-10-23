'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the exact materialized core updater: it moves dead projectiles in
// its first pass and can expire a shell already burst by Battlefield terrain.
function realCoreUpdater() {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core updater missing');
  let end = start + marker.length, depth = 1;
  for (; end < html.length && depth; end++) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'unbalanced core method');
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
      { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
      { CLASSES: { scout: { size: 14 } } }, 2250);
}
const coreUpdate = realCoreUpdater();

function boot(performanceLayer) {
  function Game() {
    this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
    this.tmp = [];
    this.cam = { shake: 0 };
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles', 'addFlash',
    'splashAt', 'updateDrones', 'update']) Game.prototype[name] = function () {};
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = () => null;
  Game.prototype.updateBullets = coreUpdate;
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
  if (performanceLayer) files.push('performance-v1.7.5.js');
  for (const file of files) vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8'),
    ctx, { filename: file });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('Unexpected dependency: ' + spec);
  });
  return module.exports.Game;
}

function fire(Game, opts = {}) {
  const g = new Game();
  g.time = 1;
  g.__novaBattlefield = { coverBroken: 0 };
  g.__novaTerrain = opts.terrain === false ? [] : [{
    id: -1, shape: 'rect', x: opts.wallX || 0, y: 0, w: 160, h: 160,
    solid: true, destructible: !!opts.destructible, hp: opts.destructible ? 5 : 0,
  }];
  let bursts = 0;
  g.clusterBurst = () => { bursts++; };
  g.weakenBullet = () => {};
  const b = { x: opts.x ?? -120, y: 0, vx: opts.vx ?? 6000, vy: 0,
    r: 2, dmg: 12, ttl: opts.ttl ?? 0.005, shell: true, ownerId: 1,
    pen: opts.pen ?? 0, hits: 0, dead: false };
  g.bullets = [b];
  g.updateBullets(1 / 60);
  return { bursts, b, g };
}

for (const optimized of [false, true]) {
  const label = optimized ? 'Battlefield + Performance' : 'Battlefield';
  test(label + ': terrain impact and same-tick TTL expiry burst once', () => {
    const { bursts, b, g } = fire(boot(optimized));
    assert.equal(bursts, 1, 'same shell burst at wall and again at TTL expiry');
    assert.equal(b.dead, true);
    assert.equal(g.bullets.length, 0);
  });
  test(label + ': terrain impact and arena boundary expiry burst once', () => {
    const { bursts, b } = fire(boot(optimized), { wallX: 2150, x: 2000,
      vx: 15000, ttl: 2 });
    assert.equal(bursts, 1, 'same shell burst at wall and arena exit');
    assert.equal(b.dead, true);
  });
  test(label + ': ordinary terrain shell burst remains intact', () => {
    const { bursts, b } = fire(boot(optimized), { ttl: 2 });
    assert.equal(bursts, 1);
    assert.equal(b.dead, true);
  });
  test(label + ': natural shell expiry without terrain still bursts', () => {
    const { bursts, b } = fire(boot(optimized), { terrain: false, ttl: 0.005 });
    assert.equal(bursts, 1);
    assert.equal(b.dead, true);
  });
  test(label + ': penetrating destructible cover retains shell until actual expiry', () => {
    const { bursts, b, g } = fire(boot(optimized), {
      destructible: true, pen: 3, ttl: 0.005,
    });
    assert.equal(g.__novaTerrain[0].solid, false);
    assert.equal(bursts, 1, 'penetrating shell must still burst at TTL');
    assert.equal(b.dead, true);
  });
}
