'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function boot(withPerformance = false) {
  function Game() {
    this.hash = { query(_x, _y, _radius, out) { out.length = 0; out.push(...this.__targets); } };
    this.tmp = [];
    this.__targets = [];
  }
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
      b.x += (b.vx || 0) * dt;
      b.y += (b.vy || 0) * dt;
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
  const context = { window: { __novaModules: modules }, console, Math, Map, Date, performance: { now: () => 0 } };
  const scripts = ['battlefield-v1.6.0.js'];
  if (withPerformance) scripts.push('performance-v1.7.5.js');
  for (const file of scripts) vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8'),
    context, { filename: file });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('Unexpected dependency: ' + spec);
  });
  return module.exports.Game;
}

function fixture(Game, targets) {
  const g = new Game();
  g.time = 1;
  g.__novaTerrain = [];
  g.hash.__targets = targets;
  g.bullets = [{ x: -100, y: 0, vx: 1000, vy: 0, r: 2, dmg: 12,
    ownerId: 1, pen: 0, hits: 0, dead: false }];
  g.damageShape = () => { throw new Error('Unexpected shape damage'); };
  g.damageTank = () => { throw new Error('Unexpected tank damage'); };
  g.damageDrone = () => { throw new Error('Unexpected drone damage'); };
  return g;
}

for (const withPerformance of [false, true]) {
  const label = withPerformance ? 'Battlefield + Performance' : 'Battlefield';
  test(label + ': destroyed neutral shapes cannot absorb swept projectiles before live tanks', () => {
    const Game = boot(withPerformance);
    const corpse = { kind: 'shape', id: 12, x: -40, y: 0, r: 18, hp: 0 };
    const tank = { kind: 'tank', id: 3, x: 30, y: 0, cls: 'scout', alive: true };
    const g = fixture(Game, [corpse, tank]);
    let struck = 0;
    g.damageTank = e => { assert.equal(e, tank); struck++; };
    g.updateBullets(.2);
    assert.equal(struck, 1);
    assert.equal(g.bullets.length, 0);
  });

  test(label + ': dead shapes alone do not consume a projectile or penetration', () => {
    const Game = boot(withPerformance);
    const corpse = { kind: 'shape', id: 12, x: 0, y: 0, r: 22, hp: -4 };
    const g = fixture(Game, [corpse]);
    g.updateBullets(.2);
    assert.equal(g.bullets.length, 1);
    assert.equal(g.bullets[0].hits, 0);
    assert.equal(g.bullets[0].pen, 0);
    assert.equal(g.bullets[0].x, 100);
  });

  test(label + ': living shapes still absorb the first physical hit', () => {
    const Game = boot(withPerformance);
    const shape = { kind: 'shape', id: 12, x: -40, y: 0, r: 18, hp: 10 };
    const tank = { kind: 'tank', id: 3, x: 30, y: 0, cls: 'scout', alive: true };
    const g = fixture(Game, [shape, tank]);
    let struck = 0;
    g.damageShape = e => { assert.equal(e, shape); struck++; };
    g.updateBullets(.2);
    assert.equal(struck, 1);
    assert.equal(g.bullets.length, 0);
  });
}
