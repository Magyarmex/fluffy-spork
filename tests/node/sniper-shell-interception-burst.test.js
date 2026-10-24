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
      this.bullets = []; this.bursts = []; this.time = 1;
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
  Game.prototype.clusterBurst = function(b) { this.bursts.push(b.id); };
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
