'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function setup() {
  function Game() {}
  Game.prototype.novaBattlefieldWaypoint = function () { throw Error('unexpected live route plan'); };
  Game.prototype.moveTank = function () { return 'moved'; };
  const classes = { CLASSES: { guard: { size: 15 } }, lineageForClass: () => 'guardian' };
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/classes': m => { m.exports = classes; },
    'game/ai': m => { m.exports = { updateAI() {} }; }
  };
  const window = { __novaModules: modules };
  const context = { window, Math, Number, Object, Array,
    console: { info() {}, error() {} } };
  for (const name of ['battle-sense-v1.8.1.js', 'terrain-intelligence-v1.10.2.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => classes);
  const g = new m.exports.Game();
  const wall = { x: 50, y: 0, w: 20, h: 80, solid: true };
  let wallPresent = true;
  // Segment against clearance-inflated wall; a zero-length segment at the
  // goal is valid if that goal is outside the physical wall.
  function intersects(ax, ay, bx, by, pad) {
    if (!wallPresent) return false;
    const minX = wall.x - wall.w/2 - pad, maxX = wall.x + wall.w/2 + pad;
    const minY = wall.y - wall.h/2 - pad, maxY = wall.y + wall.h/2 + pad;
    const dx = bx-ax, dy = by-ay;
    let lo = 0, hi = 1;
    for (const [p,q] of [[-dx,ax-minX],[dx,maxX-ax],[-dy,ay-minY],[dy,maxY-ay]]) {
      if (Math.abs(p) < 1e-9) { if (q < 0) return false; }
      else {
        const t = q/p;
        if (p < 0) lo = Math.max(lo,t); else hi = Math.min(hi,t);
        if (lo > hi) return false;
      }
    }
    return true;
  }
  g.hasLineOfSight = (ax,ay,bx,by,pad=0) => !intersects(ax,ay,bx,by,pad);
  g.isTerrainSafe = (x,y,pad=0) => !wallPresent ||
    !(Math.abs(x-wall.x)<=wall.w/2+pad && Math.abs(y-wall.y)<=wall.h/2+pad);
  g.time = 10;
  const tank = { id: 7, cls: 'guard', x: 0, y: 0 };
  const pickup = { id: 'heal', x: 100, y: 0 };
  // 23-unit planning pad rounds to key '7:6'. Every leg of this
  // deliberately conservative detour is clear at 18-unit body radius.
  const route = { gx: 100, gy: 0, until: 11, index: 0,
    points: [{x:0,y:100},{x:100,y:100},{x:100,y:0}] };
  g.__v1102Routes = { '7:6': route };
  return { g, tank, pickup, classes, route,
    distance: window.__NOVA_BATTLE_SENSE_TEST__.routeDistance,
    setWall: value => { wallPresent = value; } };
}

test('a physically certified detour is priced read-only from a safe start', () => {
  const { g, tank, pickup, classes, route, distance } = setup();
  assert.equal(g.isTerrainSafe(tank.x,tank.y,18), true);
  assert.equal(g.hasLineOfSight(tank.x,tank.y,pickup.x,pickup.y,18), false);
  assert.equal(g.novaReadOnlyExactRouteLength(0,0,100,0,23,7), 300);
  assert.equal(distance(g,tank,pickup,100,classes), 300);
  assert.strictEqual(g.__v1102Routes['7:6'], route);
  assert.equal(route.index, 0);
});

test('expired route is rejected rather than treated as a fresh certificate', () => {
  const { g, tank, pickup, classes, distance } = setup();
  g.time = 12;
  g.novaBattlefieldWaypoint = () => { throw Error('unexpected live route plan'); };
  assert.equal(g.novaReadOnlyExactRouteLength(0,0,100,0,23,7), null);
  // The normal planner fallback is deliberately a throwing sentinel.
  assert.throws(() => distance(g,tank,pickup,100,classes), /unexpected live route plan/);
});

test('a newly blocked cached leg is rejected without mutating the cached cursor', () => {
  const { g, tank, pickup, classes, route, distance } = setup();
  // Move the wall to obstruct the detour's first leg while preserving the
  // direct pickup occlusion, then verify certification fails closed.
  g.novaBattlefieldWaypoint = () => { throw Error('unexpected live route plan'); };
  const originalLOS = g.hasLineOfSight;
  g.hasLineOfSight = (ax,ay,bx,by,pad) =>
    !(ax===0 && ay===0 && bx===0 && by===100) &&
    originalLOS(ax,ay,bx,by,pad);
  assert.equal(g.novaReadOnlyExactRouteLength(0,0,100,0,23,7), null);
  assert.throws(() => distance(g,tank,pickup,100,classes), /unexpected live route plan/);
  assert.strictEqual(g.__v1102Routes['7:6'], route);
  assert.equal(route.index, 0);
});

test('movement owner advances a reached cached heal waypoint without strategic pricing', () => {
  const { g, tank, pickup, route } = setup();
  tank.y = 95;
  tank.hp = 10;
  tank.maxHp = 100;
  tank.ai = { __v181Mode: 'resource', __v181BiasW: 1.05,
    __v181ResourceId: 'heal' };
  g.powerups = [{ ...pickup, type: 'heal' }];
  g.tanks = [tank];
  assert.equal(route.index, 0);
  assert.equal(g.moveTank(tank, 0, 0, 1/60), 'moved');
  assert.equal(route.index, 1,
    'movement, not strategic scoring, owns the reached-corner cursor');
  assert.equal(g.__v1102RouteContext, undefined,
    'temporary resource goal context must be restored');
});

test('movement owner does not advance unrelated cached goals', () => {
  const { g, tank, pickup, route } = setup();
  tank.y = 95;
  tank.hp = 10;
  tank.maxHp = 100;
  tank.ai = { __v181Mode: 'resource', __v181BiasW: 1.05,
    __v181ResourceId: 'heal' };
  g.powerups = [{ ...pickup, type: 'heal' }];
  route.gx = 110; // another goal may own this movement route
  assert.equal(g.moveTank(tank, 0, 0, 1/60), 'moved');
  assert.equal(route.index, 0);
});
