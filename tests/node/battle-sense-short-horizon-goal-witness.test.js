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
  Game.prototype.moveTank = function (t,vx,vy,dt) { t.x += vx*dt; t.y += vy*dt; };
  Game.prototype.tryFire = function () {};
  Game.prototype.splashAt = function () {};
  Game.prototype.damageTank = function () {};
  Game.prototype.updateDrones = function () {};
  Game.prototype.update = function () {};
  Game.prototype.updatePowerups = function () {};
  const classes = { CLASSES: { guard: { size: 15, bullet: { reload: .5 } } },
    lineageForClass: () => 'guardian' };
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/classes': m => { m.exports = classes; },
    'game/ai': m => { m.exports = { updateAI(t,g,dt) { g.moveTank(t,300,0,dt); } }; }
  };
  const w = { __novaModules: modules };
  const context = { window: w, Math, Number, Object, Array,
    console: { info() {}, error() {} } };
  for (const file of ['combined-arms-v1.7.2.js', 'battle-sense-v1.8.1.js', 'terrain-intelligence-v1.10.2.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => classes);
  const g = new m.exports.Game();
  const aiModule = {exports:{}};
  modules['game/ai'](aiModule, aiModule.exports, id => classes);
  g.__novaAiModule = aiModule.exports;
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
  g.firstTerrainHit = (ax, ay, bx, by, pad = 0) => {
    const wall = walls.find(w => hits(ax, ay, bx, by, w, pad));
    return wall ? { solid: wall, hit: { x: wall.x, y: wall.y, nx: -1, ny: 0 } } : null;
  };
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

test('actual Combined Arms movement requests a short-horizon route after strategic heal selection', () => {
  const {g,tank,classes,hooks,pickups} = makeScene([0,1]);
  const chosen = hooks.chooseResource(g,tank,classes);
  assert.ok(chosen && pickups.some(p => p.id === chosen.id),
    'fixture must select a real eligible heal before steering');
  const strategic = g.__v1102Routes && g.__v1102Routes['7:6'];
  assert.ok(strategic, 'strategic selection must exercise the actual composed terrain owner');
  const selectedGoal = {x:chosen.x,y:chosen.y};
  const calls = [];
  const original = g.novaBattlefieldWaypoint;
  g.novaBattlefieldWaypoint = function (x,y,gx,gy,pad,seed) {
    calls.push({x,y,gx,gy,pad,seed});
    return original.call(this,x,y,gx,gy,pad,seed);
  };
  const before = {x:tank.x,y:tank.y};
  g.status = 'playing';
  // The real Battle Sense wrapper computes resource mode and intercepts the
  // original AI's movement request before Combined Arms and Terrain act.
  const ai = g.__novaAiModule;
  assert.ok(ai && typeof ai.updateAI === 'function');
  ai.updateAI(tank,g,1/60);
  assert.equal(tank.ai.__v181Mode,'resource',
    'the actual strategic wrapper must choose resource mode');
  assert.ok(calls.length > 0,
    'blocked first 170 units must invoke the composed movement route owner');
  assert.equal(calls[0].seed,tank.id);
  assert.equal(calls[0].pad,23,
    'movement must retain the Guard physical route clearance');
  assert.ok(Math.abs(calls[0].gx-(before.x+340)) < 1e-6);
  assert.ok(Math.abs(calls[0].gy-before.y) < 1e-6);
  assert.ok(Math.hypot(calls[0].gx-selectedGoal.x,calls[0].gy-selectedGoal.y)>103.5,
    'the requested local steering goal differs materially from the selected heal');
  assert.ok(Number.isFinite(tank.x) && Number.isFinite(tank.y));
  // This is a source-executed *goal divergence witness*, not evidence of
  // oscillation, missed healing or a natural-match navigation failure.
});
