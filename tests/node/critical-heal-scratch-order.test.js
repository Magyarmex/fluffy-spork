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


test('critical two-heal strategic choice is invariant to pickup array order across route seeds', () => {
  let flips=0,planned=0;
  for(let seed=1;seed<=120;seed++){
    const choices=[];
    for(const order of [[0,1],[1,0]]){
      const {g,tank,classes,hooks}=makeScene(order);
      tank.id=seed;
      let selected=null;
      for(let tick=0;tick<8;tick++){
        g.time=10+tick*.18;
        selected=hooks.chooseResource(g,tank,classes);
      }
      assert.ok(selected && ['upper','lower'].includes(selected.id),
        'every deterministic fixture must choose a reachable healing pickup');
      choices.push(selected.id);
      planned+=Number(g.__v1102StrategicRoutes &&
        Object.values(g.__v1102StrategicRoutes).reduce((sum,s)=>sum+s.plans,0))||0;
    }
    if(choices[0]!==choices[1])flips++;
  }
  assert.equal(flips,0,'independent contender pricing must not depend on pickup array order');
  assert.ok(planned>0,'the regression must exercise the scratch planner rather than a no-op path');
});


test('research: pre-existing movement routes may influence first-contender pricing',()=>{
 let flips=0,chosen=0;
 for(let seed=1;seed<=120;seed++){
  const outcomes=[];
  for(const order of [[0,1],[1,0]]){
   const {g,tank,classes,hooks}=makeScene(order);
   tank.id=seed;
   const warm=g.novaBattlefieldWaypoint(tank.x,tank.y,340,0,23,seed);
   assert.ok(warm,'the fixture must prime a real movement route');
   let selected=null;
   for(let tick=0;tick<8;tick++){
    g.time=10+tick*.18;
    selected=hooks.chooseResource(g,tank,classes);
   }
   assert.ok(selected,'a critical Guard must still choose a heal');
   outcomes.push(selected.id);
   chosen++;
  }
  if(outcomes[0]!==outcomes[1])flips++;
 }
 console.log('SCRATCH_PREWARMED_ROUTE_ORDER_RESEARCH '+JSON.stringify({seeds:120,choices:chosen,flips}));
 // Observational falsifier: do not freeze a possibly biased outcome as golden.
});

test('critical two-heal pricing preserves a prewarmed movement route and does not create one when absent',()=>{
 for(const order of [[0,1],[1,0]]){
  for(const prewarm of [false,true]){
   const {g,tank,classes,hooks}=makeScene(order);
   if(prewarm){
    const wp=g.novaBattlefieldWaypoint(tank.x,tank.y,340,0,23,tank.id);
    assert.ok(wp,'a real unrelated movement route must exist before scoring');
   }
   const before=JSON.stringify(g.__v1102Routes||{});
   const selected=hooks.chooseResource(g,tank,classes);
   assert.ok(selected,'the critical Guard must retain a healing choice');
   assert.equal(JSON.stringify(g.__v1102Routes||{}),before,
    'strategic evaluation must not replace, advance or create a live movement route');
  }
 }
});

test('research: 120 simultaneous critical two-heal bots expose fallback planning pressure',()=>{
 const {g,classes,hooks}=makeScene([0,1]);
 const bots=Array.from({length:120},(_,i)=>({
  id:i+1,cls:'guard',x:-340,y:0,hp:10,maxHp:100,alive:true,ai:{}
 }));
 g.tanks=bots;
 g.__novaFairVisibleTanks=[];
 for(const bot of bots)hooks.chooseResource(g,bot,classes);
 const budget=g.__v1102StrategicBudget||{plans:0};
 const liveRoutes=Object.keys(g.__v1102Routes||{}).length;
 const stats=g.__v1102StrategicRoutes||{};
 const scratchPlans=Object.values(stats).reduce((sum,state)=>sum+state.plans,0);
 console.log('TWO_HEAL_MANY_BOT_PLANNING_RESEARCH '+JSON.stringify({
  bots:bots.length,globalScratchPlans:budget.plans,
  cachedScratchPlans:scratchPlans,liveRoutes
 }));
 assert.ok(budget.plans<=64,'global scratch search budget must remain bounded');
 assert.equal(liveRoutes,0,'fallback pricing must not leave movement routes behind');
});
