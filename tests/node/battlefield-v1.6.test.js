const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBattlefield() {
  function Game() {}
  Game.prototype.spawnPlayer = function () {};
  Game.prototype.randSpawnPos = function () { return { x: 1500, y: 1500 }; };
  Game.prototype.spawnShape = function () {};
  Game.prototype.spawnPowerup = function () {};
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; t.vx = vx; t.vy = vy; };
  Game.prototype.tryFire = function () {};
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
