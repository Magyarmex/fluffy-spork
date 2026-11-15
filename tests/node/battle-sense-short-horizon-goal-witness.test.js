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
    terrain: w.__NOVA_TERRAIN_INTELLIGENCE_TEST__, pickups };
}

test('critical heal movement preserves the selected goal despite a short-horizon steering request', () => {
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
    calls.push({x,y,gx,gy,pad,seed,routeContext:this.__v1102RouteContext&&{forceGoal:this.__v1102RouteContext.forceGoal,lineage:this.__v1102RouteContext.lineage,target:this.__v1102RouteContext.target}});
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
  const movementCall = calls.find(c => Math.hypot(c.gx-selectedGoal.x,c.gy-selectedGoal.y)>103.5);
  assert.ok(movementCall, 'the composed movement wrapper must request its own local goal');
  assert.equal(movementCall.routeContext?.forceGoal,true,
    'critical healing must carry an explicit composed movement goal');
  assert.equal(movementCall.routeContext?.lineage,'resource');
  assert.equal(movementCall.routeContext?.target?.x,selectedGoal.x);
  assert.equal(movementCall.routeContext?.target?.y,selectedGoal.y);
  assert.equal(movementCall.seed,tank.id);
  assert.equal(movementCall.pad,23,
    'movement must retain the Guard physical route clearance');
  assert.ok(Math.abs(Math.hypot(movementCall.gx-before.x,movementCall.gy-before.y)-340) < 1e-6,
    'the actual Battle Sense blended direction still receives a 2×170u movement horizon');
  assert.ok(movementCall.gx < selectedGoal.x-100,
    'the local steering goal is materially short of the selected heal');
  assert.ok(Math.hypot(movementCall.gx-selectedGoal.x,movementCall.gy-selectedGoal.y)>103.5,
    'the requested local steering goal differs materially from the selected heal');
  assert.ok(Number.isFinite(tank.x) && Number.isFinite(tank.y));
  // This is a source-executed continuity regression, not proof of
  // natural-match pickup acquisition or physical-device performance.
});

test('research census: two-heal candidate order across 120 deterministic tank seeds', () => {
  const outcomes = Object.create(null);
  for (let seed = 1; seed <= 120; seed++) {
    const picks = [];
    for (const order of [[0,1],[1,0]]) {
      const {g,tank,classes,hooks,pickups} = makeScene(order);
      tank.id = seed;
      const selected = hooks.chooseResource(g,tank,classes);
      assert.ok(selected && pickups.some(p => p.id === selected.id),
        'every controlled seed must select an eligible heal');
      picks.push(selected.id);
    }
    const key = picks.join('/');
    outcomes[key] = (outcomes[key] || 0) + 1;
  }
  const changed = Object.entries(outcomes)
    .filter(([key]) => key.split('/')[0] !== key.split('/')[1])
    .reduce((sum,[,count]) => sum+count,0);
  // Observational only: do NOT freeze candidate-order bias as a passing golden.
  // The intended future property is stable selection under order reversal.
  console.log('PICKUP_ORDER_SEED_CENSUS '+JSON.stringify({seeds:120,changed,outcomes}));
});

test('research upper bound: independent goal-keyed route snapshots preserve contender order', () => {
  let plans=0,unstable=0;
  for (let seed=1;seed<=120;seed++) {
    const {g,tank,pickups,terrain} = makeScene([0,1]);
    tank.id=seed;
    const snapshots=new Map();
    function independentCost(p) {
      const key=String(seed)+':'+p.id;
      if(snapshots.has(key))return snapshots.get(key);
      plans++;
      const path=terrain.planVisibilityRoute(g,tank.x,tank.y,p.x,p.y,23,seed,null);
      if(!path)return Infinity;
      let cost=0,x=tank.x,y=tank.y;
      for(const node of path){cost+=Math.hypot(node.x-x,node.y-y);x=node.x;y=node.y;}
      snapshots.set(key,cost);
      return cost;
    }
    const choices=[];
    for(const order of [[0,1],[1,0]]) {
      let choice=null,best=Infinity;
      for(let tick=0;tick<8;tick++) {
        choice=null;best=Infinity;
        for(const index of order) {
          const cost=independentCost(pickups[index]);
          if(cost<best){best=cost;choice=pickups[index].id;}
        }
      }
      choices.push(choice);
    }
    if(choices[0]!==choices[1])unstable++;
    assert.ok(Number.isFinite(best),'both fixture goals must remain physically reachable');
  }
  // This is a stationary source-planner upper bound. Moving tanks require
  // position/terrain invalidation and real browser/Android CPU acceptance.
  console.log('PICKUP_GOAL_SNAPSHOT_RESEARCH '+JSON.stringify({seeds:120,ticksPerOrder:8,plans,unstable}));
  assert.equal(unstable,0,'independent certified costs must not depend on pickup array order');
  assert.equal(plans,240,'stationary goal-keyed snapshots plan each goal once per seed');
});

test('research prototype: goal-keyed snapshots reuse valid moving routes without touching movement cache', () => {
  const {g,tank,pickups,terrain} = makeScene([0,1]);
  tank.id=2;
  const originalMovementCache=JSON.stringify(g.__v1102Routes||{});
  const snapshots=new Map();
  let plans=0,now=10;
  function certifiedCost(p) {
    const key=p.id,prior=snapshots.get(key);
    function valid(points) {
      let x=tank.x,y=tank.y;
      for(const node of points) {
        if(!g.hasLineOfSight(x,y,node.x,node.y,23))return false;
        x=node.x;y=node.y;
      }
      return true;
    }
    let points=prior?.points;
    if(!prior||now>prior.until||Math.hypot(tank.x-prior.x,tank.y-prior.y)>60||!valid(points)) {
      const route=terrain.planVisibilityRoute(g,tank.x,tank.y,p.x,p.y,23,tank.id,null);
      if(!route)return Infinity;
      points=route.length?route:[{x:p.x,y:p.y}];
      snapshots.set(key,{x:tank.x,y:tank.y,until:now+.75,points});
      plans++;
    }
    let x=tank.x,y=tank.y,total=0;
    for(const node of points) {
      total+=Math.hypot(node.x-x,node.y-y);
      x=node.x;y=node.y;
    }
    return total;
  }
  for(const x of [-340,-330,-320,-310]) {
    tank.x=x;now+=.1;
    const costs=pickups.map(certifiedCost);
    assert.ok(costs.every(Number.isFinite),'both cached goal paths must stay certified');
    assert.ok(costs[1]<costs[0],'upper heal remains the shorter route in this fixture');
  }
  assert.equal(plans,2,'four moving scoring ticks should reuse one route per goal');
  tank.x=-240;now+=.1;
  pickups.forEach(certifiedCost);
  assert.equal(plans,4,'large movement must refresh both independent goal snapshots');
  assert.equal(JSON.stringify(g.__v1102Routes||{}),originalMovementCache,
    'research strategic snapshots must not evict or modify the live movement cache');
  console.log('PICKUP_MOVING_SNAPSHOT_PROTOTYPE '+JSON.stringify({plans,goals:2,positions:5}));
});
