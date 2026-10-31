const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBattlefield() {
  function Game() { this.hash = { query(x, y, r, out) { out.length = 0; } }; this.tmp = []; }
  Game.prototype.spawnPlayer = function () {};
  Game.prototype.randSpawnPos = function () { return { x: 1500, y: 1500 }; };
  Game.prototype.spawnShape = function () {};
  Game.prototype.spawnPowerup = function () {};
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; t.vx = vx; t.vy = vy; };
  Game.prototype.tryFire = function () {};
  Game.prototype.initBulletIntegrity = function () {};
  Game.prototype.resolveBulletCollisions = function () {};
  Game.prototype.addParticles = function () {};
  Game.prototype.updateBullets = function (dt) {
    for (const b of this.bullets || []) {
      if (!b || b.dead) continue;
      b.px = b.x; b.py = b.y;
      b.x += (b.vx || 0) * dt; b.y += (b.vy || 0) * dt;
    }
  };
  Game.prototype.splashAt = function () {};
  Game.prototype.updateDrones = function () {};
  Game.prototype.update = function () {};
  Game.prototype.getTank = function () { return null; };

  function Sfx() {}
  Sfx.prototype.resume = function () {};

  const modules = {
    'game/audio': function (module) { module.exports = { Sfx }; },
    'game/engine': function (module) { module.exports = { Game }; },
    'game/ai': function (module) { module.exports = { updateAI() {} }; },
    'game/render': function (module) { module.exports = { render() {} }; },
  };
  const context = {
    window: { __novaModules: modules },
    console,
    performance: { now: () => 0 },
    Date,
    Math,
    Map,
  };
  const src = fs.readFileSync(path.join(__dirname, '../../nova-updates/battlefield-v1.6.0.js'), 'utf8');
  vm.runInNewContext(src, context, { filename: 'battlefield-v1.6.0.js' });

  const engineModule = { exports: {} };
  modules['game/engine'](engineModule, engineModule.exports, (spec) => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error(`unexpected require ${spec}`);
  });
  return { context, Game: engineModule.exports.Game };
}

test('Battlefield publishes the v1.6.0 release surface', () => {
  const { context } = loadBattlefield();
  assert.equal(context.window.__NOVA_BATTLEFIELD_RELEASE__.version, '1.6.0');
  assert.equal(context.window.__NOVA_BATTLEFIELD_RELEASE__.codename, 'Battlefield');
});

test('Battlefield line-of-sight is blocked by a rectangle and clear around it', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0, w: 100, h: 100, solid: true, destructible: false }];
  assert.equal(g.hasLineOfSight(-150, 0, 150, 0, 0), false);
  assert.equal(g.hasLineOfSight(-150, 120, 150, 120, 0), true);
});

test('Battlefield uses swept terrain hits for fast projectiles', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0, w: 20, h: 160, solid: true, destructible: false }];
  const hit = g.firstTerrainHit(-500, 0, 500, 0, 2);
  assert.ok(hit, 'a projectile crossing the thin wall should hit');
  assert.ok(hit.hit.t > 0.45 && hit.hit.t < 0.55, `unexpected hit time: ${hit.hit.t}`);
});

test('Battlefield spawn safety rejects positions inside solid cover', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.__novaTerrain = [{ id: -1, shape: 'circle', x: 40, y: -20, r: 80, solid: true, destructible: false }];
  assert.equal(g.isTerrainSafe(40, -20, 10), false);
  assert.equal(g.isTerrainSafe(300, 300, 10), true);
});

test('Battlefield broad-phase rejects distant solids before exact collision math', () => {
  const { context, Game } = loadBattlefield();
  const g = new Game();
  g.__novaTerrain = [];
  let id = -1;
  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      g.__novaTerrain.push({ id: id--, shape: 'rect', x: x * 500, y: y * 500, w: 60, h: 60, solid: true, destructible: false });
    }
  }
  const count = context.window.__NOVA_BATTLEFIELD_PERF_TEST__.candidateCount(g, 0, 0, 20);
  assert.ok(count < g.__novaTerrain.length / 5, `expected strong pruning; candidates=${count}, total=${g.__novaTerrain.length}`);
  assert.equal(g.hasLineOfSight(-40, 100, 40, 100, 2), true);
  assert.equal(g.hasLineOfSight(-40, 0, 40, 0, 2), false);
});

test('Battlefield circle resolver preserves collision response with spatial candidates', () => {
  const { context, Game } = loadBattlefield();
  const g = new Game();
  g.__novaTerrain = [
    { id: -1, shape: 'rect', x: 0, y: 0, w: 100, h: 100, solid: true, destructible: false },
    { id: -2, shape: 'rect', x: 1800, y: 1800, w: 100, h: 100, solid: true, destructible: false },
  ];
  const e = { x: 45, y: 0, vx: -80, vy: 15 };
  const hit = context.window.__NOVA_BATTLEFIELD_PERF_TEST__.circleResolve(g, e, 20);
  assert.equal(hit, true);
  assert.ok(e.x >= 70, `expected entity outside padded wall, x=${e.x}`);
  assert.ok(e.__novaTerrainBump);
});


test('Battlefield breach preserves the projectile frame time budget', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.time = 1;
  g.__novaBattlefield = { coverBroken: 0, coverTotal: 1, name: 'TEST' };
  g.bullets = [{ x: -100, y: 0, vx: 1000, vy: 0, r: 4, dmg: 400, maxHp: 400, ownerId: -1, pen: 3, dead: false }];
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0, w: 20, h: 160, solid: true, destructible: true, hp: 100, maxHp: 100 }];
  g.weakenBullet = function () {};
  g.updateBullets(0.2);
  assert.equal(g.__novaTerrain[0].solid, false, 'cover should be breached');
  assert.equal(g.bullets[0].pen, 1, 'breaching cover should retain the existing penetration cost');
  assert.ok(Math.abs(g.bullets[0].x - 100) < 1e-9, `projectile should advance exactly one frame (expected 100, got ${g.bullets[0].x})`);
});


test('Battlefield resolves a spent breaching projectile at the cover impact', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.time = 1;
  g.__novaBattlefield = { coverBroken: 0, coverTotal: 1, name: 'TEST' };
  const spent = { x: -100, y: 0, vx: 1000, vy: 0, r: 4, dmg: 400, maxHp: 400, ownerId: -1, pen: 3, dead: false, shell: true };
  g.bullets = [spent];
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0, w: 20, h: 160, solid: true, destructible: true, hp: 100, maxHp: 100 }];
  g.weakenBullet = function (b) { b.dead = true; };
  let burst = null;
  g.clusterBurst = function (b) { burst = { x: b.x, y: b.y }; };
  g.updateBullets(0.2);
  assert.equal(g.__novaTerrain[0].solid, false, 'cover should still be breached');
  assert.equal(spent.dead, true, 'spent projectile should remain dead');
  assert.ok(burst, 'spent shell should resolve its impact burst');
  assert.ok(burst.x < 0 && burst.x > -20, `burst should resolve at the cover impact, got x=${burst.x}`);
});


test('Battlefield runtime catches a hypervelocity tank crossing missed by endpoint collision', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.time = 1;
  g.__novaBattlefield = { coverBroken: 0, coverTotal: 0, name: 'TEST' };
  g.__novaTerrain = [];
  const target = { kind: 'tank', id: 2, alive: true, cls: 'scout', x: 0, y: 0 };
  const bullet = { x: -100, y: 0, vx: 1000, vy: 0, r: 4, dmg: 20, maxHp: 20, ownerId: 1, pen: 0, hits: 0, dead: false };
  g.bullets = [bullet];
  g.hash.query = function (x, y, r, out) { out.length = 0; out.push(target); };
  let damaged = null;
  g.damageTank = function (e) { damaged = e; };
  g.updateBullets(0.2);
  assert.equal(damaged, target);
  assert.equal(bullet.dead, true);
  assert.ok(bullet.x < 0 && bullet.x > -30, `expected first-contact impact, got x=${bullet.x}`);
});


test('Battlefield CCD resolves projectile motion relative to a moving tank', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.time = 1; g.__novaBattlefield = { coverBroken: 0, coverTotal: 0, name: 'TEST' }; g.__novaTerrain = [];
  const target = { kind: 'tank', id: 2, alive: true, cls: 'scout', x: 0, y: -21.2 };
  g.hash.query = function (x, y, r, out) { out.length = 0; out.push(target); };
  g.moveTank(target, 0, 42.4, 1);
  const bullet = { x: -100, y: 0, vx: 200, vy: 0, r: 4, dmg: 20, maxHp: 20, ownerId: 1, pen: 0, hits: 0, dead: false };
  g.bullets = [bullet]; let damaged = null; g.damageTank = e => { damaged = e; };
  g.updateBullets(1);
  assert.equal(damaged, target);
  assert.equal(bullet.dead, true);
  assert.ok(bullet.x < 0 && bullet.x > -30, `expected moving-target first contact, got x=${bullet.x}`);
});

test('Battlefield CCD ignores stale tank motion history', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.time = 1; g.__novaBattlefield = { coverBroken: 0, coverTotal: 0, name: 'TEST' }; g.__novaTerrain = [];
  const target = { kind: 'tank', id: 2, alive: true, cls: 'scout', x: 0, y: -21.2 };
  g.moveTank(target, 0, 42.4, 1); g.time = 2;
  g.hash.query = function (x, y, r, out) { out.length = 0; out.push(target); };
  const bullet = { x: -100, y: 0, vx: 200, vy: 0, r: 4, dmg: 20, maxHp: 20, ownerId: 1, pen: 0, hits: 0, dead: false };
  g.bullets = [bullet]; let damaged = null; g.damageTank = e => { damaged = e; };
  g.updateBullets(1);
  assert.equal(damaged, null);
});

test('Battlefield CCD preserves the first tank position across same-tick movement corrections', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.time = 1; g.__novaTerrain = [];
  const target = { kind: 'tank', id: 2, alive: true, cls: 'scout', x: 0, y: -21.2 };
  g.moveTank(target, 0, 21.2, 1); g.moveTank(target, 0, 21.2, 1);
  assert.equal(target.__novaSweepPrevY, -21.2);
  assert.equal(target.__novaSweepMoveTime, 1);
});


test('opt-in cover research attributes effective damage and breaches without altering combat', () => {
  const { Game } = loadBattlefield();
  function world(ownerId, damage, hp, witness) {
    const g = new Game();
    g.time = 1;
    g.player = { id: 1, alive: true };
    g.__novaBattlefield = { coverBroken: 0, coverTotal: 1, name: 'TEST' };
    g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0, w: 20, h: 160,
      solid: true, destructible: true, hp, maxHp: hp }];
    g.bullets = [{ x: -100, y: 0, vx: 1000, vy: 0, r: 4, dmg: damage,
      ownerId, pen: 3, dead: false }];
    g.weakenBullet = () => {};
    if (witness) g.__novaCoverDamageResearch = witness;
    g.updateBullets(0.2);
    return { hp: g.__novaTerrain[0].hp, solid: g.__novaTerrain[0].solid,
      breaks: g.__novaBattlefield.coverBroken, bulletX: g.bullets[0].x,
      pen: g.bullets[0].pen, witness };
  }
  const fresh = () => ({ schema: 1, pilotId: 1, allEffectiveDamage: 0,
    playerEffectiveDamage: 0, allBreaks: 0, playerBreaks: 0 });
  const pilot = world(1, 400, 25, fresh());
  const baseline = world(1, 400, 25, null);
  assert.equal(pilot.witness.allEffectiveDamage, 25, 'overkill must not count');
  assert.equal(pilot.witness.playerEffectiveDamage, 25);
  assert.equal(pilot.witness.allBreaks, 1);
  assert.equal(pilot.witness.playerBreaks, 1);
  assert.deepEqual({ hp: pilot.hp, solid: pilot.solid, breaks: pilot.breaks,
    bulletX: pilot.bulletX, pen: pilot.pen },
    { hp: baseline.hp, solid: baseline.solid, breaks: baseline.breaks,
      bulletX: baseline.bulletX, pen: baseline.pen },
    'research witness must not affect the game');
  const rival = world(2, 20, 100, fresh());
  assert.equal(rival.witness.allEffectiveDamage, 20);
  assert.equal(rival.witness.playerEffectiveDamage, 0);
  assert.equal(rival.witness.allBreaks, 0);
  assert.equal(rival.witness.playerBreaks, 0);
  const invalid = { schema: 1, pilotId: 1, allEffectiveDamage: NaN,
    playerEffectiveDamage: 0, allBreaks: 0, playerBreaks: 0 };
  const ignored = world(1, 400, 25, invalid);
  assert.ok(Number.isNaN(ignored.witness.allEffectiveDamage));
  assert.equal(ignored.witness.playerEffectiveDamage, 0);
  assert.equal(ignored.witness.allBreaks, 0);
  const missingPilot = { schema: 1, allEffectiveDamage: 0,
    playerEffectiveDamage: 0, allBreaks: 0, playerBreaks: 0 };
  world(1, 400, 25, missingPilot);
  assert.equal(missingPilot.allEffectiveDamage, 0, 'unknown pilot identity must fail closed');
  assert.equal(missingPilot.allBreaks, 0);
});


test('cover research accumulates partial hits and credits only the actual breaker', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.time = 1; g.player = { id: 1, alive: true };
  g.__novaBattlefield = { coverBroken: 0, coverTotal: 1, name: 'TEST' };
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0, w: 20, h: 160,
    solid: true, destructible: true, hp: 50, maxHp: 50 }];
  g.__novaCoverDamageResearch = { schema: 1, pilotId: 1, allEffectiveDamage: 0,
    playerEffectiveDamage: 0, allBreaks: 0, playerBreaks: 0 };
  g.weakenBullet = () => {};
  function fire(ownerId, dmg) {
    g.bullets = [{ x: -100, y: 0, vx: 1000, vy: 0, r: 4,
      dmg, ownerId, pen: 3, dead: false }];
    g.updateBullets(0.2);
    g.time += 0.2;
  }
  fire(1, 30);
  assert.equal(g.__novaTerrain[0].hp, 20);
  assert.equal(g.__novaCoverDamageResearch.playerEffectiveDamage, 30);
  assert.equal(g.__novaCoverDamageResearch.playerBreaks, 0);
  fire(2, 40);
  assert.equal(g.__novaTerrain[0].hp, 0);
  assert.equal(g.__novaBattlefield.coverBroken, 1);
  assert.equal(g.__novaCoverDamageResearch.allEffectiveDamage, 50);
  assert.equal(g.__novaCoverDamageResearch.playerEffectiveDamage, 30);
  assert.equal(g.__novaCoverDamageResearch.allBreaks, 1);
  assert.equal(g.__novaCoverDamageResearch.playerBreaks, 0,
    'the player damaged the cover but did not deliver the breaking hit');
});


test('cover research includes splash damage with the same owner and overkill rules', () => {
  const { Game } = loadBattlefield();
  const g = new Game();
  g.time = 1; g.player = { id: 1, alive: true };
  g.__novaBattlefield = { coverBroken: 0, coverTotal: 1, name: 'TEST' };
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0, w: 20, h: 160,
    solid: true, destructible: true, hp: 100, maxHp: 100 }];
  g.__novaCoverDamageResearch = { schema: 1, pilotId: 1, allEffectiveDamage: 0,
    playerEffectiveDamage: 0, allBreaks: 0, playerBreaks: 0 };
  g.player = { id: 99, alive: true }; // Redeployed pointer must not erase old shot ownership.
  g.splashAt(0, 0, 100, 1, 1, 0, '#fff', 40);
  assert.ok(Math.abs(g.__novaTerrain[0].hp - 46) < 1e-9);
  assert.ok(Math.abs(g.__novaCoverDamageResearch.playerEffectiveDamage - 54) < 1e-9);
  g.splashAt(0, 0, 100, 1, 2, 0, '#fff', 50);
  assert.equal(g.__novaTerrain[0].hp, 0);
  assert.ok(Math.abs(g.__novaCoverDamageResearch.allEffectiveDamage - 100) < 1e-9);
  assert.ok(Math.abs(g.__novaCoverDamageResearch.playerEffectiveDamage - 54) < 1e-9);
  assert.equal(g.__novaCoverDamageResearch.allBreaks, 1);
  assert.equal(g.__novaCoverDamageResearch.playerBreaks, 0);
});
