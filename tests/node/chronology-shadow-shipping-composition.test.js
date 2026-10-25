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


/* Issue #234: the optional diagnostic reports registered first contacts after
 * the bounded gameplay fix, without changing combat when toggled. */
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
      assert.equal(s.unregisteredBodyContacts, 0);
      assert.equal(s.registeredBodyContacts, 1);
      assert.equal(g.hits, 1, 'earlier physical contact must be applied once');
      assert.equal(target.hp, 80);
      assert.equal(s.events.some(e => e.kind === 'unregistered-body-contact'), false);
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
    assert.equal(s.registeredBodyContacts, 1);
    assert.equal(g.hits, 1);
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
  assert.equal(s.registeredBodyContacts, 1);
  assert.equal(s.terrainOccludedBodyContacts, 0);
  assert.equal(target.hp, 80);
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
  assert.equal(target.hp, 80);
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


test('short-TTL shadow includes canonical penetrating rounds before first contact', () => {
  for (const pen of [0, 1, 3, 10]) {
    const { g } = boot(), target = addScout(g);
    const b = ordinaryShot(2000 + pen);
    b.pen = pen;
    g.bullets = [b];
    g.updateBullets(1 / 30);
    const s = g.novaChronoShadowSnapshot();
    assert.equal(s.predictedBodyContacts, 1, 'first body candidate with pen=' + pen);
    assert.equal(s.registeredBodyContacts, 1, 'physical first hit registered with pen=' + pen);
    assert.equal(target.hp, 80);
  }
});


test('ordinary 500u/s round also loses a legitimate last-frame contact', () => {
  const { g } = boot(), target = addScout(g, 23);
  const b = ordinaryShot(2100, 0, 500, .005);
  b.pen = 1;
  g.bullets = [b];
  g.updateBullets(1 / 60);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.predictedBodyContacts, 1);
  assert.equal(s.registeredBodyContacts, 1);
  assert.equal(s.events.some(e => e.kind === 'unregistered-body-contact'), false);
  assert.equal(target.hp, 80, 'earlier physical hit must survive TTL expiry');
});


test('opt-in shadow is combat-equivalent to disabled mode across 320 seeded worlds', () => {
  const active = boot(), inactive = boot();
  inactive.window.__NOVA_CHRONO_SHADOW_ENABLED__ = false;
  let seed = 0x3282026;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 320; i++) {
    const fps = [30, 60, 120, 240][i % 4], dt = 1 / fps;
    const speed = 300 + random() * 6500, ttl = .001 + random() * .022;
    const x = 15 + random() * 100, y = (random() - .5) * 25;
    const moving = i % 3 === 0, wall = i % 5 === 0;
    const kind = i % 7 === 0 ? 'shell' : 'ordinary';
    const results = [];
    for (const { g } of [active, inactive]) {
      const target = addScout(g, x, y);
      if (moving) {
        target.__novaSweepMoveTime = g.time;
        target.__novaSweepPrevX = x;
        target.__novaSweepPrevY = y + 15;
      }
      g.__novaTerrain = wall
        ? [{ id: -1, shape: 'rect', x: 22, y: 0, w: 8, h: 100,
             solid: true, destructible: false }]
        : [];
      const bullet = ordinaryShot(3000 + i, 0, speed, ttl);
      bullet.pen = i % 3;
      bullet.shell = kind === 'shell';
      bullet.hp = 10; bullet.maxHp = 10;
      g.bullets = [bullet];
      g.burstOrigins = [];
      g.hits = 0;
      g.updateBullets(dt);
      results.push({
        hp: target.hp, hits: g.hits,
        bursts: g.burstOrigins.map(v => [v.id, v.x, v.y]),
        bullets: g.bullets.map(v => [v.id, v.x, v.y, v.vx, v.vy,
          v.ttl, v.pen, v.hits, v.dead, v.shell]),
        cover: g.__novaTerrain.map(v => [v.hp, v.solid])
      });
    }
    assert.deepEqual(results[0], results[1],
      'opt-in shadow changed shipping combat outcome in seeded world ' + i);
  }
});


test('mixed fire retains independent bounded shell and ordinary audit coverage', () => {
  const { g } = boot(), target = addScout(g);
  g.bullets = Array.from({ length: 100 }, (_, i) => {
    const b = ordinaryShot(5000 + i);
    b.shell = i % 2 === 0;
    b.hp = 10; b.maxHp = 10;
    return b;
  });
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.sampledShells, 12, 'ordinary fire cannot starve shell audit');
  assert.equal(s.sampledShortShots, 12, 'shells cannot starve short-shot audit');
  assert.equal(s.ttlOvershoots, 12);
  assert.equal(s.predictedBodyContacts, 12);
  assert.equal(s.unregisteredBodyContacts, 12);
  assert.equal(s.events.length, 12, 'shared event ring remains bounded');
  assert.equal(target.hp, 100);
});


for (const fps of [30, 60, 120, 240]) {
  test('exact-frame TTL expiry is still a short-shot first-body candidate at ' + fps + 'Hz', () => {
    const { g } = boot(), target = addScout(g, 23);
    const b = ordinaryShot(7000 + fps, 0, 500, 1 / fps);
    b.pen = 1;
    g.bullets = [b];
    g.updateBullets(1 / fps);
    const s = g.novaChronoShadowSnapshot();
    assert.equal(s.sampledShortShots, 1);
    assert.equal(s.predictedBodyContacts, 1);
    assert.equal(s.registeredBodyContacts, 1);
    assert.equal(target.hp, 80, 'contact precedes exact-frame expiration');
  });
}


/* An earlier hostile projectile contact makes the body-miss diagnostic
 * inconclusive, even though the shipping engine may still tunnel it. */
function competingShot(id, x, y = 0, ttl = 1, ownerId = 2) {
  return { ...ordinaryShot(id, x, 0, ttl), y, ownerId, hp: 10, maxHp: 10 };
}
test('short-TTL shadow classifies an earlier hostile interception as ambiguous', () => {
  const { g } = boot(), target = addScout(g);
  g.bullets = [ordinaryShot(8001), competingShot(8002, 10)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.sampledShortShots, 1);
  assert.equal(s.interceptionAmbiguousBodyContacts, 1);
  assert.equal(s.predictedBodyContacts, 0);
  assert.equal(s.unregisteredBodyContacts, 0);
  assert.equal(target.hp, 100);
});
test('short-TTL shadow retains a first-body miss when interception is later', () => {
  const { g } = boot();
  addScout(g);
  g.bullets = [ordinaryShot(8003), competingShot(8004, 29)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.interceptionAmbiguousBodyContacts, 0);
  assert.equal(s.predictedBodyContacts, 1);
  assert.equal(s.registeredBodyContacts, 1);
});
test('same-owner bullets do not create a false interception ambiguity', () => {
  const { g } = boot();
  addScout(g);
  g.bullets = [ordinaryShot(8005), competingShot(8006, 10, 0, 1, 1)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.interceptionAmbiguousBodyContacts, 0);
  assert.equal(s.unregisteredBodyContacts, 1);
});
test('competitor that expires before interception cannot hide a body miss', () => {
  const { g } = boot();
  addScout(g);
  g.bullets = [ordinaryShot(8007), competingShot(8008, 10, 0, .0001)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.interceptionAmbiguousBodyContacts, 0);
  assert.equal(s.unregisteredBodyContacts, 1);
});
test('spatially separated hostile projectile cannot hide a body miss', () => {
  const { g } = boot();
  addScout(g);
  g.bullets = [ordinaryShot(8009), competingShot(8010, 10, 100)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.interceptionAmbiguousBodyContacts, 0);
  assert.equal(s.registeredBodyContacts, 1);
});


test('crossing hostile projectile is an ambiguity before body contact', () => {
  const { g } = boot();
  addScout(g);
  const other = competingShot(8011, 12, 20);
  other.vy = -10000;
  g.bullets = [ordinaryShot(8012), other];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.interceptionAmbiguousBodyContacts, 1);
  assert.equal(s.unregisteredBodyContacts, 0);
});
test('dense opt-in audit skips unbounded interception scans safely', () => {
  const { g } = boot(), target = addScout(g);
  g.bullets = Array.from({ length: 257 }, (_, i) =>
    competingShot(9000 + i, 1000 + i, 200, 1, 1));
  g.bullets[12] = ordinaryShot(9012);
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.sampledShortShots, 1);
  assert.equal(s.interceptionUnscannedBodyContacts, 1);
  assert.equal(s.predictedBodyContacts, 0);
  assert.equal(s.unregisteredBodyContacts, 0);
  assert.equal(target.hp, 80, 'one isolated expiring shot remains eligible in dense distant fire');
});


/* Run 330: a spawn-shielded body is a real projectile obstacle, but it
 * cannot be counted as an unregistered damage contact. Do not look through
 * a nearer protected body to invent a miss on a farther vulnerable tank. */
test('short-TTL audit excludes a spawn-shielded first body', () => {
  const { g } = boot(), protectedTank = addScout(g, 40);
  protectedTank.spawnShieldT = 1;
  g.bullets = [ordinaryShot(8301)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.predictedBodyContacts, 0);
  assert.equal(s.unregisteredBodyContacts, 0);
});
test('nearer spawn-shielded body masks a vulnerable body behind it', () => {
  const { g } = boot(), protectedTank = addScout(g, 35);
  protectedTank.spawnShieldT = 1;
  const rear = { id: 3, kind: 'tank', cls: 'scout', x: 45, y: 0,
    hp: 100, alive: true, spawnShieldT: 0 };
  g.tanks.push(rear);
  g.bullets = [ordinaryShot(8302)];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, 0);
});
test('vulnerable first body remains a valid diagnostic before a shielded rear body', () => {
  const { g } = boot(), front = addScout(g, 35);
  front.spawnShieldT = 0;
  g.tanks.push({ id: 3, kind: 'tank', cls: 'scout', x: 55, y: 0,
    hp: 100, alive: true, spawnShieldT: 1 });
  g.bullets = [ordinaryShot(8303)];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, 1);
  assert.equal(g.novaChronoShadowSnapshot().unregisteredBodyContacts, 1);
});
test('allied different-owner projectile cannot conceal a true short-TTL miss', () => {
  const { g } = boot(), target = addScout(g);
  const owner = { id: 1, teamId: 'blue' }, teammate = { id: 9, teamId: 'blue' };
  target.teamId = 'red';
  g.getTank = id => id === 1 ? owner : id === 9 ? teammate : null;
  g.areAllies = (a, b) => a.teamId === b.teamId;
  g.bullets = [ordinaryShot(8304), competingShot(8305, 10, 0, 1, 9)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.interceptionAmbiguousBodyContacts, 0);
  assert.equal(s.predictedBodyContacts, 1);
  assert.equal(s.unregisteredBodyContacts, 1);
});

test('known hostile projectile still makes earlier interception ambiguous', () => {
  const { g } = boot(), target = addScout(g);
  const owner = { id: 1, teamId: 'blue' }, enemy = { id: 9, teamId: 'red' };
  target.teamId = 'red';
  g.getTank = id => id === 1 ? owner : id === 9 ? enemy : null;
  g.areAllies = (a, b) => a.teamId === b.teamId;
  g.bullets = [ordinaryShot(8306), competingShot(8307, 10, 0, 1, 9)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.interceptionAmbiguousBodyContacts, 1);
  assert.equal(s.predictedBodyContacts, 0);
});

/* Core damageTank rejects these two additional immunity states before HP
 * damage. The optional chronology audit must not call them missing hits. */
for (const protection of ['shieldT', 'bulwarkT']) {
  test('short-TTL audit does not misreport core '+protection+' immunity', () => {
    const { g } = boot(), target = addScout(g, 40);
    target[protection] = 1;
    g.bullets = [ordinaryShot(8400 + protection.length)];
    g.updateBullets(1 / 30);
    const s = g.novaChronoShadowSnapshot();
    assert.equal(s.predictedBodyContacts, 0);
    assert.equal(s.unregisteredBodyContacts, 0);
  });
  test(protection+' masks a vulnerable rear tank but not a vulnerable front tank', () => {
    const { g } = boot(), protectedTank = addScout(g, 35);
    protectedTank[protection] = 1;
    g.tanks.push({ id: 3, kind: 'tank', cls: 'scout', x: 55, y: 0,
      hp: 100, alive: true });
    g.bullets = [ordinaryShot(8500 + protection.length)];
    g.updateBullets(1 / 30);
    assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, 0);
    const { g: second } = boot(), first = addScout(second, 35);
    second.tanks.push({ id: 3, kind: 'tank', cls: 'scout', x: 55, y: 0,
      hp: 100, alive: true, [protection]: 1 });
    second.bullets = [ordinaryShot(8600 + protection.length)];
    second.updateBullets(1 / 30);
    assert.equal(second.novaChronoShadowSnapshot().predictedBodyContacts, 1);
  });
}

test('bulwark defense is counted as ambiguous rather than proven immunity', () => {
  const { g } = boot(), tank = addScout(g, 40);
  tank.bulwarkT = 1;
  tank.angle = Math.PI; // incoming projectile may be rear-side to the Guardian
  g.bullets = [ordinaryShot(8701)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.defenseAmbiguousBodyContacts, 1,
    'Guardian directional defense can reduce damage rather than make it zero');
  assert.equal(s.unregisteredBodyContacts, 0);
});
test('unconditional core shield remains distinct from Guardian ambiguity', () => {
  const { g } = boot(), tank = addScout(g, 40);
  tank.shieldT = 1;
  g.bullets = [ordinaryShot(8702)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.defenseAmbiguousBodyContacts, 0);
  assert.equal(s.unregisteredBodyContacts, 0);
});

test('Guardian taunt state is also uncertain under directional Perfect Guard', () => {
  const { g } = boot(), tank = addScout(g, 40);
  tank.tauntT = 1;
  tank.angle = Math.PI;
  g.bullets = [ordinaryShot(8801)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.defenseAmbiguousBodyContacts, 1);
  assert.equal(s.unregisteredBodyContacts, 0);
});
test('terrain occlusion outranks Guardian taunt ambiguity', () => {
  const { g } = boot(), tank = addScout(g, 40);
  tank.tauntT = 1;
  g.__novaTerrain = [{ id: -8802, shape: 'rect', x: 10, y: 0,
    w: 8, h: 80, solid: true, destructible: false }];
  g.bullets = [ordinaryShot(8802)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.terrainOccludedBodyContacts, 1);
  assert.equal(s.defenseAmbiguousBodyContacts, 0);
});


/* Run 337: first physical body may be a neutral shape or drone, not a tank.
 * These are opt-in diagnostic assertions against the materialized core and
 * actual Sniper/Battlefield/Performance overlay composition. */
function auditShape(id, x, y = 0, hp = 20) {
  return { id, kind: 'shape', type: 'circle', x, y, r: 5, hp, maxHp: 20 };
}
function auditDrone(id, ownerId, x, y = 0, hp = 20) {
  return { id, kind: 'drone', ownerId, x, y, r: 5, hp, maxHp: 20 };
}
for (const fps of [30, 60, 120]) {
  test('shadow first-contact ordering includes neutral shapes at ' + fps + 'Hz', () => {
    const { g } = boot(), tank = addScout(g, 40), shape = auditShape(51, 12);
    g.shapes = [shape];
    g.damageShape = (victim, damage) => { victim.hp -= damage; };
    g.bullets = [ordinaryShot(9300 + fps)];
    g.updateBullets(1 / fps);
    const s = g.novaChronoShadowSnapshot();
    assert.equal(s.predictedBodyContacts, 1);
    assert.equal(s.registeredBodyContacts, 1);
    assert.equal(s.events.some(e => e.kind === 'unregistered-body-contact'), false);
    assert.equal(shape.hp, 0, 'neutral first contact receives canonical damage');
    assert.equal(tank.hp, 100);
  });
}
test('shadow resolves earliest drone before shape and tank without touching combat', () => {
  const { g } = boot(), tank = addScout(g, 40);
  const shape = auditShape(51, 12), drone = auditDrone(61, 9, 12);
  g.shapes = [shape]; g.drones = [drone];
  g.bullets = [ordinaryShot(9340)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.predictedBodyContacts, 1);
  assert.equal(s.events[0].targetId, drone.id);
  assert.equal(s.events[0].targetKind, 'drone');
  assert.ok(Math.abs(s.events[0].expectedX - 3) < 1e-8);
  assert.equal(drone.hp, 20);
  assert.equal(shape.hp, 20);
  assert.equal(tank.hp, 100);
});
test('friendly drone cannot shadow a valid neutral first contact', () => {
  const { g } = boot(); addScout(g, 40);
  g.shapes = [auditShape(51, 12)];
  g.drones = [auditDrone(61, 1, 12)];
  g.bullets = [ordinaryShot(9341)];
  g.updateBullets(1 / 30);
  const event = g.novaChronoShadowSnapshot().events[0];
  assert.equal(event.targetId, 51);
  assert.equal(event.targetKind, 'shape');
});
test('allied owner metadata excludes allied drones but not hostile drones', () => {
  for (const allied of [true, false]) {
    const { g } = boot(); addScout(g, 40);
    const shooter = { id: 1, teamId: 'blue' }, other = { id: 9, teamId: allied ? 'blue' : 'red' };
    g.getTank = id => id === 1 ? shooter : id === 9 ? other : null;
    g.areAllies = (a, b) => a.teamId === b.teamId;
    g.drones = [auditDrone(61, 9, 12)];
    g.bullets = [ordinaryShot(9342)];
    g.updateBullets(1 / 30);
    const event = g.novaChronoShadowSnapshot().events[0];
    assert.equal(event.targetKind, allied ? 'tank' : 'drone');
    assert.equal(event.targetId, allied ? 2 : 61);
  }
});
test('dead or unreachable shapes and drones do not hide a reachable tank', () => {
  const { g } = boot(); addScout(g, 40);
  g.shapes = [auditShape(51, 12, 0, 0), auditShape(52, 100)];
  g.drones = [auditDrone(61, 9, 12, 0, 0), auditDrone(62, 9, 100)];
  g.bullets = [ordinaryShot(9343)];
  g.updateBullets(1 / 30);
  const event = g.novaChronoShadowSnapshot().events[0];
  assert.equal(event.targetId, 2);
  assert.equal(event.targetKind, 'tank');
});
test('crowded entity arrays fail closed rather than misattribute an unscanned first contact', () => {
  const { g } = boot(); addScout(g, 40);
  g.shapes = Array.from({ length: 161 }, (_, i) => auditShape(1000 + i, i === 0 ? 12 : 500));
  g.bullets = [ordinaryShot(9344)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.sampledShortShots, 1);
  assert.equal(s.predictedBodyContacts, 0);
  assert.equal(s.unregisteredBodyContacts, 0);
});

test('shadow does not invent a shape contact a fraction after projectile expiry', () => {
  const { g } = boot(); addScout(g, 100);
  g.shapes = [auditShape(51, 38 + 6e-7)];
  g.bullets = [ordinaryShot(9345)];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, 0);
});
test('shadow does not invent a tank contact a fraction after projectile expiry', () => {
  const { g } = boot(); addScout(g, 51 + 6e-7);
  g.bullets = [ordinaryShot(9346)];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, 0);
});
test('shadow abstains from mathematically tangent contacts but keeps clear grazing hits', () => {
  for (const [y, expected] of [[8, 0], [7.99999, 1], [8.00001, 0]]) {
    const { g } = boot(); addScout(g, 100);
    g.shapes = [auditShape(51, 20, y)];
    g.bullets = [ordinaryShot(9347)];
    g.updateBullets(1 / 30);
    assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts, expected,
      'near-tangent neutral body y=' + y);
  }
});

/* Run 338: the optional short-TTL audit must use Battlefield's frame-start
 * shape history, rather than treating a moved Crasher as a static endpoint. */
for(const [label,fromY,toY,expected] of [
 ['physical crossing',17,20.5,1],
 ['phantom endpoint',20.5,17,0]
]){
 test('shipping short-TTL shadow moving shape: '+label,()=>{
  const {g}=boot(),shape={id:5,kind:'shape',type:'crasher',x:10,y:toY,
   r:15,hp:20,maxHp:20,__novaShapeSweepEpoch:7,
   __novaShapeSweepPrevX:10,__novaShapeSweepPrevY:fromY};
  g.shapes=[shape];g.__novaShapeSweepEpoch=7;g.__novaShapeSweepActive=true;
   g.damageShape=(victim,damage)=>{victim.hp-=damage;};
  g.bullets=[{...ordinaryShot(338,0,1500,.005)}];
  g.updateBullets(1/30);
  const s=g.novaChronoShadowSnapshot();
  assert.equal(s.sampledShortShots,1);
  assert.equal(s.predictedBodyContacts,expected);
  assert.equal(s.registeredBodyContacts,expected);
  assert.equal(shape.hp,20-20*expected,'physical crossing changes damage, phantom crossing does not');
 });
}
test('shipping short-TTL shadow refuses teleport-gap body prediction',()=>{
 const {g}=boot(),shape={id:5,kind:'shape',type:'star',x:10,y:0,
  r:15,hp:20,maxHp:20,__novaShapeSweepEpoch:7,
  __novaShapeSweepPrevX:10,__novaShapeSweepPrevY:150};
 g.shapes=[shape];g.__novaShapeSweepEpoch=7;g.__novaShapeSweepActive=true;
 g.bullets=[{...ordinaryShot(339,0,1500,.005)}];
 g.updateBullets(1/30);
 assert.equal(g.novaChronoShadowSnapshot().predictedBodyContacts,0);
});
