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
  for(const p of route){assert.equal(g.hasLineOfSight(x,y,p.x,p.y,13),true,`blocked leg ${x},${y} -> ${p.x},${p.y}`);x=p.x;y=p.y;}
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
  for(const p of route){assert.equal(g.hasLineOfSight(x,y,p.x,p.y,11),true);x=p.x;y=p.y;}
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
  const wall={x:20,y:0,w:8,h:80};
  const g=game([wall]);
  g.firstTerrainHit=(ax,ay,bx,by,pad)=>segRect(ax,ay,bx,by,wall,pad||0)?{hit:{nx:-1,ny:0}}:null;
  g.novaBattlefieldWaypoint=()=>({x:0,y:80});
  const d={id:12,x:40,y:0,r:8,__novaIdleMode:'farm',__novaIdleShape:{x:120,y:0,hp:20},__novaVX:400,__novaVY:0,__novaIdleVX:400,__novaIdleVY:0};
  const rerouted=T.preserveIdleDroneTerrain(g,d,{x:0,y:0},.1,13);
  assert.equal(rerouted,true);
  assert.ok(Math.abs(d.x)<1e-9,'reroute should not cross the wall');
  assert.ok(d.y>0&&d.y<=40.001,'reroute must preserve the original step budget');
  assert.ok(Math.hypot(d.__novaVX,d.__novaVY)<=400.001,'reroute must not add movement speed');
  assert.equal(d.__v172Routing,true);
});

test('blocked idle detour is invalidated and opposite-side route is attempted in the same frame',()=>{
  const T=boot();
  const wall={x:20,y:0,w:8,h:80};
  const g=game([wall]),seeds=[];
  g.firstTerrainHit=(ax,ay,bx,by,pad)=>segRect(ax,ay,bx,by,wall,pad||0)?{hit:{nx:-1,ny:0}}:null;
  g.__v1102Routes={'12:3':{stale:true}};
  g.novaBattlefieldWaypoint=(x,y,gx,gy,pad,seed)=>{seeds.push(seed);return seed===12?{x:80,y:0}:{x:0,y:80};};
  const d={id:12,x:40,y:0,r:8,__novaIdleMode:'farm',__novaIdleShape:{x:120,y:0,hp:20},__novaVX:400,__novaVY:0,__novaIdleVX:400,__novaIdleVY:0};
  const rerouted=T.preserveIdleDroneTerrain(g,d,{x:0,y:0},.1,13);
  assert.equal(rerouted,true);
  assert.deepEqual(seeds,[12,13]);
  assert.equal(g.__v1102Routes['12:3'],undefined,'blocked cached route must be invalidated immediately');
  assert.ok(Math.abs(d.x)<1e-9&&d.y>0,'alternate route should recover around the wall this frame');
  assert.ok(Math.hypot(d.__novaVX,d.__novaVY)<=400.001,'alternate recovery must preserve the original speed budget');
  assert.equal(d.__v1102IdleRouteFlip,0);
});

test('when both idle detours are blocked the drone stops safely and alternates preferred route next frame',()=>{
  const T=boot();
  const g=game([]),seeds=[];
  g.isTerrainSafe=()=>false;
  g.firstTerrainHit=()=>({hit:{nx:-1,ny:0}});
  g.__v1102Routes={'12:3':{stale:true},'13:3':{stale:true}};
  g.novaBattlefieldWaypoint=(x,y,gx,gy,pad,seed)=>{seeds.push(seed);return{x:80,y:0};};
  const d={id:12,x:40,y:0,r:8,__novaIdleMode:'return',__novaHomePoint:{x:120,y:0},__novaVX:400,__novaVY:0,__novaIdleVX:400,__novaIdleVY:0};
  const corrected=T.preserveIdleDroneTerrain(g,d,{x:0,y:0},.1,13);
  assert.equal(corrected,true);
  assert.deepEqual(seeds,[12,13]);
  assert.equal(d.x,0);assert.equal(d.y,0);
  assert.ok(Math.hypot(d.__novaVX,d.__novaVY)<=80.001,'failed detours should damp movement instead of pushing into cover');
  assert.equal(d.__v1102IdleRouteFlip,1,'next correction should prefer the opposite routing side');
  assert.equal(g.__v1102Routes['12:3'],undefined);assert.equal(g.__v1102Routes['13:3'],undefined);
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
  assert.match(source,/if\(before\[d\.id\]&&owner\.__novaSwarm&&!owner\.__novaSwarm\.active\)\{\s*var rerouted=preserveIdleDroneTerrain/);
});

test('narrow gates are routed around using the tank and drone collision radii, while passable gates stay direct',()=>{
  const T=boot();
  function gate(gap){
    const half=gap/2;
    return [
      {id:1,x:0,y:-(half+120),w:40,h:240,solid:true},
      {id:2,x:0,y:(half+120),w:40,h:240,solid:true}
    ];
  }
  function assertClear(g,route,startX,startY,radius){
    assert.ok(route&&route.length>=2,JSON.stringify(route));
    let x=startX,y=startY;
    for(const p of route){
      assert.equal(g.hasLineOfSight(x,y,p.x,p.y,radius),true,'blocked leg '+x+','+y+' -> '+p.x+','+p.y);
      assert.equal(g.isTerrainSafe(p.x,p.y,radius),true,'unsafe waypoint '+p.x+','+p.y);
      x=p.x;y=p.y;
    }
  }
  const tank=game(gate(28)),tankRoute=T.planVisibilityRoute(tank,-400,0,400,0,23,7,null);
  assert.equal(tank.hasLineOfSight(-400,0,400,0,18),false,'28px opening is narrower than a 36px tank body');
  assertClear(tank,tankRoute,-400,0,18);
  const tankOpen=game(gate(40));
  assert.equal(tankOpen.hasLineOfSight(-400,0,400,0,18),true);
  assert.deepEqual(Array.from(T.planVisibilityRoute(tankOpen,-400,0,400,0,23,7,null)),[]);
  const drone=game(gate(12)),droneRoute=T.planVisibilityRoute(drone,-400,0,400,0,13,9,null);
  assert.equal(drone.hasLineOfSight(-400,0,400,0,8),false,'12px opening is narrower than a 16px drone body');
  assertClear(drone,droneRoute,-400,0,8);
  const droneOpen=game(gate(20));
  assert.equal(droneOpen.hasLineOfSight(-400,0,400,0,8),true);
  assert.deepEqual(Array.from(T.planVisibilityRoute(droneOpen,-400,0,400,0,13,9,null)),[]);
});

test('exact-perpendicular approach routes around a long wall with physical clearance',()=>{
  const T=boot(),g=game([{id:1,x:0,y:0,w:70,h:420,solid:true}]);
  const route=T.planVisibilityRoute(g,-400,0,400,0,23,17,null);
  assert.ok(route&&route.length>=2,JSON.stringify(route));
  let x=-400,y=0;
  for(const p of route){
    assert.equal(g.hasLineOfSight(x,y,p.x,p.y,18),true,'blocked perpendicular leg '+x+','+y+' -> '+p.x+','+p.y);
    assert.equal(g.isTerrainSafe(p.x,p.y,18),true);
    x=p.x;y=p.y;
  }
});
