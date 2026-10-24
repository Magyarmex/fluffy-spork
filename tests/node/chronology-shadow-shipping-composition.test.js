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


/* Issue #234: the optional diagnostic must measure the real short-TTL
 * body-first defect without changing hits, penetration, or shell behavior. */
function ordinaryShot(id, x = 0, speed = 6000, ttl = .005) {
  return { id, kind: 'bullet', ownerId: 1, x, y: 0, vx: speed, vy: 0,
    r: 3, dmg: 20, pen: 0, ttl, hits: 0, dead: false, shell: false, beam: false };
}
function addScout(g, x = 40, y = 0) {
  const t = { id: 2, kind: 'tank', cls: 'scout', x, y, hp: 100, alive: true };
  g.tanks = [t];
  g.hash.query = (_x, _y, _r, out) => { out.length = 0; out.push(t); };
  g.damageTank = (target, damage) => {
    target.hp -= damage;
    g.hits = (g.hits || 0) + 1;
  };
  return t;
}
for (const fps of [30, 60, 120, 240]) {
  test('shipping short-TTL shadow: physical scout contact at ' + fps + 'Hz', () => {
    const { g } = boot(), target = addScout(g);
    g.bullets = [ordinaryShot(101)];
    g.updateBullets(1 / fps);
    const s = g.novaChronoShadowSnapshot();
    assert.equal(s.sampledShells, 0);
    if (fps < 240) {
      assert.equal(s.sampledShortShots, 1);
      assert.equal(s.predictedBodyContacts, 1);
      assert.equal(s.unregisteredBodyContacts, 1);
      assert.equal(s.registeredBodyContacts, 0);
      assert.equal(g.hits || 0, 0, 'audit must not repair the actual core miss');
      assert.equal(target.hp, 100);
      assert.equal(s.events[0].kind, 'unregistered-body-contact');
      assert.equal(s.events[0].targetId, 2);
      assert.equal(s.events[0].ttl, .005, 'report pre-frame lifetime, not mutated core TTL');
      assert.ok(Math.abs(s.events[0].expectedX - 19) < 1e-8);
    } else {
      assert.equal(s.unregisteredBodyContacts, 0);
      assert.equal(g.hits, 1, 'core already hits before expiry at 240Hz');
      assert.equal(target.hp, 80);
    }
  });
}
for (const fps of [30, 60, 120]) {
  test('shipping short-TTL shadow: moving scout contact at ' + fps + 'Hz', () => {
    const { g } = boot(), t = addScout(g, 25, -20);
    t.__novaSweepMoveTime = g.time;
    t.__novaSweepPrevX = 25;
    t.__novaSweepPrevY = 20;
    g.bullets = [ordinaryShot(102)];
    g.updateBullets(1 / fps);
    const s = g.novaChronoShadowSnapshot();
    assert.equal(s.predictedBodyContacts, 1);
    assert.equal(s.unregisteredBodyContacts, 1);
    assert.equal(g.hits || 0, 0);
  });
}
test('short-TTL shadow rejects a target physically beyond expiry', () => {
  const { g } = boot(), target = addScout(g, 100);
  g.bullets = [ordinaryShot(103)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.sampledShortShots, 1);
  assert.equal(s.predictedBodyContacts, 0);
  assert.equal(s.unregisteredBodyContacts, 0);
  assert.equal(target.hp, 100);
});
test('short-TTL shadow does not flag an owner hit', () => {
  const { g } = boot(), target = addScout(g);
  target.id = 1;
  g.bullets = [ordinaryShot(104)];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, 0);
  assert.equal(g.novaChronoShadowSnapshot().unregisteredBodyContacts, 0);
});
test('short-TTL shadow excludes cover before the body, even if destructible', () => {
  const { g } = boot(), target = addScout(g);
  g.__novaTerrain = [{ id: -3, shape: 'rect', x: 10, y: 0, w: 8, h: 80,
    solid: true, destructible: true, hp: 1000 }];
  g.bullets = [ordinaryShot(105)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.predictedBodyContacts, 0);
  assert.equal(s.terrainOccludedBodyContacts, 1);
  assert.equal(s.unregisteredBodyContacts, 0);
  assert.equal(target.hp, 100);
});
test('short-TTL shadow does not mistake a wall beyond the body for occlusion', () => {
  const { g } = boot(), target = addScout(g);
  g.__novaTerrain = [{ id: -4, shape: 'rect', x: 100, y: 0, w: 8, h: 80,
    solid: true, destructible: false }];
  g.bullets = [ordinaryShot(106)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.predictedBodyContacts, 1);
  assert.equal(s.unregisteredBodyContacts, 1);
  assert.equal(s.terrainOccludedBodyContacts, 0);
  assert.equal(target.hp, 100);
});
test('short-TTL shadow stays completely inactive when disabled', () => {
  const { g, window } = boot();
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = false;
  addScout(g);
  g.bullets = [ordinaryShot(107)];
  g.updateBullets(1 / 30);
  assert.equal(g.__novaChronoShadow, undefined);
  assert.equal(g.novaChronoShadowSnapshot().sampledShortShots, 0);
});
test('short-TTL diagnostic is bounded and cannot manufacture combat damage', () => {
  const { g } = boot(), target = addScout(g);
  g.bullets = Array.from({ length: 100 }, (_, i) => ordinaryShot(i + 200));
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.sampledShortShots, 12);
  assert.equal(s.predictedBodyContacts, 12);
  assert.equal(s.unregisteredBodyContacts, 12);
  assert.equal(s.events.length, 12);
  assert.equal(target.hp, 100);
});

test('short-TTL shadow excludes allied tanks without masking the core', () => {
  const { g } = boot(), target = addScout(g);
  const owner = { id: 1, teamId: 'blue' };
  target.teamId = 'blue';
  g.getTank = id => id === 1 ? owner : null;
  g.areAllies = (a, b) => a.teamId === b.teamId;
  g.bullets = [ordinaryShot(108)];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, 0);
  assert.equal(g.novaChronoShadowSnapshot().unregisteredBodyContacts, 0);
});
test('short-TTL shadow failures never block the real projectile updater', () => {
  const { g } = boot(), target = addScout(g);
  g.firstTerrainHit = () => { throw new Error('diagnostic-only failure'); };
  g.bullets = [ordinaryShot(109)];
  assert.doesNotThrow(() => g.updateBullets(1 / 30));
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.bodyAuditErrors, 1);
  assert.equal(s.predictedBodyContacts, 0);
  assert.equal(target.hp, 100);
});


test('short-TTL shadow never predicts a body after the arena exit', () => {
  const { g } = boot(), target = addScout(g, 2300);
  g.bullets = [ordinaryShot(110, 2200, 6000, .005)];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, 0);
  assert.equal(target.hp, 100);
});
test('short-TTL first-body comparator matches independent closest-approach oracle', () => {
  const { g } = boot();
  let seed = 0x2342026;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const dt = 1 / 30, ttl = .005, radius = 3 + 15 + 3;
  for (let i = 0; i < 600; i++) {
    const b = ordinaryShot(1000 + i, (random() - .5) * 150, (random() - .5) * 12000, ttl);
    b.y = (random() - .5) * 150;
    b.vy = (random() - .5) * 12000;
    const moving = i % 2 === 0;
    const px = (random() - .5) * 150, py = (random() - .5) * 150;
    const t = addScout(g, px + (moving ? (random() - .5) * 60 : 0),
      py + (moving ? (random() - .5) * 60 : 0));
    if (moving) {
      t.__novaSweepMoveTime = g.time;
      t.__novaSweepPrevX = px;
      t.__novaSweepPrevY = py;
    }
    const fx = b.x - px, fy = b.y - py;
    const vx = b.vx - (t.x - px) / dt, vy = b.vy - (t.y - py) / dt;
    const a = vx * vx + vy * vy, dot = fx * vx + fy * vy;
    const closest = a > 0 ? Math.max(0, Math.min(ttl, -dot / a)) : 0;
    const dx = fx + vx * closest, dy = fy + vy * closest;
    const expected = dx * dx + dy * dy <= radius * radius;
    const before = g.novaChronoShadowSnapshot().predictedBodyContacts;
    g.bullets = [b];
    g.updateBullets(dt);
    const after = g.novaChronoShadowSnapshot().predictedBodyContacts;
    assert.equal(after - before, expected ? 1 : 0,
      'independent closest-approach disagreement at seeded world ' + i);
  }
});
