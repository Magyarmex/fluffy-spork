const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/terrain-intelligence-v1.10.2.js'), 'utf8');
function boot(){
  const window={__novaModules:{}};
  const context={window,console:{info(){},warn(){},error(){}},Math,Object,Array,Number,String,Infinity};
  vm.runInNewContext(source,context,{filename:'terrain-intelligence-v1.10.2.js'});
  return window.__NOVA_TERRAIN_INTELLIGENCE_TEST__;
}
function segRect(ax,ay,bx,by,s,pad=0){
  const minx=s.x-s.w/2-pad,maxx=s.x+s.w/2+pad,miny=s.y-s.h/2-pad,maxy=s.y+s.h/2+pad;
  const dx=bx-ax,dy=by-ay;let t0=0,t1=1;
  for(const [p,q] of [[-dx,ax-minx],[dx,maxx-ax],[-dy,ay-miny],[dy,maxy-ay]]){
    if(Math.abs(p)<1e-9){if(q<0)return false;continue;}
    const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}
  }
  return t0<.995&&t1>.005;
}
function game(solids){
  return {
    __novaTerrain:solids,
    hasLineOfSight(ax,ay,bx,by,pad){return !solids.some(s=>segRect(ax,ay,bx,by,s,pad||0));},
    isTerrainSafe(x,y,pad){return !solids.some(s=>Math.abs(x-s.x)<=s.w/2+(pad||0)&&Math.abs(y-s.y)<=s.h/2+(pad||0));}
  };
}

test('bounded planner chains waypoints through serial walls instead of solving only the first corner',()=>{
  const T=boot();
  const g=game([
    {id:1,x:0,y:0,w:56,h:250,solid:true},
    {id:2,x:180,y:-25,w:56,h:300,solid:true}
  ]);
  const route=T.planVisibilityRoute(g,-330,0,430,0,18,7,null);
  assert.ok(route && route.length>=2,JSON.stringify(route));
  let x=-330,y=0;
  for(const p of route){assert.equal(g.hasLineOfSight(x,y,p.x,p.y,6.2),true,`blocked leg ${x},${y} -> ${p.x},${p.y}`);x=p.x;y=p.y;}
  assert.ok(route.length<=T.limits.maxNodes);
});

test('planner escapes a U-shaped pocket with a multi-leg route',()=>{
  const T=boot();
  const g=game([
    {id:1,x:0,y:-105,w:270,h:50,solid:true},
    {id:2,x:-110,y:35,w:50,h:330,solid:true},
    {id:3,x:110,y:35,w:50,h:330,solid:true}
  ]);
  const route=T.planVisibilityRoute(g,0,60,0,-360,16,4,null);
  assert.ok(route && route.length>=3,JSON.stringify(route));
  let x=0,y=60;
  for(const p of route){assert.equal(g.hasLineOfSight(x,y,p.x,p.y,5.5),true);x=p.x;y=p.y;}
});

test('planner stays cheap when the destination is already visible',()=>{
  const T=boot(),g=game([]);
  assert.deepEqual(Array.from(T.planVisibilityRoute(g,0,0,300,0,15,1,null)),[]);
});

test('hidden moving target coordinates are not substituted for frozen legitimate memory',()=>{
  const T=boot();
  const target={id:9,x:900,y:900,alive:true};
  const tank={x:0,y:0,ai:{targetId:9,isElite:false,__v172LastSeenId:9,__v172LastSeenX:310,__v172LastSeenY:70,__v172LastSeenAt:4}};
  const g={time:4.4,getTank(){return target;},hasLineOfSight(){return false;},drones:[]};
  const p=T.observedPoint(g,tank,{},4.4);
  assert.equal(p.live,false);assert.equal(p.source,'memory');assert.equal(p.x,310);assert.equal(p.y,70);
});

test('AI Controller live through-wall knowledge requires a real owned-drone sightline',()=>{
  const T=boot();
  const target={id:2,x:400,y:0,alive:true};
  const owner={id:1,cls:'carrier',x:0,y:0,ai:{targetId:2,__v172LastSeenId:-1},__novaCommandAI:{targetId:2}};
  const drone={id:11,ownerId:1,x:260,y:0,hp:20};
  const g={getTank(){return target;},drones:[drone],hasLineOfSight(ax){return ax===drone.x;}};
  const p=T.observedPoint(g,owner,{},10);
  assert.equal(p.source,'drone');assert.equal(p.live,true);assert.equal(p.x,400);
  g.hasLineOfSight=()=>false;
  assert.equal(T.observedPoint(g,owner,{},10),null);
});

test('committed drone attack states are excluded from recovery steering',()=>{
  assert.match(source,/d\.__novaPhase==='dash'\|\|d\.__novaPhase==='windup'/);
  assert.match(source,/dashSteering:false/);
  assert.match(source,/teleportRecovery:false/);
});

test('route search and anti-stuck work are explicitly bounded',()=>{
  const T=boot();
  assert.equal(T.limits.maxObstacles,6);
  assert.equal(T.limits.maxNodes,30);
  assert.match(source,/maxChecks=520/);
  assert.match(source,/ROUTE_TTL_TANK=1\.28/);
  assert.match(source,/__v1102SpotterPlanAt=now\+\.125/);
});

test('idle Controller movement that would cross terrain is redirected through a safe waypoint without gaining speed',()=>{
  const T=boot();
  const wall={x:10,y:0,w:8,h:80};
  const g=game([wall]);
  g.firstTerrainHit=(ax,ay,bx,by,pad)=>segRect(ax,ay,bx,by,wall,pad||0)?{hit:{nx:-1,ny:0}}:null;
  g.novaBattlefieldWaypoint=()=>({x:0,y:60});
  const d={id:12,x:20,y:0,r:8,__novaIdleMode:'farm',__novaIdleShape:{x:100,y:0,hp:20},__novaVX:200,__novaVY:0,__novaIdleVX:200,__novaIdleVY:0};
  const rerouted=T.preserveIdleDroneTerrain(g,d,{x:0,y:0},.1,13);
  assert.equal(rerouted,true);
  assert.ok(Math.abs(d.x)<1e-9,'reroute should not cross the wall');
  assert.ok(d.y>0&&d.y<=20.001,'reroute must preserve the original step budget');
  assert.ok(Math.hypot(d.__novaVX,d.__novaVY)<=200.001,'reroute must not add movement speed');
  assert.equal(d.__v172Routing,true);
});

test('unobstructed idle Controller movement is left untouched',()=>{
  const T=boot(),g=game([]);
  g.firstTerrainHit=()=>null;
  g.novaBattlefieldWaypoint=()=>{throw new Error('planner should not run for a clear step');};
  const d={id:13,x:18,y:4,r:8,__novaIdleMode:'return',__novaHomePoint:{x:120,y:0},__novaVX:180,__novaVY:40};
  const changed=T.preserveIdleDroneTerrain(g,d,{x:0,y:0},.1,13);
  assert.equal(changed,false);
  assert.equal(d.x,18);assert.equal(d.y,4);
});

test('idle Controller terrain correction remains scoped away from active commands and committed attack phases',()=>{
  assert.match(source,/po&&po\.alive&&isController\(po\)&&po\.__novaSwarm&&!po\.__novaSwarm\.active/);
  assert.match(source,/pd\.__novaPhase==='dash'\|\|pd\.__novaPhase==='windup'/);
  assert.doesNotMatch(source,/owner\.__novaSwarm\.active\)preserveIdleDroneTerrain/);
});
