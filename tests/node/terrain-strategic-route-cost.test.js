'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function terrain(){
 const w={__novaModules:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates/terrain-intelligence-v1.10.2.js'),'utf8'),
  {window:w,console:{info(){},error(){}},Math,Number,Object,Array});
 return w.__NOVA_TERRAIN_INTELLIGENCE_TEST__;
}
function scene(){
 const goal={x:100,y:0},wp={x:20,y:30};
 const route={gx:100,gy:0,index:0,until:11,points:[wp,{x:50,y:30},goal]};
 const g={time:10,__v1102Routes:{'7:6':route}};
 return {g,wp,goal,route};
}
test('complete cached terrain path is longer than a first-corner straight-line guess',()=>{
 const h=terrain(),{g,wp,goal,route}=scene(),before=JSON.stringify(g.__v1102Routes);
 const full=h.cachedRouteLength(g,0,0,goal.x,goal.y,23,7,wp);
 const first=Math.hypot(wp.x,wp.y)+Math.hypot(goal.x-wp.x,goal.y-wp.y);
 assert.ok(full>first+1,'later turns must contribute to strategic travel cost');
 assert.ok(Math.abs(full-(Math.hypot(20,30)+30+Math.hypot(50,30)))<1e-8);
 assert.equal(JSON.stringify(g.__v1102Routes),before,'strategic pricing cannot consume movement waypoints');
 assert.equal(route.index,0);
});
test('changed goal, wrong seed, stale cache and unrelated waypoint cannot leak route cost',()=>{
 const h=terrain(),{g,wp}=scene();
 assert.equal(h.cachedRouteLength(g,0,0,101,0,23,7,wp),null);
 assert.equal(h.cachedRouteLength(g,0,0,100,0,23,8,wp),null);
 assert.equal(h.cachedRouteLength(g,0,0,100,0,23,7,{x:25,y:30}),null);
 g.time=12;
 assert.equal(h.cachedRouteLength(g,0,0,100,0,23,7,wp),null);
});
test('advanced route index prices only remaining legs without changing the cache',()=>{
 const h=terrain(),{g,route}=scene();route.index=1;
 const wp=route.points[1],start={x:18,y:28};
 const full=h.cachedRouteLength(g,start.x,start.y,100,0,23,7,wp);
 assert.ok(Math.abs(full-(Math.hypot(32,2)+Math.hypot(50,30)))<1e-8);
 assert.equal(route.index,1);
});

test('actual Terrain Intelligence owner prices a five-leg three-wall detour',()=>{
 function Game(){}
 Game.prototype.novaBattlefieldWaypoint=function(){return null;};
 const mods={'game/engine':m=>m.exports={Game}},w={__novaModules:mods};
 vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates/terrain-intelligence-v1.10.2.js'),'utf8'),
  {window:w,console:{info(){},error(){}},Math,Number,Object,Array});
 const m={exports:{}};mods['game/engine'](m,m.exports,()=>({CLASSES:{}}));
 const walls=[{id:1,x:-186,y:-35,w:60,h:330,solid:true},
  {id:2,x:0,y:35,w:60,h:330,solid:true},
  {id:3,x:186,y:-35,w:60,h:330,solid:true}];
 function hit(ax,ay,bx,by,r,p){
  const minX=r.x-r.w/2-p,maxX=r.x+r.w/2+p,minY=r.y-r.h/2-p,maxY=r.y+r.h/2+p,
   dx=bx-ax,dy=by-ay;let t0=0,t1=1;
  for(const [P,Q] of [[-dx,ax-minX],[dx,maxX-ax],[-dy,ay-minY],[dy,maxY-ay]]){
   if(Math.abs(P)<1e-9){if(Q<0)return false;}
   else{const z=Q/P;if(P<0)t0=Math.max(t0,z);else t1=Math.min(t1,z);if(t0>t1)return false;}
  }
  return true;
 }
 const g=new Game();g.time=10;g.__novaTerrain=walls;
 g.hasLineOfSight=(ax,ay,bx,by,p)=>!walls.some(r=>hit(ax,ay,bx,by,r,p));
 g.isTerrainSafe=(x,y,p)=>!walls.some(r=>Math.abs(x-r.x)<=r.w/2+p&&Math.abs(y-r.y)<=r.h/2+p);
 const a={x:-465,y:0},b={x:465,y:-60};
 const wp=g.novaBattlefieldWaypoint(a.x,a.y,b.x,b.y,23,7);
 assert.ok(wp,'the actual planner must produce a physical detour');
 const full=g.novaRouteLength(a.x,a.y,b.x,b.y,23,7,wp);
 const first=Math.hypot(wp.x-a.x,wp.y-a.y)+Math.hypot(b.x-wp.x,b.y-wp.y);
 assert.equal(g.__v1102Routes['7:6'].points.length,5);
 assert.ok(full-first>80,'the complete route should expose a meaningful first-corner undercount');
 assert.ok(Math.abs(full-1106.366)<.01);
});


test('nearby strategic route reuse certifies physical prefixes without changing exact-goal pricing',()=>{
 const h=terrain(),{g,wp,route}=scene(),before=JSON.stringify(g.__v1102Routes);
 const goal={x:100,y:40},args=[g,0,0,goal.x,goal.y,23,7,wp];
 assert.equal(h.cachedRouteLength(...args),null,
  'exact-goal route pricing must not accept another cached destination');
 const certified=h.cachedNearbyRouteLength(...args);
 assert.ok(Number.isFinite(certified)&&certified>=Math.hypot(goal.x,goal.y),
  'a clear prefix plus a clear final leg certifies reachable nearby terrain');
 assert.equal(JSON.stringify(g.__v1102Routes),before,
  'strategic nearby pricing must not mutate the movement route');
 assert.equal(route.index,0);
 g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===wp.x&&ay===wp.y&&bx===50&&by===30);
 assert.ok(Number.isFinite(h.cachedNearbyRouteLength(...args)),
  'an unused later cached leg cannot invalidate an earlier safe exit');
 g.hasLineOfSight=(ax,ay,bx,by)=>!(bx===goal.x&&by===goal.y);
 assert.equal(h.cachedNearbyRouteLength(...args),null,
  'all final legs blocked means no physically certified nearby route');
 delete g.hasLineOfSight;
 assert.equal(h.cachedNearbyRouteLength(g,0,0,250,0,23,7,wp),null,
  'distant goals must never borrow another goal route');
 assert.equal(h.cachedNearbyRouteLength(g,0,0,100,0,23,7,wp),null,
  'exact goals retain the existing exact-goal route API');
 g.time=12;
 assert.equal(h.cachedNearbyRouteLength(...args),null,
  'expired cached routes cannot certify nearby goals');
});

test('critical-heal scratch planning is goal-keyed, bounded and never evicts movement routes',()=>{
 const h=terrain(),walls=[{id:1,x:0,y:0,w:60,h:200,solid:true}];
 function hit(ax,ay,bx,by,r,p){
  const dx=bx-ax,dy=by-ay,minX=r.x-r.w/2-p,maxX=r.x+r.w/2+p,
   minY=r.y-r.h/2-p,maxY=r.y+r.h/2+p;
  let lo=0,hi=1;
  for(const [P,Q] of [[-dx,ax-minX],[dx,maxX-ax],[-dy,ay-minY],[dy,maxY-ay]]){
   if(Math.abs(P)<1e-9){if(Q<0)return false;}
   else{const z=Q/P;if(P<0)lo=Math.max(lo,z);else hi=Math.min(hi,z);if(lo>hi)return false;}
  }
  return true;
 }
 const g={time:10,__novaTerrain:walls,__v1102Routes:{'7:6':{gx:99,gy:99,points:[{x:99,y:99}],index:0,until:11}}};
 g.hasLineOfSight=(ax,ay,bx,by,p=0)=>!walls.some(w=>hit(ax,ay,bx,by,w,p));
 g.isTerrainSafe=(x,y,p=0)=>!walls.some(w=>Math.abs(x-w.x)<=w.w/2+p&&Math.abs(y-w.y)<=w.h/2+p);
 const before=JSON.stringify(g.__v1102Routes);
 const lower=h.strategicScratchCost(g,-200,0,200,-40,23,7,'lower');
 assert.ok(Number.isFinite(lower)&&lower>Math.hypot(400,40));
 assert.equal(h.strategicScratchCost(g,-200,0,200,-40,23,7,'lower'),lower);
 const originalSight=g.hasLineOfSight;
 g.hasLineOfSight=()=>false;
 assert.equal(h.strategicScratchCost(g,-200,0,200,-40,23,7,'lower'),null,
  'newly blocked route legs must invalidate cached strategic pricing without a second plan in the same window');
 g.hasLineOfSight=originalSight;
 assert.equal(h.strategicScratchCost(g,-200,0,200,40,23,7,'upper'),null,
  'second independent plan must respect one-plan-per-window budget');
 g.time=10.8;
 const upper=h.strategicScratchCost(g,-200,0,200,40,23,7,'upper');
 assert.ok(Number.isFinite(upper)&&upper>Math.hypot(400,40));
 assert.equal(JSON.stringify(g.__v1102Routes),before,
  'strategic contender planning must not mutate the live movement cache');
 walls.length=0;
 assert.equal(h.strategicScratchCost(g,-200,0,200,40,23,7,'upper'),Math.hypot(400,40),
  'destroyed cover must permit the newly clear direct route');
});

test('scratch direct-path fast path rejects physically unsafe goal endpoints',()=>{
 const h=terrain(),g={time:10,hasLineOfSight:()=>true,isTerrainSafe:()=>false};
 assert.equal(h.strategicScratchCost(g,0,0,100,0,23,7,'unsafe'),Infinity);
 assert.equal(Object.keys(g.__v1102Routes||{}).length,0);
});


test('failed strategic scratch plans cannot grow per-tank cache without bound',()=>{
 const h=terrain();
 const g={time:10,__novaTerrain:[],hasLineOfSight:()=>false,isTerrainSafe:()=>true};
 for(let seed=1;seed<=120;seed++){
  h.strategicScratchCost(g,-200,0,200,0,23,seed,'unreachable');
  assert.ok(Object.keys(g.__v1102StrategicRoutes).length<=64,
   'failed or uncertified plans must obey the same memory cap as successful plans');
 }
});


test('scratch pricing fails closed without physical collision APIs',()=>{
 const h=terrain();
 for(const g of [{time:10,isTerrainSafe:()=>true},{time:10,hasLineOfSight:()=>true}]){
  assert.equal(h.strategicScratchCost(g,0,0,100,0,23,7,'heal'),Infinity);
  assert.equal(g.__v1102StrategicRoutes,undefined,
   'no uncertified scratch route may enter the cache');
 }
});
