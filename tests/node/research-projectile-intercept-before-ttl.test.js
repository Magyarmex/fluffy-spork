'use strict';
// KNOWN-RED research gate: hostile projectile first contact must occur before
// either projectile's physical TTL expiry, independent of frame partition.
// Exercise the real materialized bullet updater and shipping combat overlays.
// No production gameplay or test expectations are weakened.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function shippingUpdater() {
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core updateBullets missing');
  let end = start + marker.length, depth = 1;
  while (depth && end < html.length) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0);
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
    { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
    { CLASSES: { scout: { size: 15 } } }, 2250);
}
const coreUpdate = shippingUpdater();

function boot(full = false) {
  class Game {
    constructor() {
      this.bullets = []; this.bursts = []; this.burstOrigins = []; this.time = 1;
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
  Game.prototype.updateBullets = coreUpdate;
  Game.prototype.weakenBullet = function(b, damage) {
    b.hp -= damage;
    if (b.hp <= 0) b.dead = true;
  };
  Game.prototype.clusterBurst = function(b) {
    this.bursts.push(b.id);
    this.burstOrigins.push({ id: b.id, x: b.x, y: b.y });
    if (this.__testSpawnChildren) for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      this.bullets.push({ id: this.nextId++, kind: 'bullet', ownerId: b.ownerId,
        x: b.x, y: b.y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250,
        dmg: 4, r: 3, pen: 1, ttl: .7, shell: false, dead: false });
    }
  };
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  class Sfx { resume() {} }
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/render': m => { m.exports = { render() {} }; },
    'game/ai': m => { m.exports = { updateAI() {} }; }
  };
  const context = {
    window: { __novaModules: modules },
    console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Date, Number, Object,
    performance: { now: () => 0 }, document: {}, navigator: {}
  };
  const files = ['sniper-v1.2.0.js'];
  if (full) files.push('polish-v1.3.1.js');
  files.push('battlefield-v1.6.0.js');
  if (full) files.push('apex-disciplines-v1.7.1.js',
    'performance-v1.7.5.js', 'performance-v1.7.8.js',
    'precision-contact-v1.8.3.js');
  for (const file of files) vm.runInNewContext(
    fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
    context, { filename: file });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => spec.includes('classes')
    ? { CLASSES: { scout: { size: 15 } }, lineageForClass: () => null }
    : { ARENA_HALF: 2250 });
  return new m.exports.Game();
}
function bullet(id, ownerId, x, vx, hp, shell = false) {
  return { id, kind: 'bullet', ownerId, x, y: 0, vx, vy: 0,
    r: 3, hp, maxHp: hp, ttl: 2, dmg: 8, pen: 0, shell, dead: false };
}

/* KNOWN RED / research only (#147, #158, #234).
 * Two hostile non-shell projectiles physically meet before BOTH TTLs.
 * Their earliest possible disc contact is (40 - 7.5) / 12000 =
 * 0.002708333... seconds, strictly before 0.005-second expiry.
 * A frame-rate-independent resolver must arbitrate that interception
 * before discarding either shot at expiry. The current shipping path
 * is expected to fail at 30/60/120Hz; do not merge this test while red.
 * No combat code is modified by this research. */
for (const full of [false, true]) {
  for (const fps of [30, 60, 120, 240]) {
    test('KNOWN RED: hostile projectile interception precedes both TTLs ' +
      (full ? 'full stack ' : 'Sniper/Battlefield ') + fps + 'Hz', () => {
      const g = boot(full), contacts = [];
      g.weakenBullet = function(b, damage) {
        contacts.push({ id: b.id, damage });
        b.hp -= damage;
        if (b.hp <= 0) b.dead = true;
      };
      const left = bullet(9001, 1, -20, 6000, 1, false);
      const right = bullet(9002, 2, 20, -6000, 3, false);
      left.ttl = right.ttl = .005;
      const physicalContactTime = (right.x - left.x -
        (left.r + right.r + 1.5)) / (left.vx - right.vx);
      assert.ok(physicalContactTime > 0 && physicalContactTime < left.ttl,
        'first hostile-disc contact must physically precede expiry');
      assert.ok(physicalContactTime < 1 / fps,
        'contact must occur within the observed simulation frame');
      g.bullets = [left, right];
      g.updateBullets(1 / fps);
      assert.equal(contacts.length, 2,
        'both projectiles must resolve physical interception before TTL');
      assert.deepEqual(contacts.map(c => c.id).sort(), [9001, 9002]);
      assert.equal(right.hp, 2,
        'surviving projectile loses one integrity point at first contact');
    });
  }
}

/* GREEN controls: chronological recovery must not manufacture contacts.
 * The far pair cannot meet until 7.708ms, after both 5ms TTLs.
 * Allied projectiles must not intercept even when geometry overlaps. */
for (const fps of [30, 60, 120, 240]) {
  for (const [name, x, owner] of [
    ['contact after expiry', 50, 2],
    ['allied owner', 20, 1]
  ]) {
    test('research safety: ' + name + ' at ' + fps + 'Hz', () => {
      const g = boot(true), contacts = [];
      g.weakenBullet = function(b, damage) {
        contacts.push(b.id);
        b.hp -= damage;
        if (b.hp <= 0) b.dead = true;
      };
      const left = bullet(9101, 1, -x, 6000, 1);
      const right = bullet(9102, owner, x, -6000, 3);
      left.ttl = right.ttl = .005;
      const firstContactTime = (2 * x - left.r - right.r - 1.5) / 12000;
      if (name === 'contact after expiry') {
        assert.ok(firstContactTime > left.ttl);
      } else {
        assert.ok(firstContactTime < left.ttl);
      }
      g.bullets = [left, right];
      for (let frame = 0; frame < Math.ceil(fps / 30); frame++) {
        g.updateBullets(1 / fps);
        if (!g.bullets.length) break;
      }
      assert.deepEqual(contacts, [],
        'no hostile interception is physically valid before TTL');
    });
  }
}

/* A one-sided expiry is also an ordering boundary. The 1ms projectile
 * disappears before the 2.708ms first contact even if its opponent lives
 * long enough. A future resolver must not revive that expired shot. */
for (const fps of [30, 60, 120, 240]) {
  test('research safety: shorter-lived hostile shot cannot intercept after expiry ' +
    fps + 'Hz', () => {
    const g = boot(true), contacts = [];
    g.weakenBullet = function(b, damage) {
      contacts.push(b.id);
      b.hp -= damage;
      if (b.hp <= 0) b.dead = true;
    };
    const left = bullet(9201, 1, -20, 6000, 1);
    const right = bullet(9202, 2, 20, -6000, 3);
    left.ttl = .001;
    right.ttl = .01;
    const firstContactTime = (40 - left.r - right.r - 1.5) / 12000;
    assert.ok(left.ttl < firstContactTime && firstContactTime < right.ttl);
    g.bullets = [left, right];
    for (let frame = 0; frame < Math.ceil(fps / 30); frame++) {
      g.updateBullets(1 / fps);
      if (!g.bullets.length) break;
    }
    assert.deepEqual(contacts, [],
      'a projectile cannot intercept after its own physical expiry');
  });
}

/* Same physical world, same total simulated time, different presentation
 * partitions. Correct first-contact arbitration must not depend on whether
 * the 2.708ms interception falls inside a long or short update interval. */
for (const partition of [
  [.008],
  [.004, .004],
  [.002, .002, .004],
  [.001, .007],
  [.001, .002, .005],
  [.003, .005]
]) {
  test('KNOWN RED: hostile TTL interception is frame-partition invariant ' +
    partition.join('+'), () => {
    const g = boot(true), contacts = [];
    g.weakenBullet = function(b, damage) {
      contacts.push(b.id);
      b.hp -= damage;
      if (b.hp <= 0) b.dead = true;
    };
    const left = bullet(9301, 1, -20, 6000, 1);
    const right = bullet(9302, 2, 20, -6000, 3);
    left.ttl = right.ttl = .005;
    g.bullets = [left, right];
    for (const dt of partition) {
      g.updateBullets(dt);
      if (!g.bullets.length) break;
    }
    assert.deepEqual(contacts.sort(), [9301, 9302],
      'interception before 5ms TTL must survive equivalent time partitions');
  });
}

/* Canonical-scale counterpart to the deliberately short-TTL stress case.
 * The materialized base shotgun uses 540u/s and 0.42s TTL. Two such
 * hostile shots 452.46u apart contact at 0.412s, before 0.42s expiry.
 * 30Hz is expected RED; 60/120/240Hz are positive controls. */
for (const fps of [30, 60, 120, 240]) {
  test('KNOWN RED: canonical-scale 540u/s 0.42s TTL interception at ' +
    fps + 'Hz', () => {
    const g = boot(true), contacts = [];
    g.weakenBullet = function(b, damage) {
      contacts.push(b.id);
      b.hp -= damage;
      if (b.hp <= 0) b.dead = true;
    };
    const left = bullet(9401, 1, -226.23, 540, 1);
    const right = bullet(9402, 2, 226.23, -540, 3);
    left.ttl = right.ttl = .42;
    const firstContactTime = (right.x - left.x -
      (left.r + right.r + 1.5)) / (left.vx - right.vx);
    assert.ok(Math.abs(firstContactTime - .412) < 1e-12);
    assert.ok(firstContactTime < left.ttl);
    g.bullets = [left, right];
    for (let frame = 0; frame < fps; frame++) {
      g.updateBullets(1 / fps);
      if (!g.bullets.length) break;
    }
    assert.deepEqual(contacts.sort(), [9401, 9402],
      'canonical-scale hostile shots must intercept before expiry');
  });
}
