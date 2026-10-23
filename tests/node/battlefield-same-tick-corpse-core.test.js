'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The original engine queries the same spatial hash for each bullet in reverse
// order. A killed shape remains in that hash until the next rebuild.
function boot(withPerformance = false) {
  function Game() {
    this.tmp = [];
    this.hash = { query(_x, _y, _r, out) { out.length = 0; out.push(...this.targets); }, targets: [] };
  }
  for (const k of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles',
    'splashAt', 'updateDrones', 'update']) Game.prototype[k] = function () {};
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = () => null;
  Game.prototype.updateBullets = function (dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      this.hash.query(b.x, b.y, b.r + 46, this.tmp);
      for (const e of this.tmp) {
        if (e.kind === 'shape') {
          const rr = b.r + e.r;
          if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < rr * rr) {
            this.damageShape(e, b.dmg, b.vx, b.vy);
            b.hits++; b.pen--;
            if (b.pen < 0) b.dead = true;
            break;
          }
        } else if (e.kind === 'tank' && e.alive && e.id !== b.ownerId) {
          const rr = b.r + 17;
          if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < rr * rr) {
            this.damageTank(e, b.dmg, b.ownerId);
            b.hits++; b.pen--;
            if (b.pen < 0) b.dead = true;
            break;
          }
        }
      }
      if (b.dead) this.bullets.splice(i, 1);
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
  for (const file of withPerformance ? ['battlefield-v1.6.0.js', 'performance-v1.7.5.js'] : ['battlefield-v1.6.0.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8'),
      context, { filename: file });
  }
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('Unexpected dependency: ' + spec);
  });
  return m.exports.Game;
}

for (const withPerformance of [false, true]) {
  const label = withPerformance ? 'Battlefield + Performance' : 'Battlefield';

  test(label + ': same-tick neutral kill is never repeated by the next projectile', () => {
    const Game = boot(withPerformance), g = new Game();
    g.time = 1; g.__novaTerrain = [];
    const shape = { kind: 'shape', id: 7, x: 0, y: 0, r: 20, hp: 10 };
    const tank = { kind: 'tank', id: 8, x: 0, y: 0, cls: 'scout', alive: true };
    g.hash.targets = [shape, tank];
    const query = g.hash.query;
    g.bullets = [0, 1].map(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 2, dmg: 15,
      pen: 0, hits: 0, ownerId: 1, dead: false }));
    let shapeDamage = 0, tankDamage = 0, killCount = 0;
    g.damageShape = e => { shapeDamage++; e.hp -= 15; if (e.hp <= 0) killCount++; };
    g.damageTank = e => { assert.equal(e, tank); tankDamage++; };
    g.updateBullets(.016);
    assert.equal(shapeDamage, 1, 'corpse was hit again in the same simulation tick');
    assert.equal(killCount, 1, 'corpse would award duplicate kill effects/XP');
    assert.equal(tankDamage, 1, 'second bullet should contact the live tank');
    assert.equal(g.bullets.length, 0);
    assert.equal(g.hash.query, query, 'original hash method must be restored');
  });

  test(label + ': live shapes remain visible to core projectile queries', () => {
    const Game = boot(withPerformance), g = new Game();
    g.time = 1; g.__novaTerrain = [];
    const shape = { kind: 'shape', id: 7, x: 0, y: 0, r: 20, hp: 100 };
    g.hash.targets = [shape];
    g.bullets = [{ x: 0, y: 0, vx: 0, vy: 0, r: 2, dmg: 10,
      pen: 0, hits: 0, ownerId: 1, dead: false }];
    let hits = 0;
    g.damageShape = e => { assert.equal(e, shape); hits++; };
    g.updateBullets(.016);
    assert.equal(hits, 1);
  });

  test(label + ': a thrown core update cannot leak the temporary hash-query guard', () => {
    const Game = boot(withPerformance), g = new Game();
    g.time = 1; g.__novaTerrain = [];
    const original = g.hash.query;
    g.hash.query = function () { throw new Error('injected query failure'); };
    const failing = g.hash.query;
    g.bullets = [{ x: 0, y: 0, vx: 0, vy: 0, r: 2, dmg: 10,
      pen: 0, hits: 0, ownerId: 1, dead: false }];
    assert.throws(() => g.updateBullets(.016), /injected query failure/);
    assert.equal(g.hash.query, failing);
    assert.notEqual(g.hash.query, original);
  });
}
