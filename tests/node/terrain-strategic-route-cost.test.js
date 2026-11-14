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
