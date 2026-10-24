'use strict';
// KNOWN RED — research gate for #234 and #147. Do not merge until chronological
// first-contact arbitration passes at all frame rates in the real shipping path.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function shippingCoreBullets() {
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core bullet updater missing');
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

function boot() {
  class Game {
    constructor() {
      this.time = 1;
      this.bullets = []; this.tmp = []; this.__novaTerrain = [];
      this.tanks = []; this.shapes = []; this.drones = [];
      this.cam = { shake: 0 }; this.sfx = {};
      this.player = { id: 999, x: 1000, y: 1000, alive: true };
      this.hits = 0;
      this.hash = { query: (_x, _y, _r, out) => {
        out.length = 0;
        out.push(...this.tanks);
      } };
    }
  }
  for (const method of ['spawnPlayer', 'spawnShape', 'spawnPowerup',
    'tryFire', 'updateDrones', 'update', 'moveTank', 'addParticles',
    'splashAt', 'initBulletIntegrity', 'addRing', 'addFlash',
    'addImpactDebris', 'damageShape', 'damageDrone', 'weakenBullet',
    'clusterBurst']) Game.prototype[method] = function() {};
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.getTank = () => null;
  Game.prototype.resolveBulletCollisions = function() {};
  Game.prototype.damageTank = function() { this.hits++; };
  Game.prototype.updateBullets = shippingCoreBullets();
  class Sfx { resume() {} }
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; }
  };
  const context = { window: { __novaModules: modules },
    console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Date, performance: { now: () => 0 } };
  vm.runInNewContext(fs.readFileSync(path.join(root,
    'nova-updates/battlefield-v1.6.0.js'), 'utf8'), context);
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => spec === './classes'
    ? { CLASSES: { scout: { size: 15 } } }
    : { ARENA_HALF: 2250 });
  return module.exports.Game;
}

function simulate(Game, fps, x, velocity, ttl, pen = 0) {
  const g = new Game();
  g.tanks = [{ kind: 'tank', id: 2, x, y: 0,
    cls: 'scout', hp: 100, alive: true }];
  g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1, x: 0, y: 0,
    vx: velocity, vy: 0, r: 3, dmg: 20, ttl, pen,
    hits: 0, dead: false, shell: false, beam: false }];
  for (let i = 0; i < 20 && g.bullets.length; i++) {
    g.updateBullets(1 / fps);
    g.time += 1 / fps;
  }
  return g.hits;
}

const Game = boot();
for (const fps of [30, 60, 120, 240]) {
  test('KNOWN RED #234: reachable target takes damage before TTL at ' + fps + 'Hz', () => {
    // Swept radius: bullet.r + scout.size + 3 = 21.
    // First contact x=19 at 0.0031667s; expiry x=30 at 0.005s.
    assert.equal(simulate(Game, fps, 40, 6000, .005), 1);
  });
  test('unreachable target beyond TTL never takes phantom damage at ' + fps + 'Hz', () => {
    assert.equal(simulate(Game, fps, 100, 6000, .005), 0);
  });
}

test('KNOWN RED #234: seeded reachable-body parity across frame rates', () => {
  let seed = 20261024;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const worlds = Array.from({ length: 300 }, () => ({
    x: 30 + rand() * 120, velocity: 3000 + rand() * 6000,
    ttl: .003 + rand() * .027
  }));
  const summary = [];
  for (const fps of [30, 60, 120, 240]) {
    let missed = 0, phantom = 0;
    for (const w of worlds) {
      const expected = (w.x - 21) / w.velocity <= w.ttl;
      const actual = simulate(Game, fps, w.x, w.velocity, w.ttl) > 0;
      if (expected && !actual) missed++;
      if (!expected && actual) phantom++;
    }
    summary.push({ fps, missed, phantom });
  }
  assert.ok(summary.every(s => s.missed === 0 && s.phantom === 0),
    'first-contact TTL violations: ' + JSON.stringify(summary));
});


for (const fps of [30, 60, 120, 240]) {
  test('KNOWN RED #234: moving scout crossed before TTL is hit at ' + fps + 'Hz', () => {
    const g = new Game();
    g.tanks = [{ kind: 'tank', id: 2, x: 25, y: -20,
      cls: 'scout', hp: 100, alive: true,
      __novaSweepMoveTime: g.time,
      __novaSweepPrevX: 25, __novaSweepPrevY: 20 }];
    g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1, x: 0, y: 0,
      vx: 6000, vy: 0, r: 3, dmg: 20, ttl: .005, pen: 0,
      hits: 0, dead: false, shell: false, beam: false }];
    g.updateBullets(1 / fps);
    assert.equal(g.hits, 1,
      'moving body swept across reachable projectile segment before expiration');
  });
}

/* A real-world-speed acceptance gate: ordinary NOVA weapons use speeds in
 * this range and commonly have base penetration >=1. The first surface
 * contact at x=2 occurs at 0.004s, before expiry at x=2.5. */
for (const fps of [30, 60, 120, 240]) {
  test('KNOWN RED #234: 500u/s penetrating round hits before TTL at ' + fps + 'Hz', () => {
    assert.equal(simulate(Game, fps, 23, 500, .005, 1), 1);
  });
}


/* Exact TTL == frame step is also a missed hit: core checks <=0 before bodies.
 * First contact at t=.004s, strictly before each 30/60/120/240Hz expiry. */
for (const fps of [30, 60, 120, 240]) {
  test('KNOWN RED #234: exact-frame TTL penetrating round hits at ' + fps + 'Hz', () => {
    assert.equal(simulate(Game, fps, 23, 500, 1 / fps, 1), 1);
  });
}
