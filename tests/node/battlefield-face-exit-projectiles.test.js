'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function boot(performanceLayer) {
  function Game() { this.hash = { query(_x, _y, _r, out) { out.length = 0; } }; this.tmp = []; }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles',
    'splashAt', 'updateDrones', 'update']) Game.prototype[name] = function () {};
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = () => null;
  Game.prototype.updateBullets = function (dt) {
    for (const b of this.bullets || []) {
      if (b.dead) continue;
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
  };
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

function arena(Game, shape, obstacles) {
  const g = new Game();
  g.time = 1;
  g.__novaTerrain = obstacles || [{ id: -1, shape, x: 0, y: 0,
    r: 80, w: 160, h: 160, solid: true, destructible: false }];
  return g;
}

function bullet(x, y, vx, vy) {
  return { x, y, vx, vy, r: 2, dmg: 12, ttl: 1,
    ownerId: 1, pen: 0, hits: 0, dead: false };
}

for (const optimized of [false, true]) {
  for (const shape of ['circle', 'rect']) {
    const label = (optimized ? 'Battlefield + Performance' : 'Battlefield') + ' ' + shape;
    test(label + ': muzzle on physical face may shoot outward', () => {
      const Game = boot(optimized);
      for (const fps of [30, 60, 120, 240]) {
        const g = arena(Game, shape);
        assert.equal(g.firstTerrainHit(80, 0, 120, 0, 0), null);
        const b = bullet(80, 0, 1000, 0);
        g.bullets = [b];
        g.updateBullets(1 / fps);
        assert.equal(b.dead, false, 'outward shot was consumed at ' + fps + 'Hz');
        assert.ok(b.x > 80, 'outward shot did not advance at ' + fps + 'Hz');
      }
    });
    test(label + ': face tangent is not a new penetration', () => {
      const Game = boot(optimized), g = arena(Game, shape);
      assert.equal(g.firstTerrainHit(80, 0, 80, 40, 0), null);
      assert.equal(g.firstTerrainHit(80, 0, 80, -40, 0), null);
      assert.equal(g.firstTerrainHit(80, 80, 120, 40, 0), null);
    });
    test(label + ': inward and embedded shots remain blocked', () => {
      const Game = boot(optimized), g = arena(Game, shape);
      for (const [ax, ay, bx, by] of [
        [80, 0, 0, 0], [79, 0, 120, 0], [0, 0, 120, 0],
        [80, 80, 0, 0],
      ]) {
        const hit = g.firstTerrainHit(ax, ay, bx, by, 0);
        assert.ok(hit, 'missed actual solid');
        assert.equal(hit.hit.t, 0);
      }
      const b = bullet(80, 0, -1000, 0);
      g.bullets = [b]; g.updateBullets(1 / 60);
      assert.equal(b.dead, true);
      assert.equal(b.x, 80);
    });
    test(label + ': padded outward escape preserves incoming contact', () => {
      const Game = boot(optimized), g = arena(Game, shape);
      assert.equal(g.firstTerrainHit(82, 0, 120, 0, 4), null);
      const hit = g.firstTerrainHit(82, 0, 0, 0, 4);
      assert.ok(hit);
      assert.equal(hit.hit.t, 0);
      assert.equal(g.firstTerrainHit(-120, 120, 120, 120, 4), null);
    });
    test(label + ': exiting the first obstacle cannot skip a later one', () => {
      const Game = boot(optimized);
      const a = { id: -1, shape, x: 0, y: 0, r: 80, w: 160, h: 160,
        solid: true, destructible: false };
      const b = { id: -2, shape, x: 200, y: 0, r: 20, w: 40, h: 40,
        solid: true, destructible: false };
      const g = arena(Game, shape, [a, b]);
      const hit = g.firstTerrainHit(80, 0, 260, 0, 0);
      assert.ok(hit);
      assert.equal(hit.solid.id, -2);
      assert.ok(Math.abs(hit.hit.t - 100 / 180) < 1e-10);
    });
    test(label + ': stationary face and destroyed cover keep old semantics', () => {
      const Game = boot(optimized), g = arena(Game, shape);
      assert.ok(g.firstTerrainHit(80, 0, 80, 0, 0));
      g.__novaTerrain[0].solid = false;
      assert.equal(g.firstTerrainHit(80, 0, 0, 0, 0), null);
    });
  }
}
