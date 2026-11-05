'use strict';
// Read-only bridge between the conservative first-event certificate and the
// real materialized projectile updater. A green test documents the current
// discrepancy; it does NOT assert that the shipping bug is fixed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { observeProjectilePairs } = require('../research/projectile-pair-chronology-observer.cjs');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const marker = '    updateBullets(dt) {';
const start = html.indexOf(marker);
assert.ok(start >= 0, 'shipping bullet updater missing');
let end = start + marker.length, depth = 1;
while (depth && end < html.length) {
  if (html[end] === '{') depth++;
  else if (html[end] === '}') depth--;
  end++;
}
assert.equal(depth, 0, 'shipping updater must be extractable');
const update = new Function('types_1', 'classes_1', 'M',
  'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
  { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
  { CLASSES: { scout: { size: 15 } } }, 2250);

function boot() {
  class Game {
    constructor() {
      this.bullets = []; this.time = 1;
      this.__novaTerrain = []; this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
      this.tmp = []; this.tanks = []; this.drones = []; this.shapes = [];
      this.cam = { shake: 0 }; this.tankById = new Map();
    }
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup',
    'tryFire', 'updateDrones', 'update', 'moveTank', 'damageTank',
    'damageDrone', 'damageShape', 'setClass', 'addParticles', 'addRing',
    'addImpactDebris', 'splashAt', 'initBulletIntegrity', 'useAbility',
    'addFlash']) Game.prototype[name] = function() {};
  Game.prototype.resolveBulletCollisions = function() {};
  Game.prototype.updateBullets = update;
  Game.prototype.weakenBullet = function(b, damage) {
    b.hp -= damage;
    if (b.hp <= 0) b.dead = true;
  };
  Game.prototype.clusterBurst = function() {};
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  class Sfx { resume() {} }
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/render': m => { m.exports = { render() {} }; },
    'game/ai': m => { m.exports = { updateAI() {} }; }
  };
  const context = { window: { __novaModules: modules },
    console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Date, Number, Object,
    performance: { now: () => 0 }, document: {}, navigator: {} };
  for (const file of ['sniper-v1.2.0.js', 'polish-v1.3.1.js',
    'battlefield-v1.6.0.js', 'apex-disciplines-v1.7.1.js',
    'performance-v1.7.5.js', 'performance-v1.7.8.js',
    'precision-contact-v1.8.3.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  }
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => spec.includes('classes')
    ? { CLASSES: { scout: { size: 15 } }, lineageForClass: () => null }
    : { ARENA_HALF: 2250 });
  return new m.exports.Game();
}
function shot(id, ownerId, x, vx, ttl = .005) {
  return { id, kind: 'bullet', ownerId, x, y: 0, vx, vy: 0,
    r: 3, hp: id === 1 ? 1 : 3, maxHp: id === 1 ? 1 : 3,
    ttl, dmg: 8, pen: 0, hits: 0, shell: false, beam: false, dead: false };
}
const clear = Object.freeze({ allied: false, complete: true, unscanned: false,
  aTerrain: null, bTerrain: null, aBody: null, bBody: null,
  aOtherProjectile: null, bOtherProjectile: null });


for (const fps of [30, 60, 120, 240]) {
  test('composed Game pre-update observer is read-only at ' + fps + 'Hz', () => {
    const g = boot();
    g.bullets = [shot(1, 1, -20, 6000), shot(2, 2, 20, -6000)];
    const before = JSON.stringify(g.bullets);
    const observed = observeProjectilePairs(g, 1 / fps, () => clear);
    assert.equal(observed.incomplete, false);
    assert.equal(observed.certified.length, 1);
    assert.ok(Math.abs(observed.certified[0].time - 32.5 / 12000) < 1e-12);
    assert.equal(JSON.stringify(g.bullets), before);
    assert.doesNotThrow(() => g.updateBullets(1 / fps));
    assert.equal(observed.certified.length, 1, 'immutable observation survives shipping update');
  });
}
test('composed Game observer abstains when cover ordering is unknown', () => {
  const g = boot();
  g.__novaTerrain = [{ id: -2, shape: 'rect', x: -10, y: 0,
    w: 8, h: 60, solid: true, destructible: false }];
  g.bullets = [shot(1, 1, -20, 6000), shot(2, 2, 20, -6000)];
  const observed = observeProjectilePairs(g, 1 / 30,
    () => ({ ...clear, aTerrain: undefined }));
  assert.equal(observed.certified.length, 0);
  assert.equal(observed.incomplete, false);
});
test('composed Game observer refuses dense unverified pair work', () => {
  const g = boot();
  g.bullets = Array.from({ length: 32 }, (_, i) => shot(i + 1, i + 1, i * 100, 0));
  let calls = 0;
  const observed = observeProjectilePairs(g, 1 / 60, () => { calls++; return clear; });
  assert.equal(observed.incomplete, true);
  assert.equal(observed.reason, 'pair-budget');
  assert.equal(calls, 0);
});
