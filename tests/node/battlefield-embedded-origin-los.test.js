'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const rectangle = () => ({ id: -1, shape: 'rect', x: 0, y: 0, w: 10, h: 100, solid: true, destructible: false });
const pillar = () => ({ id: -2, shape: 'circle', x: 0, y: 0, r: 5, solid: true, destructible: false });

function boot({ optimized = false, swarm = false } = {}) {
  class Game {
    constructor() {
      this.time = 1; this.tmp = []; this.tanks = []; this.shapes = []; this.drones = [];
      this.tankById = new Map(); this.hits = [];
      this.hash = { query(x, y, r, out) { out.length = 0; } };
    }
    spawnPlayer() {}
    randSpawnPos() { return { x: 1500, y: 1500 }; }
    spawnShape() {}
    spawnPowerup() {}
    moveTank(t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; }
    tryFire() {}
    updateBullets() {}
    updateDrones() {}
    update() {}
    splashAt() {}
    getTank(id) { return this.tankById.get(id) || null; }
    acquireDroneTarget() { return null; }
    damageDrone(d, n) { this.hits.push([d.id, n]); d.hp -= n; }
    damageShape(s, n) { this.hits.push([s.id, n]); s.hp -= n; }
  }
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/ai': m => { m.exports.updateAI = () => {}; },
    'game/audio': m => { m.exports.Sfx = class {}; },
    'game/render': m => { m.exports.render = () => {}; }
  };
  const win = { __novaModules: modules };
  const files = [
    ...(swarm ? ['drone-discipline-v1.5.1.js'] : []),
    'battlefield-v1.6.0.js',
    ...(optimized ? ['performance-v1.7.5.js'] : [])
  ];
  for (const file of files) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'), {
      window: win, console: { info() {}, warn() {}, error() {} },
      Math, Map, Set, Number, Date, performance: { now: () => 0 }
    }, { filename: file });
  }
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 }, carrier: { size: 15 }, marksman: { size: 15 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('unexpected dependency: ' + spec);
  });
  return m.exports.Game;
}

for (const optimized of [false, true]) {
  const label = optimized ? 'Frame Budget + Battlefield' : 'Battlefield alone';
  const Game = boot({ optimized });
  for (const [name, make] of [['rectangle', rectangle], ['pillar', pillar]]) {
    test(label + ': ' + name + ' blocks an origin physically inside cover', () => {
      const g = new Game(); g.__novaTerrain = [make()];
      assert.equal(g.hasLineOfSight(0, 0, 20, 0, 2), false);
      assert.equal(g.hasLineOfSight(0, 0, 2, 0, 2), false, 'both endpoints inside must not be clear');
      assert.equal(g.hasLineOfSight(-5, 0, 20, 0, 2), false, 'physical boundary moving inward');
      assert.equal(g.hasLineOfSight(5, 0, -20, 0, 2), false, 'opposite physical boundary moving inward');
    });
    test(label + ': ' + name + ' permits outward/tangential escape from exact physical face', () => {
      const g = new Game(); g.__novaTerrain = [make()];
      assert.equal(g.hasLineOfSight(-5, 0, -20, 0, 2), true, 'outward escape');
      assert.equal(g.hasLineOfSight(5, 0, 20, 0, 2), true, 'outward escape opposite face');
      assert.equal(g.hasLineOfSight(-5, 0, -5, 20, 2), true, 'face tangent');
      assert.equal(g.hasLineOfSight(-20, 0, 20, 0, 2), false, 'ordinary outside crossing');
      assert.equal(g.hasLineOfSight(-20, 0, -12, 0, 2), true, 'ordinary outside clear');
    });
  }
  test(label + ': near-origin physical crossings and padded-circle enclosure still block', () => {
    const g = new Game();
    g.__novaTerrain = [rectangle()];
    assert.equal(g.hasLineOfSight(7.125179180875421, -22.472716248594224, -34.56186146475375, 16.957902344875038, 2), false);
    g.__novaTerrain = [{ ...pillar(), r: 25 }];
    assert.equal(g.hasLineOfSight(-12.84829537384212, -22.771979039534926, -8.943558628670871, 20.96785000525415, 2), false);
  });
  test(label + ': broken cover, multiple solids and projectile first-hit remain coherent', () => {
    const g = new Game();
    g.__novaTerrain = [{ ...rectangle(), solid: true, destructible: true, hp: 0 }];
    assert.equal(g.hasLineOfSight(0, 0, 20, 0, 2), true, 'destroyed cover is transparent');
    g.__novaTerrain = [rectangle(), { ...rectangle(), id: -3, x: -25 }];
    assert.equal(g.hasLineOfSight(-5, 0, -50, 0, 2), false, 'second solid blocks outward escape');
    const hit = g.firstTerrainHit(-50, 0, 50, 0, 2);
    assert.ok(hit && hit.hit.t >= 0, 'projectile contact still available');
  });
  test(label + ': line-of-sight outcome does not depend on simulation frequency', () => {
    const g = new Game(); g.__novaTerrain = [pillar()];
    for (const fps of [30, 60, 120, 240]) {
      g.time += 1 / fps;
      assert.equal(g.hasLineOfSight(0, 0, 20, 0, 2), false);
      assert.equal(g.hasLineOfSight(-5, 0, -20, 0, 2), true);
    }
  });
}

test('optimized spatial broad-phase preserves Battlefield LOS answers over 10,000 deterministic segments', () => {
  const Base = boot(), Optimized = boot({ optimized: true });
  const a = new Base(), b = new Optimized();
  const terrain = [rectangle(), { ...pillar(), x: 50, y: 50, r: 25 }, { ...rectangle(), x: -80, y: 40 }];
  a.__novaTerrain = terrain.map(s => ({ ...s })); b.__novaTerrain = terrain.map(s => ({ ...s }));
  let seed = 0x12345678;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000; };
  for (let i = 0; i < 10000; i++) {
    const ax = (rnd() - .5) * 400, ay = (rnd() - .5) * 400;
    const bx = (rnd() - .5) * 400, by = (rnd() - .5) * 400;
    assert.equal(b.hasLineOfSight(ax, ay, bx, by, 2), a.hasLineOfSight(ax, ay, bx, by, 2), 'segment ' + i);
  }
});

test('shipping Swarm → Battlefield → Performance composition denies embedded-origin melee damage', () => {
  const Game = boot({ optimized: true, swarm: true });
  const g = new Game(); g.time = 10; g.__novaTerrain = [rectangle()];
  const owner = { id: 1, cls: 'carrier', alive: true, x: 0, y: 0, team: 'blue',
    swarmT: 0, __novaSwarm: { active: false, recallUntil: 0 } };
  const enemy = { id: 2, cls: 'marksman', alive: true, x: 20, y: 0, team: 'red' };
  const d = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0, hp: 30, r: 8,
    dmg: 12, speed: 0, attackCd: 0, leash: 650, role: 'hunter', slot: 0, __novaPhase: 'idle' };
  const target = { id: 11, kind: 'drone', ownerId: 2, x: 9, y: 0, hp: 30, r: 8 };
  g.tanks = [owner, enemy]; g.tankById = new Map(g.tanks.map(t => [t.id, t]));
  g.drones = [d, target]; g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  assert.equal(g.hasLineOfSight(d.x, d.y, target.x, target.y, 2), false);
  g.updateDrones(.016);
  assert.deepEqual(g.hits, [], 'no damage should pass from embedded drone through wall');
  assert.equal(target.hp, 30);
});


function physicalInteriorCrossing(s, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, epsilon = 1e-6;
  if (s.shape === 'circle') {
    const length2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.y - ay) * dy) / (length2 || 1)));
    const x = ax + dx * t - s.x, y = ay + dy * t - s.y;
    return x * x + y * y < (s.r - epsilon) ** 2;
  }
  let lo = 0, hi = 1;
  for (const [origin, velocity, min, max] of [
    [ax, dx, s.x - s.w / 2 + epsilon, s.x + s.w / 2 - epsilon],
    [ay, dy, s.y - s.h / 2 + epsilon, s.y + s.h / 2 - epsilon]
  ]) {
    if (Math.abs(velocity) < 1e-12) {
      if (origin <= min || origin >= max) return false;
    } else {
      let t0 = (min - origin) / velocity, t1 = (max - origin) / velocity;
      if (t0 > t1) [t0, t1] = [t1, t0];
      lo = Math.max(lo, t0); hi = Math.min(hi, t1);
      if (hi <= lo) return false;
    }
  }
  return hi >= 0 && lo <= 1;
}

test('independent physical-interior oracle: no transparent solid crossings at 30k deterministic segments', () => {
  const Base = boot(), Optimized = boot({ optimized: true });
  let seed = 0x75bcd15;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000; };
  let physicalCrossings = 0;
  for (const shape of [rectangle(), { ...pillar(), r: 25 }]) {
    const a = new Base(), b = new Optimized();
    a.__novaTerrain = [{ ...shape }]; b.__novaTerrain = [{ ...shape }];
    for (let i = 0; i < 15000; i++) {
      const ax = (rnd() - .5) * 140, ay = (rnd() - .5) * 140;
      const bx = (rnd() - .5) * 140, by = (rnd() - .5) * 140;
      if (!physicalInteriorCrossing(shape, ax, ay, bx, by)) continue;
      physicalCrossings++;
      assert.equal(a.hasLineOfSight(ax, ay, bx, by, 2), false, 'Battlefield physical crossing ' + i);
      assert.equal(b.hasLineOfSight(ax, ay, bx, by, 2), false, 'optimized physical crossing ' + i);
    }
  }
  assert.ok(physicalCrossings > 3000, 'randomized test must cover meaningful physical intersections');
});
