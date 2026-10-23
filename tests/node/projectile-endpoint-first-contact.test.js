'use strict';
// Issue #147: a projectile whose endpoint overlaps multiple bodies must
// hit the first physical contact, not whichever entity the spatial hash returns.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function coreBulletMethod() {
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'shipping bullet updater missing');
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
function boot(performanceLayer) {
  class Hash {
    constructor() { this.targets = []; }
    query(x, y, r, out) { out.length = 0; out.push(...this.targets); }
  }
  class Game {
    constructor() {
      this.hash = new Hash(); this.tmp = []; this.bullets = [];
      this.__novaTerrain = []; this.time = 1;
    }
  }
  for (const k of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles', 'splashAt',
    'updateDrones', 'update', 'addRing', 'clusterBurst', 'weakenBullet'])
    Game.prototype[k] = function() {};
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function(t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = () => null;
  Game.prototype.updateBullets = coreBulletMethod();
  Game.prototype.damageTank = function(e, n) { this.contacts.push(e.id); e.hp -= n; };
  Game.prototype.damageShape = function(e, n) { this.contacts.push(e.id); e.hp -= n; };
  Game.prototype.damageDrone = function(e, n) { this.contacts.push(e.id); e.hp -= n; };
  function Sfx() {}
  Sfx.prototype.resume = function() {};
  const modules = {
    'game/audio': m => { m.exports = { Sfx }; },
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const context = { window: { __novaModules: modules },
    console: { info() {}, warn() {}, error() {} },
    Math, Map, Date, performance: { now: () => 0 } };
  const layers = ['battlefield-v1.6.0.js'];
  if (performanceLayer) layers.push('performance-v1.7.5.js');
  for (const file of layers)
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 15 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('Unexpected dependency ' + spec);
  });
  return m.exports.Game;
}
function body(kind, id, x) {
  const b = { kind, id, x, y: 0, r: 18, hp: 100, alive: true };
  if (kind === 'tank') b.cls = 'scout';
  if (kind === 'drone') b.ownerId = 2;
  return b;
}
function shot(pen = 0) {
  return { kind: 'bullet', id: 9, ownerId: 1, x: -100, y: 0,
    vx: 115, vy: 0, r: 3, dmg: 5, pen, hits: 0, ttl: 3, dead: false };
}
for (const perf of [false, true]) {
  const mode = perf ? 'Battlefield + Performance' : 'Battlefield';
  for (const [nearKind, farKind] of [
    ['tank', 'shape'], ['shape', 'tank'], ['drone', 'tank'], ['tank', 'drone']]) {
    test(mode + ': first physical ' + nearKind + ' contact wins over hash-ordered ' + farKind, () => {
      for (const reverse of [false, true]) {
        const Game = boot(perf), g = new Game();
        const near = body(nearKind, 2, 0), far = body(farKind, 3, 16);
        g.contacts = [];
        g.hash.targets = reverse ? [near, far] : [far, near];
        g.bullets = [shot()];
        g.updateBullets(1);
        assert.deepEqual(g.contacts, [2],
          'near target should win independently of spatial hash order');
        assert.equal(near.hp, 95);
        assert.equal(far.hp, 100);
      }
    });
  }
  test(mode + ': penetrating projectile selects earliest endpoint contact first', () => {
    const Game = boot(perf), g = new Game();
    const near = body('tank', 2, 0), far = body('tank', 3, 16);
    g.contacts = []; g.hash.targets = [far, near];
    g.bullets = [shot(3)];
    g.updateBullets(1);
    assert.deepEqual(g.contacts, [2]);
    assert.equal(g.bullets[0].pen, 2);
  });
  test(mode + ': a sole endpoint contact is unchanged', () => {
    const Game = boot(perf), g = new Game();
    const far = body('tank', 3, 16);
    g.contacts = []; g.hash.targets = [far];
    g.bullets = [shot()];
    g.updateBullets(1);
    assert.deepEqual(g.contacts, [3]);
  });
}
