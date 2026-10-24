'use strict';
// A swept Sniper projectile interception must retain the core Cannon/Bomber
// contract: a shell destroyed by hostile fire releases its fragments exactly once.
// Exercise the real materialized bullet updater and the shipping overlay order.
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
  if (full) files.push('apex-disciplines-v1.7.1.js', 'performance-v1.7.5.js');
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

for (const full of [false, true]) {
  const mode = full ? 'full Sniper/Polish/Battlefield/Apex/Performance' : 'Sniper/Battlefield';
  test(mode + ': intercepted Bomber shell bursts once at endpoint', () => {
    const g = boot(full);
    g.bullets = [bullet(1, 1, 0, 0, 1, true), bullet(2, 2, 0, 0, 3)];
    g.resolveBulletCollisions();
    assert.deepEqual(g.bursts, [1]);
    assert.equal(g.bullets[0].dead, true);
    g.resolveBulletCollisions();
    assert.deepEqual(g.bursts, [1], 'dead shell cannot burst again');
  });
  test(mode + ': two destroyed hostile shells each burst once', () => {
    const g = boot(full);
    g.bullets = [bullet(1, 1, 0, 0, 2, true), bullet(2, 2, 0, 0, 2, true)];
    g.resolveBulletCollisions();
    assert.deepEqual(g.bursts.slice().sort((a, b) => a - b), [1, 2]);
    g.resolveBulletCollisions();
    assert.equal(g.bursts.length, 2);
  });
  test(mode + ': a surviving shell does not burst and friendly fire is ignored', () => {
    const g = boot(full);
    g.bullets = [bullet(1, 1, 0, 0, 10, true), bullet(2, 2, 0, 0, 2)];
    g.resolveBulletCollisions();
    assert.deepEqual(g.bursts, []);
    assert.equal(g.bullets[0].dead, false);
    const friendly = boot(full);
    friendly.bullets = [bullet(3, 1, 0, 0, 1, true), bullet(4, 1, 0, 0, 3)];
    friendly.resolveBulletCollisions();
    assert.deepEqual(friendly.bursts, []);
  });
  for (const fps of [30, 60, 120, 240]) {
    test(mode + ': crossing shots burst shell through real core at ' + fps + ' Hz', () => {
      const g = boot(full);
      g.bullets = [bullet(1, 1, -30, 60 * fps, 1, true),
        bullet(2, 2, 30, -60 * fps, 3)];
      g.updateBullets(1 / fps);
      assert.deepEqual(g.bursts, [1], 'swept interception must burst shell');
      assert.equal(g.bullets.some(b => b.id === 1), false,
        'destroyed shell removed by materialized core');
      assert.equal(g.bullets.some(b => b.id === 2), true);
    });
  }
}

for (const [cls, count] of [['clusterking', 10], ['siegebomber', 5]]) {
  test('full shipping Apex: intercepted ' + cls + ' retains ' + count +
    ' child fragments without duplicates', () => {
    const g = boot(true);
    g.nextId = 100; g.__testSpawnChildren = true;
    const shell = bullet(1, 1, 0, 0, 1, true);
    shell.cluster = count;
    shell.__novaClusterClass = cls;
    shell.__novaClusterFuseDepth = .4;
    g.bullets = [shell, bullet(2, 2, 0, 0, 3)];
    g.resolveBulletCollisions();
    assert.deepEqual(g.bursts, [1]);
    assert.equal(g.bullets.filter(b => b.id >= 100).length, count);
    assert.ok(g.bullets.filter(b => b.id >= 100).every(b => !b.shell));
    g.resolveBulletCollisions();
    assert.equal(g.bursts.filter(id => id === 1).length, 1,
      'intercepted parent shell may not generate another burst');
  });
}

/* A swept collision happens before the endpoints. Fragment origin must be
 * the physical first-contact location, not the end of a long 30Hz frame. */
for (const full of [false, true]) {
  const mode = full ? 'full production overlays' : 'Sniper/Battlefield';
  for (const fps of [30, 60, 120, 240]) {
    test(mode + ': intercepted shell fragments originate at first contact at ' +
      fps + 'Hz', () => {
      const g = boot(full);
      g.bullets = [bullet(1, 1, -30, 60 * fps, 1, true),
        bullet(2, 2, 30, -60 * fps, 3)];
      g.updateBullets(1 / fps);
      assert.equal(g.burstOrigins.length, 1);
      assert.equal(g.burstOrigins[0].id, 1);
      assert.ok(Math.abs(g.burstOrigins[0].x + 3.75) < 1e-7,
        'expected first-contact x=-3.75, got ' + g.burstOrigins[0].x);
      assert.equal(g.burstOrigins[0].y, 0);
    });
  }
  test(mode + ': shell already overlapping at frame start bursts at start', () => {
    const g = boot(full);
    const shell = bullet(1, 1, 20, 0, 1, true);
    const other = bullet(2, 2, -20, 0, 3);
    shell.px = -1; shell.py = 0;
    other.px = 1; other.py = 0;
    g.bullets = [shell, other];
    g.resolveBulletCollisions();
    assert.equal(g.burstOrigins.length, 1);
    assert.ok(Math.abs(g.burstOrigins[0].x + 1) < 1e-7);
    assert.equal(shell.x, 20, 'temporary burst placement must restore endpoint');
  });
  test(mode + ': shell without a previous position bursts at its current point', () => {
    const g = boot(full);
    g.bullets = [bullet(1, 1, 0, 0, 1, true), bullet(2, 2, 0, 0, 3)];
    g.resolveBulletCollisions();
    assert.equal(g.burstOrigins[0].x, 0);
  });
}

for (const full of [false, true]) {
  test((full ? 'full overlays' : 'Sniper/Battlefield') +
    ': two shells burst at their own simultaneous contact positions', () => {
    const g = boot(full);
    const a = bullet(1, 1, 30, 0, 2, true);
    const b = bullet(2, 2, -30, 0, 2, true);
    a.px = -30; a.py = 0; b.px = 30; b.py = 0;
    g.bullets = [a, b];
    g.resolveBulletCollisions();
    assert.equal(g.burstOrigins.length, 2);
    const byId = new Map(g.burstOrigins.map(o => [o.id, o]));
    assert.ok(Math.abs(byId.get(1).x + 3.75) < 1e-7);
    assert.ok(Math.abs(byId.get(2).x - 3.75) < 1e-7);
    assert.equal(a.x, 30);
    assert.equal(b.x, -30);
  });
  test((full ? 'full overlays' : 'Sniper/Battlefield') +
    ': a swept near miss never creates a phantom shell burst', () => {
    const g = boot(full);
    const a = bullet(1, 1, 30, 0, 1, true);
    const b = bullet(2, 2, -30, 0, 3);
    a.px = -30; a.py = 0; b.px = 30; b.py = 15;
    b.y = 15;
    g.bullets = [a, b];
    g.resolveBulletCollisions();
    assert.deepEqual(g.burstOrigins, []);
    assert.equal(a.dead, false);
  });
  test((full ? 'full overlays' : 'Sniper/Battlefield') +
    ': burst exceptions restore the physical shell endpoint', () => {
    const g = boot(full);
    const shell = bullet(1, 1, 30, 0, 1, true);
    const other = bullet(2, 2, -30, 0, 3);
    shell.px = -30; shell.py = 0;
    other.px = 30; other.py = 0;
    g.bullets = [shell, other];
    g.clusterBurst = () => { throw new Error('injected burst failure'); };
    assert.throws(() => g.resolveBulletCollisions(), /injected burst failure/);
    assert.equal(shell.x, 30);
    assert.equal(shell.y, 0);
  });
}


/* Interception feedback must appear where two moving projectile discs first
 * touch, not halfway between their end-of-frame coordinates. The latter can
 * be far from the actual fight for high-speed shells, especially at 30 Hz.
 * Exercise the real materialized core + shipping overlay order. */
for (const full of [false, true]) {
  for (const shell of [false, true]) {
    for (const fps of [30, 60, 120, 240]) {
      test((full ? 'full shipping overlays' : 'Sniper/Battlefield') +
        ': ' + (shell ? 'shell' : 'ordinary shot') +
        ' interception feedback stays at physical contact at ' + fps + 'Hz', () => {
        const g = boot(full);
        const effects = [];
        g.addParticles = (x, y, color) => {
          if (color === '#d9f7ff') effects.push({ x, y });
        };
        g.bullets = [bullet(1, 1, -100, 6000, 1, shell),
          bullet(2, 2, 40, -1200, 3)];
        for (let frame = 0; frame < Math.ceil(fps / 30) + 2 && !effects.length; frame++)
          g.updateBullets(1 / fps);
        assert.equal(effects.length, 1, 'one interception should emit one contact effect');
        // Shell: -100 -> 100, hostile bullet: 40 -> 0 in 1/30 second.
        // First contact: shell x=10.41666..., hostile x=17.91666...
        // The visual midpoint is 14.16666..., NOT endpoint midpoint 50.
        assert.ok(Math.abs(effects[0].x - 14.166666666666666) < 1e-6,
          'effect must use world-space first contact; got x=' + effects[0].x);
        assert.equal(effects[0].y, 0);
        if (shell) {
          assert.equal(g.bursts.length, 1, 'intercepted shell still bursts once');
          assert.ok(Math.abs(g.burstOrigins[0].x - 10.416666666666666) < 1e-6);
        }
      });
    }
  }
}

for (const full of [false, true]) {
  test((full ? 'full shipping overlays' : 'Sniper/Battlefield') +
    ': start-overlapping projectiles draw feedback at initial midpoint', () => {
    const g = boot(full), effects = [];
    g.addParticles = (x, y, color) => {
      if (color === '#d9f7ff') effects.push({ x, y });
    };
    const a = bullet(1, 1, 100, 0, 1);
    const b = bullet(2, 2, 0, 0, 3);
    a.px = -1; a.py = 0; b.px = 1; b.py = 0;
    g.bullets = [a, b];
    g.resolveBulletCollisions();
    assert.equal(effects.length, 1);
    assert.ok(Math.abs(effects[0].x) < 1e-9,
      'initial overlap should draw at x=0, not endpoint midpoint x=50');
  });
}
