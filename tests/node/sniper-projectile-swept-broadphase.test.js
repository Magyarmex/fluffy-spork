'use strict';
// Exact shipping Sniper resolver vs the same resolver with its conservative
// swept-AABB prefilter disabled. Pair order, allegiance, first-contact effects,
// shell bursts and child creation must remain identical.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'nova-updates/sniper-v1.2.0.js'), 'utf8');
const gate = 'if (count >= 32) {';
assert.equal(source.split(gate).length, 2, 'Sniper swept-AABB gate must be unique');
const reference = source.replace(gate, 'if (false && count >= 32) {');

function boot(optimized, polish = false) {
  class Game {
    constructor() {
      this.bullets = []; this.events = []; this.bursts = [];
      this.tankById = new Map(); this.cam = { shake: 0 };
      this.sfx = {}; this.time = 1; this.nextId = 10000;
      this.player = null; this.tanks = []; this.drones = []; this.shapes = [];
    }
    initBulletIntegrity(b) {
      if (b.hp == null) b.hp = 1;
      if (b.maxHp == null) b.maxHp = b.hp;
    }
    weakenBullet(b, damage) { b.hp -= damage; if (b.hp <= 0) b.dead = true; }
    addParticles(x, y, color) { this.events.push(['particle', x, y, color]); }
    addRing(x, y, color) { this.events.push(['ring', x, y, color]); }
    addText(x, y, text) { this.events.push(['text', x, y, text]); }
    clusterBurst(b) {
      this.bursts.push([b.id, b.x, b.y]);
      if (this.spawnChildren) for (let k = 0; k < 3; k++)
        this.bullets.push({
          id: this.nextId++, kind: 'bullet', ownerId: b.ownerId,
          x: b.x, y: b.y, px: b.x, py: b.y,
          r: 3, dmg: 4, hp: 2, maxHp: 2, pen: 0, ttl: .7,
          vx: 0, vy: 0, shell: false, dead: false
        });
    }
    getTank(id) { return this.tankById.get(id) || null; }
    tryFire() {}
    update() {}
  }
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/audio': m => { m.exports.Sfx = class { resume() {} }; },
    'game/render': m => { m.exports.render = () => {}; },
    'game/ai': m => { m.exports.updateAI = () => {}; }
  };
  const context = {
    window: { __novaModules: modules },
    console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Date, Number, Object,
    performance: { now: () => 0 }, navigator: {}, document: {}
  };
  vm.runInNewContext(optimized ? source : reference, context,
    { filename: 'sniper-v1.2.0.js' });
  if (polish) vm.runInNewContext(fs.readFileSync(path.join(root,
    'nova-updates/polish-v1.3.1.js'), 'utf8'), context,
    { filename: 'polish-v1.3.1.js' });
  const mod = { exports: {} };
  modules['game/engine'](mod, mod.exports, spec =>
    spec.includes('classes')
      ? { CLASSES: { scout: { size: 15 } }, lineageForClass: () => null }
      : { ARENA_HALF: 2250 });
  return new mod.exports.Game();
}

function shot(id, ownerId, px, py, x, y, extras = {}) {
  return { id, kind: 'bullet', ownerId, px, py, x, y,
    r: 3, hp: 2, maxHp: 2, dmg: 8, pen: 0, ttl: 1,
    shell: false, dead: false, ...extras };
}
function outcome(g) {
  return JSON.stringify({
    shots: g.bullets.map(b => [b.id, b.hp, !!b.dead, b.x, b.y]),
    bursts: g.bursts, effects: g.events
  });
}
function compare(shots, { polish = false, spawnChildren = false,
    alliances = false } = {}) {
  const games = [boot(false, polish), boot(true, polish)];
  for (const g of games) {
    g.bullets = shots.map(b => ({ ...b }));
    g.spawnChildren = spawnChildren;
    if (alliances) {
      g.tankById = new Map([
        [1, { id: 1, team: 'blue' }],
        [2, { id: 2, team: 'red' }],
        [3, { id: 3, team: 'blue' }]
      ]);
      g.areAllies = (a, b) => a.team === b.team;
    }
    g.resolveBulletCollisions();
  }
  assert.equal(outcome(games[1]), outcome(games[0]),
    'conservative prefilter must not change the shipping collision result');
  return games[1];
}
function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test('dense swept crossings and tangencies survive the prefilter', () => {
  const shots = Array.from({ length: 32 }, (_, i) =>
    shot(i + 1, i + 1, 1000 + i * 40, 1000, 1000 + i * 40, 1000));
  shots[0] = shot(1, 1, -30, 0, 30, 0, { hp: 1 });
  shots[1] = shot(2, 2, 30, 0, -30, 0, { hp: 3 });
  // A separate tangent pair must not steal the crossing pair's collision.
  shots[2] = shot(3, 3, 400, 7.5, 460, 7.5, { hp: 3 });
  shots[3] = shot(4, 4, 460, 0, 400, 0, { hp: 3 });
  const g = compare(shots);
  assert.equal(g.bullets[0].dead, true, 'crossing bullets must intercept');
  assert.ok(g.events.length >= 1, 'interception feedback must remain');
  assert.equal(g.__novaProjectileSweptBounds.length, 128);
});

test('shell interception keeps contact origin and one-time child birth', () => {
  const shots = Array.from({ length: 32 }, (_, i) =>
    shot(i + 1, i + 1, 1000 + i * 50, 2000, 1000 + i * 50, 2000));
  shots[0] = shot(1, 1, -30, 0, 30, 0, { shell: true, hp: 1 });
  shots[1] = shot(2, 2, 30, 0, -30, 0, { hp: 3 });
  const g = compare(shots, { spawnChildren: true });
  assert.equal(g.bursts.length, 1);
  assert.equal(g.bullets.length, 35);
  assert.ok(g.bursts[0][1] < 0, 'burst must use first physical contact');
});

test('friendly and hostile projectiles retain their existing relation rules', () => {
  const shots = Array.from({ length: 32 }, (_, i) =>
    shot(i + 1, 1, 1000 + i * 50, 2000, 1000 + i * 50, 2000));
  shots[0] = shot(1, 1, -30, 0, 30, 0);
  shots[1] = shot(2, 3, 30, 0, -30, 0);
  let g = compare(shots, { alliances: true });
  assert.equal(g.bullets[0].dead, false, 'same-team shots cannot intercept');
  shots[1].ownerId = 2;
  g = compare(shots, { alliances: true });
  assert.equal(g.bullets[0].dead, true, 'hostile shots still intercept');
});

test('small volleys bypass setup; large volleys reuse scratch storage', () => {
  const g = boot(true);
  g.bullets = Array.from({ length: 31 }, (_, i) =>
    shot(i + 1, 1, i * 40, 0, i * 40, 0));
  g.resolveBulletCollisions();
  assert.equal(g.__novaProjectileSweptBounds, undefined);
  g.bullets.push(shot(32, 1, 5000, 0, 5000, 0));
  g.resolveBulletCollisions();
  const storage = g.__novaProjectileSweptBounds;
  assert.equal(storage.length, 128);
  g.resolveBulletCollisions();
  assert.equal(g.__novaProjectileSweptBounds, storage);
  g.bullets.push(shot(33, 1, 6000, 0, 6000, 0));
  g.resolveBulletCollisions();
  assert.equal(g.__novaProjectileSweptBounds, storage);
  assert.equal(storage.length, 132);
});

for (const polish of [false, true]) {
  test((polish ? 'Sniper + Polish' : 'Sniper') +
    ': 400 seeded worlds preserve every collision outcome', () => {
    for (let world = 0; world < 400; world++) {
      const rand = seeded(0x9e3779b9 ^ (world * 1640531527));
      const n = 32 + world % 77;
      const spread = world % 3 === 0 ? 160 : 2600;
      const fps = [30, 60, 120, 240][world % 4];
      const shots = [];
      for (let i = 0; i < n; i++) {
        const px = (rand() - .5) * spread;
        const py = (rand() - .5) * spread;
        const vx = (rand() - .5) * 18000 / fps;
        const vy = (rand() - .5) * 18000 / fps;
        shots.push(shot(i + 1, 1 + i % 3, px, py, px + vx, py + vy, {
          r: 2 + rand() * 4,
          hp: 1 + Math.floor(rand() * 7),
          shell: rand() < .015
        }));
      }
      compare(shots, { polish, alliances: world % 2 === 0 });
    }
  });
}
