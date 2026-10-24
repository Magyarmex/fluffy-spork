'use strict';
// Exercise the audit with the actual shipping core and layered combat wrappers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function coreMethod() {
  const marker = '    updateBullets(dt) {';
  const at = html.indexOf(marker);
  assert.ok(at >= 0);
  let pos = at + marker.length, depth = 1;
  while (depth && pos < html.length) {
    if (html[pos] === '{') depth++;
    else if (html[pos] === '}') depth--;
    pos++;
  }
  assert.equal(depth, 0);
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(at + marker.length, pos - 1) + '}')(
    { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
    { CLASSES: { scout: { size: 15 } } }, 2250);
}

function boot() {
  class Game {
    constructor() {
      this.bullets = []; this.burstOrigins = []; this.time = 1;
      this.__novaTerrain = []; this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
      this.tmp = []; this.tanks = []; this.drones = []; this.shapes = [];
      this.cam = { shake: 0 }; this.tankById = new Map();
    }
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'updateDrones', 'update', 'moveTank', 'damageTank', 'damageDrone',
    'damageShape', 'setClass', 'addParticles', 'addRing', 'addImpactDebris',
    'splashAt', 'initBulletIntegrity', 'useAbility', 'addFlash'])
    Game.prototype[name] = function() {};
  Game.prototype.resolveBulletCollisions = function() {};
  Game.prototype.updateBullets = coreMethod();
  Game.prototype.weakenBullet = function(b, damage) {
    b.hp -= damage; if (b.hp <= 0) b.dead = true;
  };
  Game.prototype.clusterBurst = function(b) {
    this.burstOrigins.push({ id: b.id, x: b.x, y: b.y });
  };
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.getTank = () => null;
  class Sfx { resume() {} }
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/render': m => { m.exports = { render() {} }; },
    'game/ai': m => { m.exports = { updateAI() {} }; }
  };
  const window = { __novaModules: modules, __NOVA_CHRONO_SHADOW_ENABLED__: true };
  const context = { window, console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Date, Number, Object, performance: { now: () => 0 },
    document: {}, navigator: {} };
  for (const file of ['sniper-v1.2.0.js', 'polish-v1.3.1.js',
    'battlefield-v1.6.0.js', 'apex-disciplines-v1.7.1.js',
    'performance-v1.7.5.js', 'performance-v1.7.8.js',
    'precision-contact-v1.8.3.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  }
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => spec.includes('classes')
    ? { CLASSES: { scout: { size: 15 } }, lineageForClass: () => null }
    : { ARENA_HALF: 2250 });
  return { g: new m.exports.Game(), window };
}
function shell(id, x, vx, ttl) {
  return { id, kind: 'bullet', ownerId: 1, x, y: 0, vx, vy: 0,
    r: 3, hp: 10, maxHp: 10, ttl, dmg: 8, pen: 0,
    shell: true, dead: false, hits: 0 };
}

for (const fps of [30, 60, 120, 240]) {
  test('shipping overlay stack: TTL overshoot is observed at ' + fps + 'Hz', () => {
    const { g, window } = boot();
    g.bullets = [shell(1, 0, 6000, 0.005)];
    const frames = Math.ceil(0.005 * fps);
    for (let i = 0; i < frames; i++) g.updateBullets(1 / fps);
    const s = g.novaChronoShadowSnapshot();
    assert.equal(s.frames, frames);
    assert.equal(s.sampledShells, frames);
    assert.equal(s.ttlOvershoots, 1);
    assert.equal(s.arenaOvershoots, 0);
    assert.equal(window.__NOVA_CHRONO_SHADOW_LAST__, g.__novaChronoShadow);
    assert.equal(g.burstOrigins.length, 1);
    assert.ok(Math.abs(g.burstOrigins[0].x - 6000 * frames / fps) < 1e-8);
  });
}

test('shipping Battlefield: wall before expiry is not a false alarm', () => {
  const { g } = boot();
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 100, y: 0,
    w: 40, h: 80, solid: true, destructible: false }];
  g.bullets = [shell(2, 0, 6000, 0.02)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.bursts, 1);
  assert.equal(s.ttlOvershoots, 0);
  assert.equal(g.burstOrigins.length, 1);
  assert.ok(g.burstOrigins[0].x <= 81);
});

test('shipping Battlefield: wall beyond TTL is correctly flagged', () => {
  const { g } = boot();
  g.__novaTerrain = [{ id: -2, shape: 'rect', x: 100, y: 0,
    w: 40, h: 80, solid: true, destructible: false }];
  g.bullets = [shell(3, 0, 6000, 0.005)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.bursts, 1);
  assert.equal(s.ttlOvershoots, 1);
  assert.ok(s.events[0].expectedX < g.burstOrigins[0].x);
});

test('shipping Sniper interception: early physical burst is not an overshoot', () => {
  const { g } = boot();
  g.bullets = [shell(4, -30, 3600, 1),
    { id: 5, kind: 'bullet', ownerId: 2, x: 30, y: 0,
      vx: -3600, vy: 0, r: 3, hp: 3, maxHp: 3,
      ttl: 1, dmg: 8, pen: 0, dead: false }];
  g.bullets[0].hp = 1; g.bullets[0].maxHp = 1;
  g.updateBullets(1 / 60);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(g.burstOrigins.length, 1);
  assert.equal(s.bursts, 1);
  assert.equal(s.ttlOvershoots, 0);
  assert.equal(s.arenaOvershoots, 0);
});
