'use strict';
// Issue #147: the shipping core must not charge a physical projectile more than
// once per victim merely because it remains inside that victim across frames.
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
  assert.ok(start >= 0, 'materialized shipping core bullet updater missing');
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
function boot(performanceLayer = false) {
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
  Game.prototype.damageTank = function(e, n) { e.hp -= n; e.hits = (e.hits || 0) + 1; };
  Game.prototype.damageShape = function(e, n) { e.hp -= n; e.hits = (e.hits || 0) + 1; };
  Game.prototype.damageDrone = function(e, n) { e.hp -= n; e.hits = (e.hits || 0) + 1; };
  function Sfx() {}
  Sfx.prototype.resume = function() {};
  const modules = {
    'game/audio': m => { m.exports = { Sfx }; },
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const context = { window: { __novaModules: modules },
    console: { info() {}, error() {}, warn() {} },
    Math, Map, Date, performance: { now: () => 0 } };
  const layers = ['battlefield-v1.6.0.js'];
  if (performanceLayer) layers.push('performance-v1.7.5.js');
  for (const name of layers)
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 15 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('Unexpected dependency: ' + spec);
  });
  return m.exports.Game;
}
function bullet(id = 1, x = -17, vx = 60) {
  return { kind: 'bullet', id, ownerId: 1, x, y: 0,
    vx, vy: 0, r: 3, pen: 50, ttl: 1, dmg: 5, hits: 0, dead: false };
}
function target(kind, id, x = 0) {
  const e = { kind, id, x, y: 0, hp: 1000, hits: 0, r: 12 };
  if (kind === 'tank') { e.cls = 'scout'; e.alive = true; }
  if (kind === 'drone') e.ownerId = 2;
  return e;
}
for (const perf of [false, true]) {
  const mode = perf ? 'Battlefield + Performance' : 'Battlefield';
  for (const kind of ['tank', 'shape', 'drone']) {
    test(mode + ': piercing projectile hits one ' + kind + ' once across 30-240 Hz', () => {
      for (const fps of [30, 60, 120, 240]) {
        const Game = boot(perf), g = new Game(), e = target(kind, 2);
        g.hash.targets = [e]; g.bullets = [bullet()];
        const query = g.hash.query;
        for (let i = 0; i < fps * .1; i++) {
          g.time += 1 / fps;
          g.updateBullets(1 / fps);
        }
        assert.equal(e.hits, 1, kind + ' repeated at ' + fps + ' Hz');
        assert.equal(e.hp, 995);
        assert.equal(g.hash.query, query, 'hash query restoration');
        assert.equal(Object.hasOwn(g.hash, 'query'), false);
      }
    });
  }
  test(mode + ': a single penetrating shot may hit two distinct victims', () => {
    const Game = boot(perf), g = new Game();
    const first = target('tank', 2, -8), second = target('tank', 3, 26);
    g.hash.targets = [first, second]; g.bullets = [bullet(1, -25, 140)];
    for (let i = 0; i < 30; i++) {
      g.time += 1 / 120; g.updateBullets(1 / 120);
    }
    assert.equal(first.hits, 1);
    assert.equal(second.hits, 1);
  });
  test(mode + ': two independent bullets may each hit the same victim', () => {
    const Game = boot(perf), g = new Game(), e = target('tank', 2);
    g.hash.targets = [e]; g.bullets = [bullet(1), bullet(2)];
    for (let i = 0; i < 6; i++) {
      g.time += 1 / 60; g.updateBullets(1 / 60);
    }
    assert.equal(e.hits, 2);
    assert.equal(e.hp, 990);
  });
  test(mode + ': exception restores all temporarily wrapped combat methods', () => {
    const Game = boot(perf), g = new Game(), e = target('tank', 2);
    g.hash.targets = [e]; g.bullets = [bullet()];
    const query = g.hash.query, damage = g.damageTank, splash = g.splashAt;
    g.damageTank = () => { throw new Error('injected damage failure'); };
    const failingDamage = g.damageTank;
    assert.throws(() => g.updateBullets(1 / 60), /injected damage failure/);
    assert.equal(g.hash.query, query);
    assert.equal(g.damageTank, failingDamage);
    assert.equal(g.splashAt, splash);
    assert.notEqual(g.damageTank, damage);
  });
}

for (const perf of [false, true]) {
  const mode = perf ? 'Battlefield + Performance' : 'Battlefield';
  test(mode + ': identical projectile coordinates do not confuse nested splash queries', () => {
    const Game = boot(perf), g = new Game(), e = target('tank', 2);
    g.hash.targets = [e];
    const b1 = bullet(1), b2 = bullet(2);
    // A splash query deliberately has the same x/y/r as the next core bullet
    // query (r = 3 + 46), but it is not another direct projectile contact.
    b1.splash = b2.splash = 49;
    g.splashAt = function(x, y, radius) {
      this.splashQueries = (this.splashQueries || 0) + 1;
      this.hash.query(x, y, radius, this.tmp);
    };
    const splash = g.splashAt, query = g.hash.query;
    g.bullets = [b1, b2];
    for (let i = 0; i < 12; i++) {
      g.time += 1 / 120; g.updateBullets(1 / 120);
    }
    assert.equal(e.hits, 2, 'each physical projectile may contact once');
    assert.equal(g.splashQueries, 2);
    assert.equal(b1.__novaDirectVictims.size, 1);
    assert.equal(b2.__novaDirectVictims.size, 1);
    assert.equal(g.splashAt, splash, 'existing own splash method restored');
    assert.equal(g.hash.query, query);
  });
  test(mode + ': single-contact rounds do not allocate piercing ledgers', () => {
    const Game = boot(perf), g = new Game(), e = target('tank', 2);
    g.hash.targets = [e]; g.bullets = [bullet(1, -17, 60)];
    const b = g.bullets[0]; b.pen = 0;
    g.updateBullets(1 / 60);
    assert.equal(e.hits, 1);
    assert.equal(g.bullets.length, 0);
    assert.equal(b.__novaDirectVictims, undefined);
  });
}

test('direct-contact query signature is still present in the canonical shipping core', () => {
  assert.ok(html.includes('this.hash.query(b.x, b.y, b.r + 46, this.tmp)'),
    'core query ordering changed: review Battlefield contact-ledger integration');
});
for (const perf of [false, true]) {
  test((perf ? 'Performance' : 'Battlefield') +
    ': dead bullet splices do not misattribute the next projectile contact', () => {
    const Game = boot(perf), g = new Game(), e = target('tank', 2);
    g.hash.targets = [e];
    const first = bullet(1), dead = bullet(2), last = bullet(3);
    dead.dead = true;
    g.bullets = [first, dead, last];
    for (let i = 0; i < 12; i++) {
      g.time += 1 / 120; g.updateBullets(1 / 120);
    }
    assert.equal(e.hits, 2, 'dead middle entry must not steal the next query');
    assert.equal(first.__novaDirectVictims.size, 1);
    assert.equal(last.__novaDirectVictims.size, 1);
    assert.equal(g.bullets.length, 2);
  });
  test((perf ? 'Performance' : 'Battlefield') +
    ': a non-piercing projectile removed between two piercing shots preserves identity', () => {
    const Game = boot(perf), g = new Game(), e = target('tank', 2);
    g.hash.targets = [e];
    const first = bullet(1), consumed = bullet(2), last = bullet(3);
    consumed.pen = 0;
    g.bullets = [first, consumed, last];
    for (let i = 0; i < 12; i++) {
      g.time += 1 / 120; g.updateBullets(1 / 120);
    }
    assert.equal(e.hits, 3, 'all three distinct projectiles get one direct hit');
    assert.equal(first.__novaDirectVictims.size, 1);
    assert.equal(last.__novaDirectVictims.size, 1);
    assert.equal(g.bullets.length, 2);
  });
}
