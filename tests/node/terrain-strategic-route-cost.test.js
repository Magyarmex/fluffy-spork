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
