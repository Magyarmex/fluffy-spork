'use strict';
// Read-only bridge between the conservative first-event certificate and the
// real materialized projectile updater. A green test documents the current
// discrepancy; it does NOT assert that the shipping bug is fixed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { firstContact } = require('../research/projectile-first-event-certificate.cjs');
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
  test('shipping comparison at ' + fps + 'Hz: certified contact and observed interception', () => {
    const g = boot(), left = shot(1, 1, -20, 6000), right = shot(2, 2, 20, -6000);
    const before = JSON.stringify([left, right]);
    const t = firstContact(left, right, 1 / fps, clear);
    assert.ok(Math.abs(t - 32.5 / 12000) < 1e-12);
    assert.equal(JSON.stringify([left, right]), before,
      'read-only certificate must not mutate shipping projectiles');
    const hits = [];
    const weaken = g.weakenBullet.bind(g);
    g.weakenBullet = function(b, damage) {
      hits.push(b.id);
      return weaken(b, damage);
    };
    g.bullets = [left, right];
    g.updateBullets(1 / fps);
    // Explicit observation of the current defect, NOT an acceptance gate.
    // Known-red PR #724 holds the correct future behavior assertions.
    assert.equal(hits.length, fps === 240 ? 2 : 0);
    if (fps === 240) assert.deepEqual(hits.sort(), [1, 2]);
  });
}
test('certificate abstains when terrain precedence is unknown', () => {
  const a = shot(1, 1, -20, 6000), b = shot(2, 2, 20, -6000);
  assert.equal(firstContact(a, b, 1 / 30, { ...clear, aTerrain: undefined }), null);
  assert.equal(firstContact(a, b, 1 / 30, { ...clear, aTerrain: .002 }), null);
  assert.equal(firstContact(a, b, 1 / 30, { ...clear, complete: false }), null);
});

test('unequal-TTL endpoint clamping creates a false simultaneous interception', () => {
  const a = shot(1, 1, -20, 6000, .001);
  const b = shot(2, 2, 20, -6000, .005);
  const physicalFirst = (40 - a.r - b.r - 1.5) / (a.vx - b.vx);
  assert.ok(physicalFirst > a.ttl && physicalFirst < b.ttl);
  // A tempting shortcut is to clamp each shot independently at its TTL
  // and pass those endpoints into the existing swept collision predicate.
  // Those endpoints represent DIFFERENT physical times: this would create
  // an interception that never happened while both shots were alive.
  const aEnd = a.x + a.vx * a.ttl;
  const bEnd = b.x + b.vx * b.ttl;
  assert.ok(Math.abs(aEnd - bEnd) < a.r + b.r + 1.5,
    'asynchronous endpoints falsely overlap');
  assert.equal(firstContact(a, b, 1 / 30, clear), null,
    'chronological certificate correctly rejects the post-expiry contact');
});
