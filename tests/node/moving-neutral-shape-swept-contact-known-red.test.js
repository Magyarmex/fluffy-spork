'use strict';
// KNOWN RED: fast moving neutral shape crosses a projectile within one frame,
// but Battlefield currently sweeps the bullet against the shape's END position.
// Research gate only: do not merge until authoritative moving-shape collision
// and spatial broadphase are corrected without hurting normal game performance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const battlefield = fs.readFileSync(path.join(root,
  'nova-updates/battlefield-v1.6.0.js'), 'utf8');

function coreBullets() {
  const marker = '    updateBullets(dt) {', at = html.indexOf(marker);
  assert.ok(at >= 0, 'materialized canonical bullet method missing');
  let pos = at + marker.length, depth = 1;
  while (depth && pos < html.length) {
    if (html[pos] === '{') depth++;
    else if (html[pos] === '}') depth--;
    pos++;
  }
  assert.equal(depth, 0);
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(at + marker.length, pos - 1) + '}')(
    { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2,
      clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)) },
    { CLASSES: { scout: { size: 15 } } }, 2250);
}
function boot() {
  class Game {
    constructor() {
      this.bullets = []; this.shapes = []; this.tanks = []; this.drones = [];
      this.tmp = []; this.time = 1; this.__novaTerrain = []; this.hits = [];
      this.cam = { shake: 0 }; this.sfx = { explode() {} };
      this.hash = { query: (x, y, r, out) => {
        out.length = 0;
        for (const e of this.shapes) {
          if (Math.hypot(e.x - x, e.y - y) <= r + (e.r || 0)) out.push(e);
        }
      } };
    }
  }
  for (const name of ['spawnShape', 'spawnPlayer', 'spawnPowerup', 'tryFire',
    'moveTank', 'update', 'updateDrones', 'addParticles', 'addImpactDebris',
    'addRing', 'damageTank', 'damageDrone', 'splashAt', 'initBulletIntegrity',
    'resolveBulletCollisions', 'clusterBurst', 'useAbility', 'addFlash']) {
    Game.prototype[name] = function() {};
  }
  Game.prototype.updateBullets = coreBullets();
  Game.prototype.damageShape = function(s, dmg) {
    s.hp -= dmg; this.hits.push(s.id);
  };
  Game.prototype.randSpawnPos = () => ({ x: 1000, y: 1000 });
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/ai': m => { m.exports.updateAI = () => {}; },
    'game/render': m => { m.exports.render = () => {}; },
    'game/audio': m => { m.exports.Sfx = class {}; }
  };
  const window = { __novaModules: modules };
  new Function('window', 'console', battlefield)(
    window, { info() {}, warn() {}, error() {} });
  const mod = { exports: {} };
  modules['game/engine'](mod, mod.exports, id => id.includes('classes')
    ? { CLASSES: { scout: { size: 15 } } } : { ARENA_HALF: 2250 });
  return new mod.exports.Game();
}
function simulate(fps, moving = true) {
  const g = boot(), dt = 1 / fps;
  const s = { id: 5, kind: 'shape', type: 'star', x: 25,
    y: moving ? 20 : -20, r: 5, hp: 20, maxHp: 20 };
  g.shapes = [s];
  g.bullets = [{ id: 3, kind: 'bullet', ownerId: 1,
    x: 0, y: 0, vx: 1500, vy: 0, r: 3, dmg: 10,
    pen: 0, ttl: 1, hits: 0, dead: false, shell: false, beam: false }];
  for (let i = 0; i < Math.ceil(fps / 10) && g.bullets.length; i++) {
    if (moving) s.y -= 1200 * dt;
    g.updateBullets(dt);
  }
  return { hits: g.hits.length, hp: s.hp };
}
for (const fps of [30, 60, 120, 240]) {
  test('moving Star crossing a bullet is hit regardless of FPS at ' + fps + 'Hz', () => {
    const result = simulate(fps);
    assert.equal(result.hits, 1,
      'real shipping Battlefield must sweep BOTH bullet and moving shape');
    assert.equal(result.hp, 10);
  });
}
test('static shape outside bullet trajectory remains untouched', () => {
  const result = simulate(30, false);
  assert.equal(result.hits, 0);
  assert.equal(result.hp, 20);
});
test('materialized production loads Battlefield collision overlay', () => {
  assert.ok(html.includes('nova-updates/battlefield-v1.6.0.js'));
});
