'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual materialized core updater, not a rewritten approximation.
const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const types = {
  dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2,
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
};
function coreMethod(name, params) {
  const marker = '    ' + name + '(' + params + ') {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core missing ' + name);
  let end = start + marker.length, depth = 1;
  for (; end < html.length && depth; end++) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'unbalanced ' + name);
  return new Function('types_1', 'classes_1', 'M',
    'return function(' + params + '){' +
    html.slice(start + marker.length, end - 1) + '}')(
      types, { CLASSES: { scout: { size: 14 } } }, 2250);
}
function boot(optimized) {
  function Game() {
    this.hash = { query: (_x, _y, _r, out) => {
      out.length = 0; out.push(...this.targets);
    } };
    this.targets = []; this.tmp = []; this.cam = { shake: 0 };
    this.bullets = []; this.time = 1; this.nextId = 10;
    this.sfx = { explode() {} }; this.__novaBattlefield = { coverBroken: 0 };
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup',
    'tryFire', 'addParticles', 'addFlash', 'addRing', 'splashAt',
    'updateDrones', 'update', 'addImpactDebris']) {
    Game.prototype[name] = function () {};
  }
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = (t, vx, vy, dt) => { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = () => null;
  Game.prototype.initBulletIntegrity = coreMethod('initBulletIntegrity', 'b');
  Game.prototype.weakenBullet = coreMethod('weakenBullet', 'b, absorbed');
  Game.prototype.resolveBulletCollisions = coreMethod('resolveBulletCollisions', '');
  Game.prototype.updateBullets = coreMethod('updateBullets', 'dt');
  Game.prototype.damageTank = function (t, damage) {
    this.directHits = (this.directHits || 0) + 1;
    t.hp -= damage;
  };
  Game.prototype.clusterBurst = function () {
    this.bursts = (this.bursts || 0) + 1;
  };
  function Sfx() {}
  Sfx.prototype.resume = function () {};
  const mods = {
    'game/audio': m => { m.exports = { Sfx }; },
    'game/classes': m => { m.exports = { CLASSES: { scout: { size: 14 } } }; },
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const context = { window: { __novaModules: mods }, console, Math, Map, Date,
    performance: { now: () => 0 } };
  for (const file of optimized
    ? ['battlefield-v1.6.0.js', 'performance-v1.7.5.js']
    : ['battlefield-v1.6.0.js']) {
    vm.runInNewContext(fs.readFileSync(
      path.join(__dirname, '../../nova-updates', file), 'utf8'), context,
    { filename: file });
  }
  const m = { exports: {} };
  mods['game/engine'](m, m.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw Error('Unexpected dependency ' + spec);
  });
  return m.exports.Game;
}
function fire(Game, fps, order, opts = {}) {
  const g = new Game();
  const start = -150, speed = opts.speed ?? 18000, dt = 1 / fps;
  const travel = speed * dt, end = start + travel;
  const solid = (kind, x, id) => ({
    id, kind: 'terrain', shape: 'rect', x, y: 0,
    w: 8, h: 100, solid: true, destructible: kind === 'cover',
    hp: kind === 'cover' ? 5 : 0,
  });
  const xs = { cover: start + travel * (opts.coverFraction ?? .2),
    cover2: start + travel * .42,
    wall: start + travel * (opts.wallFirst ? .1 : .65) };
  g.__novaTerrain = order.map((kind, i) =>
    solid(kind === 'cover2' ? 'cover' : kind, xs[kind], -i - 1));
  const tank = { kind: 'tank', id: 2, cls: 'scout',
    x: start + travel * (opts.targetFraction ?? 1), y: 0, r: 14, alive: true, hp: 100 };
  g.targets = [tank];
  g.bullets = [{ id: 1, x: start, y: 0, vx: speed, vy: 0,
    r: 2, dmg: 60, ttl: 2, pen: opts.pen ?? 8,
    hits: 0, dead: false, ownerId: 1, shell: !!opts.shell }];
  g.updateBullets(dt);
  return { g, tank };
}
for (const optimized of [false, true]) {
  const Game = boot(optimized);
  const label = optimized ? 'Battlefield + Performance' : 'Battlefield';
  for (const fps of [30, 60, 120, 240]) {
    test(label + ' ' + fps + 'Hz: breached cover cannot tunnel through a later wall', () => {
      const { g, tank } = fire(Game, fps, ['cover', 'wall']);
      assert.equal(g.__novaTerrain[0].hp, 0);
      assert.equal(g.directHits || 0, 0);
      assert.equal(tank.hp, 100);
      assert.equal(g.bullets.length, 0);
    });
    test(label + ' ' + fps + 'Hz: two breached barricades still expose the later wall', () => {
      const { g, tank } = fire(Game, fps, ['cover', 'cover2', 'wall']);
      assert.equal(g.__novaTerrain[0].hp, 0);
      assert.equal(g.__novaTerrain[1].hp, 0);
      assert.equal(g.directHits || 0, 0);
      assert.equal(tank.hp, 100);
      assert.equal(g.bullets.length, 0);
    });
    test(label + ' ' + fps + 'Hz: penetrating through cover without later wall still hits', () => {
      const { g, tank } = fire(Game, fps, ['cover']);
      assert.equal(g.__novaTerrain[0].hp, 0);
      assert.equal(g.directHits, 1);
      assert.ok(tank.hp < 100);
    });
    test(label + ' ' + fps + 'Hz: insufficient penetration stops at breached cover', () => {
      const { g, tank } = fire(Game, fps, ['cover'], { pen: 1 });
      assert.equal(g.__novaTerrain[0].hp, 0);
      assert.equal(g.directHits || 0, 0);
      assert.equal(tank.hp, 100);
      assert.equal(g.bullets.length, 0);
    });
    test(label + ' ' + fps + 'Hz: terrain wall alone blocks without damage to cover', () => {
      const { g, tank } = fire(Game, fps, ['wall', 'cover'], { wallFirst: true });
      assert.equal(g.__novaTerrain[1].hp, 5);
      assert.equal(g.directHits || 0, 0);
      assert.equal(tank.hp, 100);
    });
    test(label + ' ' + fps + 'Hz: target before cover must intercept the shot before cover damage', () => {
      const { g, tank } = fire(Game, fps, ['cover'],
        { speed: 36000, targetFraction: .2, coverFraction: .5, pen: 0 });
      assert.equal(g.directHits, 1,
        'chronological contact: front target must absorb the bullet');
      assert.ok(tank.hp < 100);
      assert.equal(g.__novaTerrain[0].hp, 5,
        'cover behind the first body must not take this nonpenetrating shot');
    });
    test(label + ' ' + fps + 'Hz: target before the later wall must retain its legitimate hit', () => {
      const { g, tank } = fire(Game, fps, ['cover', 'wall'],
        { speed: 36000, targetFraction: .45 });
      assert.equal(g.__novaTerrain[0].hp, 0);
      assert.equal(g.directHits, 1,
        'regression: later wall must not erase earlier tank contact');
      assert.ok(tank.hp < 100);
    });
    test(label + ' ' + fps + 'Hz: a shell detonates only once at the final wall', () => {
      const { g, tank } = fire(Game, fps, ['cover', 'wall'], { shell: true });
      assert.equal(g.__novaTerrain[0].hp, 0);
      assert.equal(g.bursts, 1);
      assert.equal(g.directHits || 0, 0);
      assert.equal(tank.hp, 100);
    });
  }
  test(label + ': unobstructed projectile still damages its target', () => {
    const { g, tank } = fire(Game, 60, []);
    assert.equal(g.directHits, 1);
    assert.ok(tank.hp < 100);
  });
}
