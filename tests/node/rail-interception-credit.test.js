'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function buildGame(bullets, options = {}) {
  class Game {
    initBulletIntegrity() {}
    weakenBullet(bullet, damage) {
      bullet.hp -= damage;
      if (bullet.hp <= 0) bullet.dead = true;
    }
  }
  const modules = {
    'game/engine': (module) => { module.exports = { Game }; },
    'game/audio': (module) => { module.exports = {}; },
    'game/render': (module) => { module.exports = {}; }
  };
  const context = {
    window: { __novaModules: modules },
    console,
    performance: { now: () => 1000 },
    navigator: {},
    Math
  };
  for (const file of ['sniper-v1.2.0.js', 'polish-v1.3.1.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8');
    vm.runInNewContext(source, context, { filename: file });
  }
  const mod = { exports: {} };
  modules['game/engine'](mod, mod.exports, (name) => {
    assert.equal(name, './classes');
    return { CLASSES: {} };
  });
  const game = new mod.exports.Game();
  game.time = 5;
  game.player = { id: 1, alive: true };
  game.bullets = bullets;
  game.tankById = new Map([
    [1, { id: 1, team: options.playerTeam || 'blue' }],
    [2, { id: 2, team: options.railTeam || 'red' }],
    [3, { id: 3, team: 'green' }]
  ]);
  game.cam = { shake: 0 };
  game.addText = (...args) => { (game.texts ||= []).push(args); };
  game.addRing = (...args) => { (game.rings ||= []).push(args); };
  game.addParticles = () => {};
  game.sfx = { novaRailInterceptPolish: (_pan, _destroyed, playerDidIt) => {
    (game.creditEvents ||= []).push(playerDidIt);
  }};
  return game;
}
function bullet(id, ownerId, x, y, extra = {}) {
  const shot = { id, ownerId, x, y, px: x, py: y, r: 2, hp: 2, dmg: 1, dead: false, ...extra };
  shot.maxHp = shot.hp;
  shot.baseDmg = shot.dmg;
  return shot;
}

test('nearby unrelated player fire cannot claim enemy rail interception', () => {
  const rail = bullet(10, 2, 0, 0, { __novaRail: true, hp: 1 });
  const enemy = bullet(11, 3, 0, 0);
  const nearby = bullet(12, 1, 50, 0);
  const game = buildGame([rail, enemy, nearby]);
  game.resolveBulletCollisions();
  assert.equal(rail.dead, true);
  assert.deepEqual(game.creditEvents, [false]);
  assert.equal((game.texts || []).length, 0);
});

test('real swept player interception credits distant endpoints', () => {
  const rail = bullet(20, 2, 100, 0, { px: 0, __novaRail: true, hp: 1 });
  const playerShot = bullet(21, 1, 0, 0, { px: 100 });
  const game = buildGame([rail, playerShot]);
  game.resolveBulletCollisions();
  assert.equal(rail.dead, true);
  assert.deepEqual(game.creditEvents, [true]);
  assert.equal(game.texts[0][2], 'RAIL DENIED');
});

test('allied projectile contact does not award rail denial', () => {
  const rail = bullet(30, 2, 0, 0, { __novaRail: true, hp: 1 });
  const playerShot = bullet(31, 1, 0, 0);
  const game = buildGame([rail, playerShot], { railTeam: 'blue' });
  game.resolveBulletCollisions();
  assert.equal(rail.dead, false);
  assert.equal((game.creditEvents || []).length, 0);
});

test('multiple actual player hits on one rail produce one feedback event', () => {
  const rail = bullet(40, 2, 0, 0, { __novaRail: true, hp: 3 });
  const shotA = bullet(41, 1, 0, 0, { hp: 1 });
  const shotB = bullet(42, 1, 0, 0, { hp: 2 });
  const game = buildGame([rail, shotA, shotB]);
  game.resolveBulletCollisions();
  assert.equal(rail.dead, true);
  assert.deepEqual(game.creditEvents, [true]);
  assert.equal(game.texts.length, 1);
});

test('player credit expires before a later enemy-only rail hit', () => {
  const rail = bullet(50, 2, 0, 0, { __novaRail: true, hp: 5 });
  const playerShot = bullet(51, 1, 0, 0, { hp: 1 });
  const game = buildGame([rail, playerShot]);
  game.resolveBulletCollisions();
  assert.deepEqual(game.creditEvents, [true]);
  assert.equal(rail.hp, 4);

  game.time += 1 / 60;
  const enemyShot = bullet(52, 3, 0, 0, { hp: 1 });
  game.bullets = [rail, enemyShot];
  game.resolveBulletCollisions();
  assert.deepEqual(game.creditEvents, [true, false]);
});

test('reversed rail pair order remains credited through 32+ projectile broad phase', () => {
  const playerShot = bullet(60, 1, 0, 0, { px: 100 });
  const rail = bullet(61, 2, 100, 0, { px: 0, __novaRail: true, hp: 1 });
  const distant = Array.from({ length: 40 }, (_, i) =>
    bullet(100 + i, 3, 1000 + i * 30, 1000));
  const game = buildGame([playerShot, rail, ...distant]);
  game.resolveBulletCollisions();
  assert.equal(rail.dead, true);
  assert.deepEqual(game.creditEvents, [true]);
  assert.equal(game.texts[0][2], 'RAIL DENIED');
});

test('diagonal swept player rail interception anchors ring and credit text at contact', () => {
  const rail = bullet(70, 2, 100, 60, { px: 0, py: 0, __novaRail: true, hp: 1 });
  const playerShot = bullet(71, 1, 0, 0, { px: 100, py: 60 });
  const game = buildGame([rail, playerShot]);
  game.resolveBulletCollisions();
  assert.equal(rail.dead, true);
  assert.deepEqual(game.creditEvents, [true]);
  assert.ok(Math.abs(game.rings[0][0] - 50) < 1e-8);
  assert.ok(Math.abs(game.rings[0][1] - 30) < 1e-8);
  assert.ok(Math.abs(game.texts[0][0] - 50) < 1e-8);
  assert.ok(Math.abs(game.texts[0][1] - 12) < 1e-8);
});

test('contact feedback survives missing particle renderer and reversed broad-phase order', () => {
  const playerShot = bullet(80, 1, 0, 0, { px: 100, py: 60 });
  const rail = bullet(81, 2, 100, 60, { px: 0, py: 0, __novaRail: true, hp: 1 });
  const distant = Array.from({ length: 40 }, (_, i) => bullet(200 + i, 3, 1000 + i * 30, 1000));
  const game = buildGame([playerShot, rail, ...distant]);
  game.addParticles = null;
  game.resolveBulletCollisions();
  assert.equal(rail.dead, true);
  assert.ok(Math.abs(game.rings[0][0] - 50) < 1e-8);
  assert.ok(Math.abs(game.rings[0][1] - 30) < 1e-8);
});
