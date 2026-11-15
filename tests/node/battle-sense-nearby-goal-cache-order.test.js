'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function makeScene(order) {
  function Game() {}
  Game.prototype.novaBattlefieldWaypoint = function () { return null; };
  Game.prototype.moveTank = function () {};
  Game.prototype.tryFire = function () {};
  Game.prototype.updatePowerups = function () {};
  const classes = { CLASSES: { guard: { size: 15, bullet: { reload: .5 } } },
    lineageForClass: () => 'guardian' };
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/classes': m => { m.exports = classes; },
    'game/ai': m => { m.exports = { updateAI() {} }; }
  };
  const w = { __novaModules: modules };
  const context = { window: w, Math, Number, Object, Array,
    console: { info() {}, error() {} } };
  for (const file of ['battle-sense-v1.8.1.js', 'terrain-intelligence-v1.10.2.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => classes);
  const g = new m.exports.Game();
  g.time = 10;
  const walls = [
    { id: 1, x: -130, y: -35, w: 60, h: 330, solid: true },
    { id: 2, x: 0, y: 35, w: 60, h: 330, solid: true },
    { id: 3, x: 130, y: -35, w: 60, h: 330, solid: true }
  ];
  g.__novaTerrain = walls;
  function hits(ax, ay, bx, by, wall, pad) {
    const minX = wall.x - wall.w / 2 - pad, maxX = wall.x + wall.w / 2 + pad;
    const minY = wall.y - wall.h / 2 - pad, maxY = wall.y + wall.h / 2 + pad;
    const dx = bx - ax, dy = by - ay;
    let lo = 0, hi = 1;
    for (const [p, q] of [[-dx, ax-minX], [dx, maxX-ax],
      [-dy, ay-minY], [dy, maxY-ay]]) {
      if (Math.abs(p) < 1e-9) { if (q < 0) return false; }
      else {
        const t = q / p;
        if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
        if (lo > hi) return false;
      }
    }
    return true;
  }
  g.hasLineOfSight = (ax, ay, bx, by, pad = 0) =>
    !walls.some(wall => hits(ax, ay, bx, by, wall, pad));
  g.isTerrainSafe = (x, y, pad = 0) =>
    !walls.some(wall => Math.abs(x-wall.x) <= wall.w/2+pad &&
      Math.abs(y-wall.y) <= wall.h/2+pad);
  const tank = { id: 7, cls: 'guard', x: -340, y: 0,
    hp: 10, maxHp: 100, alive: true, ai: {} };
  const pickups = [
    { id: 'lower', type: 'heal', x: 340, y: -40 },
    { id: 'upper', type: 'heal', x: 340, y: 40 }
  ];
  g.powerups = order.map(i => pickups[i]);
  g.tanks = [tank];
  g.bullets = [];
  return { g, tank, classes, hooks: w.__NOVA_BATTLE_SENSE_TEST__,
    terrain: w.__NOVA_TERRAIN_INTELLIGENCE__, pickups };
}

test('two occluded nearby pickup goals expose actual route-cache goal ownership', () => {
  const a = makeScene([0, 1]);
  const b = makeScene([1, 0]);
  for (const scene of [a, b]) {
    const { g, tank, classes, hooks, pickups } = scene;
    for (const pickup of pickups) {
      const direct = Math.hypot(pickup.x-tank.x, pickup.y-tank.y);
      assert.ok(direct <= 760, 'candidate must be eligible for Battle Sense');
    }
    const firstCost = hooks.routeDistance(g, tank, g.powerups[0], null, classes);
    const plansAfterFirst = scene.terrain.plans;
    const secondCost = hooks.routeDistance(g, tank, g.powerups[1], null, classes);
    assert.equal(scene.terrain.plans, plansAfterFirst,
      'nearby goal certification must not run another visibility planner');
    assert.ok(Number.isFinite(firstCost), 'first physically reachable goal needs a route');
    assert.ok(Number.isFinite(secondCost), 'nearby second goal must not be falsely rejected by an unrelated cached goal');
    const chosen = hooks.chooseResource(g, tank, classes);
    assert.ok(chosen && pickups.some(p => p.id === chosen.id),
      'a critical heal behind traversable cover must remain a live strategic choice');
    assert.ok(scene.terrain.plans > 0,
      'the test must actually invoke the composed Terrain Intelligence planner');
    scene.chosen = chosen && chosen.id;
    scene.plans = scene.terrain.plans;
  }
  // Deliberately require both orderings to select the same goal. If this fails,
  // keep the research branch unmerged until the actual cache/decision root cause
  // and a bounded fix are established.
  assert.equal(a.chosen, b.chosen,
    'pickup iteration order must not decide which nearby goal obtains a valid route');
  assert.equal(a.chosen, 'upper',
    'the shorter reachable upper route should win regardless of pickup order');
});
