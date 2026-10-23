'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function realMethod(name, arg) {
  const marker = '    ' + name + '(' + arg + ') {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core method ' + name + ' missing');
  let pos = start + marker.length, depth = 1;
  for (; pos < html.length && depth; pos++) {
    if (html[pos] === '{') depth++;
    else if (html[pos] === '}') depth--;
  }
  assert.equal(depth, 0);
  const types = {
    TAU: Math.PI * 2,
    rnd: (a, b) => (a + b) / 2,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2,
  };
  return new Function('classes_1', 'types_1', 'M',
    'return function(' + arg + '){' + html.slice(start + marker.length, pos - 1) + '}')(
    { CLASSES }, types, 2250);
}

// Match the actual shipping class contract; fail rather than quietly testing
// a stale invented set of child counts.
const CLASSES = {
  scout: { id: 'scout', size: 14, bullet: {}, barrels: [{ x: 0, len: 20, off: 0 }] },
  bomber: { id: 'bomber', size: 16, fireMode: 'shell', color: '#ffc779',
    barrels: [{ x: 0, len: 30, off: 0 }],
    bullet: { dmg: 17, speed: 420, r: 8, pen: 1, reload: 1, ttl: 1, cluster: 6, clusterDmg: 8 } },
  clusterking: { id: 'clusterking', size: 16, fireMode: 'shell', color: '#ffc779',
    barrels: [{ x: 0, len: 32, off: 0 }],
    bullet: { dmg: 22, speed: 385, r: 8.4, pen: 1, reload: 1.02, ttl: 1.15, cluster: 10, clusterDmg: 11 } },
  siegebomber: { id: 'siegebomber', size: 17, fireMode: 'shell', color: '#ffc779',
    barrels: [{ x: 0, len: 35, off: 0 }],
    bullet: { dmg: 30, speed: 365, r: 9, pen: 1, reload: 1.24, ttl: 1.25, cluster: 5, clusterDmg: 16 } },
};
for (const [cls, def] of Object.entries(CLASSES)) {
  if (!def.bullet.cluster) continue;
  const block = html.slice(html.indexOf('    ' + cls + ': {'), html.indexOf('    ' + cls + ': {') + 650);
  assert.match(block, new RegExp('cluster: ' + def.bullet.cluster + '(?:,|\\s)'));
}

const coreFire = realMethod('tryFire', 't');
const coreBurst = realMethod('clusterBurst', 'b');
const coreUpdate = realMethod('updateBullets', 'dt');

function boot(optimized) {
  function Game() {
    this.nextId = 1; this.time = 1; this.bullets = []; this.tanks = [];
    this.tmp = []; this.cam = { shake: 0, x: 0, y: 0, zoom: 1 };
    this.w = 800; this.h = 600; this.player = null;
    this.input = { aim: { active: false, dx: 0, dy: 0 }, mouseActive: false };
    this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
    this.sfx = { shoot() {}, explode() {}, novaFuseBurst() {}, resume() {} };
    this.burstRings = 0;
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles', 'addFlash',
    'splashAt', 'updateDrones', 'update', 'weakenBullet', 'useAbility']) {
    Game.prototype[name] = function () {};
  }
  Game.prototype.addRing = function () { this.burstRings++; };
  Game.prototype.tryFire = coreFire;
  Game.prototype.clusterBurst = coreBurst;
  Game.prototype.updateBullets = coreUpdate;
  Game.prototype.bulletDamageFor = (_t, dmg) => dmg;
  Game.prototype.bulletSpeed = t => CLASSES[t.cls].bullet.speed;
  Game.prototype.getTank = function (id) { return this.tanks.find(t => t.id === id) || null; };
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.tankSpeed = () => 100;
  Game.prototype.weaponRange = () => 600;
  Game.prototype.bodyDamage = () => 100;
  Game.prototype.damageTank = function () {};
  function Sfx() {}
  Sfx.prototype.resume = function () {};
  const modules = {
    'game/classes': m => { m.exports = { CLASSES, lineageForClass: id =>
      ['bomber', 'clusterking', 'siegebomber'].includes(id) ? 'cannon' : 'scout' }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const context = { window: { __novaModules: modules }, console, Math, Date, Map,
    performance: { now: () => 0 } };
  const overlays = ['battlefield-v1.6.0.js', 'disciplines-v1.7.0.js',
    'apex-disciplines-v1.7.1.js'];
  if (optimized) overlays.push('performance-v1.7.5.js');
  for (const file of overlays) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  }
  const cache = {};
  function load(id) {
    if (cache[id]) return cache[id].exports;
    const m = { exports: {} }; cache[id] = m;
    modules[id](m, m.exports, spec => {
      if (spec === './classes') return load('game/classes');
      if (spec === './types') return { ARENA_HALF: 2250 };
      throw Error('unexpected require ' + spec);
    });
    return m.exports;
  }
  load('game/classes'); load('game/audio'); load('game/render');
  return load('game/engine').Game;
}

function makeTank(cls, id = 1) {
  return { id, cls, x: 0, y: 0, vx: 0, vy: 0, angle: 0, alive: true,
    fireCd: 0, stats: { reload: 0, penetration: 0, damage: 0 },
    level: 1, isPlayer: true, gene: null, perk: null, overheatT: 0,
    tripleT: 0, barrelIdx: 0, __v17FuseDepth: .75 };
}
function setup(Game, cls) {
  const g = new Game(), t = makeTank(cls);
  g.tanks = [t]; g.player = t; g.__novaTerrain = [];
  g.tryFire(t);
  assert.equal(g.bullets.length, 1, 'actual core tryFire must emit one shell');
  return { g, t, parent: g.bullets[0] };
}

for (const optimized of [false, true]) {
  const label = optimized ? 'Battlefield + Three Disciplines + Apex + Performance'
    : 'Battlefield + Three Disciplines + Apex';
  for (const cls of ['bomber', 'clusterking', 'siegebomber']) {
    for (const fps of [30, 60, 120, 240]) {
      test(label + ': ' + cls + ' class child count and exactly-once burst at ' + fps + 'Hz', () => {
        const { g, parent } = setup(boot(optimized), cls);
        assert.equal(parent.cluster, CLASSES[cls].bullet.cluster,
          'class count must be carried by the fired shell');
        const dmg = parent.clusterDmg;
        parent.ttl = 0.001; // natural expiry through actual shipping updater
        g.updateBullets(1 / fps);
        const kids = g.bullets.filter(b => !b.shell && !b.dead);
        assert.equal(kids.length, CLASSES[cls].bullet.cluster);
        assert.ok(kids.every(b => b.dmg > 0 && b.ownerId === parent.ownerId));
        assert.ok(kids.every(b => b.id !== parent.id));
        assert.equal(new Set(kids.map(b => b.id)).size, kids.length);
        assert.equal(g.burstRings, 1);
        g.clusterBurst(parent); // reentry must not create another burst
        assert.equal(g.bullets.length, kids.length);
        assert.equal(g.burstRings, 1);
        assert.equal(parent.clusterDmg, dmg);
        if (cls === 'clusterking') {
          assert.ok(kids.every(b => b.__v171SectorChild),
            'Apex must shape all ten children, including additional ones');
          const angles = kids.map(b => Math.atan2(b.vy, b.vx));
          assert.ok(angles[0] < angles[angles.length - 1]);
        }
        if (cls === 'siegebomber') {
          const angles = kids.map(b => Math.atan2(b.vy, b.vx));
          const gaps = angles.map((a, i) => {
            const b = angles[(i + 1) % angles.length];
            return (b - a + Math.PI * 4) % (Math.PI * 2);
          });
          assert.ok(gaps.every(gap => Math.abs(gap - Math.PI * 2 / 5) < .24),
            'five siege children should cover distinct evenly spaced directions');
        }
      });
    }
  }
  test(label + ': class evolution does not change an already fired shell', () => {
    const { g, t, parent } = setup(boot(optimized), 'clusterking');
    t.cls = 'siegebomber';
    g.clusterBurst(parent);
    assert.equal(g.bullets.length, 11, 'ten children plus the still-live parent');
    assert.equal(g.bullets.filter(b => b.__v171SectorChild).length, 10);
  });
  test(label + ': two independent shells each burst exactly once', () => {
    const { g, parent } = setup(boot(optimized), 'siegebomber');
    const other = { ...parent, id: g.nextId++, __novaClusterBurstConsumed: false };
    g.bullets.push(other);
    g.clusterBurst(parent); g.clusterBurst(other);
    assert.equal(g.bullets.filter(b => !b.shell).length, 10);
    assert.equal(g.burstRings, 2);
  });
}

for (const optimized of [false, true]) {
  const label = optimized ? 'optimized' : 'base';
  for (const cls of ['bomber', 'clusterking', 'siegebomber']) {
    for (const fps of [30, 60, 120, 240]) {
      test(label + ': ' + cls + ' shrapnel respects a permanent wall at ' + fps + 'Hz', () => {
        const { g, parent } = setup(boot(optimized), cls);
        g.__novaBattlefield = { coverBroken: 0 };
        g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0,
          w: 160, h: 160, solid: true, destructible: false }];
        Object.assign(parent, { x: -120, y: 0, px: -120, py: 0,
          vx: 12000, vy: 0, r: 2, ttl: 2 });
        g.updateBullets(1 / fps);
        const kids = g.bullets.filter(b => !b.shell && !b.dead);
        const expected = cls === 'clusterking' ? 0 : cls === 'siegebomber' ? 2 : 3;
        assert.equal(kids.length, expected,
          'wall must block inward fragments, not outward fragments');
        assert.ok(kids.every(b => b.vx < 0 && b.x < -80));
        assert.equal(g.__novaTerrain[0].solid, true);
      });
    }
  }
  for (const cls of ['bomber', 'clusterking', 'siegebomber']) {
    test(label + ': AI and human shells use identical ' + cls + ' fragment counts', () => {
      const { g, t, parent } = setup(boot(optimized), cls);
      g.clusterBurst(parent);
      const humanCount = g.bullets.filter(b => !b.shell).length;
      t.isPlayer = false; t.ai = { state: 'farm', targetId: -1 };
      t.fireCd = 0;
      g.tryFire(t);
      const aiParent = g.bullets.find(b => b.shell && b.id !== parent.id);
      assert.ok(aiParent);
      g.clusterBurst(aiParent);
      assert.equal(g.bullets.filter(b => !b.shell).length - humanCount,
        CLASSES[cls].bullet.cluster);
    });
  }
}
