'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

// Exercise the shipping overlay's wrapped AI entrypoint, not a copied timer formula.
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/battle-sense-v1.8.1.js'),'utf8');
function runCadence(dt,seconds,id=3){
  const Game=function(){};
  const ai={updateAI(){}};
  const modules={
    'game/engine':(module)=>{module.exports={Game};},
    'game/ai':(module)=>{module.exports=ai;}
  };
  const window={__novaModules:modules};
  vm.runInNewContext(source,{window,console});
  const module={exports:{}};
  modules['game/ai'](module,module.exports,()=>({CLASSES:{guard:{size:15}},lineageForClass:()=>null}));
  const g={time:0,tanks:[],powerups:[],bullets:[],tankSpeed:()=>114,moveTank(){}};
  const tank={id,cls:'guard',x:0,y:0,hp:100,maxHp:100,alive:true,ai:{}};
  g.tanks=[tank];
  const times=[];
  for(let step=0;step<Math.round(seconds/dt);step++){
    g.time=step*dt;
    const before=window.__NOVA_BATTLE_SENSE__.plans;
    module.exports.updateAI(tank,g,dt);
    if(window.__NOVA_BATTLE_SENSE__.plans>before)times.push(g.time+dt);
  }
  return times;
}
test('Battle Sense preserves near-identical strategic cadence at 30 and 60 Hz',()=>{
  const slow=runCadence(1/30,12),fast=runCadence(1/60,12);
  const interval=.16+3*.018;
  assert.ok(Math.abs(slow.length-fast.length)<=1,{slow:slow.length,fast:fast.length});
  for(const [times,dt] of [[slow,1/30],[fast,1/60]]){
    assert.ok(times.length>=55);
    for(let i=1;i<times.length;i++){
      const gap=times[i]-times[i-1];
      assert.ok(Math.abs(gap-interval)<=dt+1e-7,`gap ${gap} outside cadence tolerance`);
    }
  }
});
test('Battle Sense long frames do not trigger unbounded catch-up plans',()=>{
  const times=runCadence(.5,5);
  assert.equal(times.length,10);
});
test('Battle Sense strategic cadence remains bounded at irregular frame intervals',()=>{
  for(const dt of [1/20,1/40,1/75,1/120]){
    const times=runCadence(dt,12);
    assert.ok(times.length>=54&&times.length<=58,`dt=${dt} plans=${times.length}`);
  }
});

test('Battle Sense prices a certified exact-goal route without asking movement owner to advance',()=>{
 const Game=function(){};
 const modules={'game/engine':m=>{m.exports={Game};}};
 const window={__novaModules:modules};
 vm.runInNewContext(source,{window,console});
 const classes={CLASSES:{guard:{size:16}}};
 const tank={id:7,cls:'guard',x:0,y:0};
 const heal={id:17,type:'heal',x:100,y:0};
 let waypoints=0,readCalls=0;
 const g={
  hasLineOfSight:()=>false,
  isTerrainSafe:()=>false,
  novaReadOnlyExactRouteLength(x,y,gx,gy,pad,seed){
   readCalls++;
   assert.equal(pad,24);
   assert.equal(seed,7);
   return 180;
  },
  novaBattlefieldWaypoint(){waypoints++;return{x:0,y:60};},
  novaRouteLength:()=>200
 };
 assert.equal(window.__NOVA_BATTLE_SENSE_TEST__.routeDistance(g,tank,heal,100,classes),180);
 assert.equal(readCalls,1);
 assert.equal(waypoints,0,'strategic pricing must not mutate the certified waypoint owner');
 g.isTerrainSafe=()=>true;
 assert.equal(window.__NOVA_BATTLE_SENSE_TEST__.routeDistance(g,tank,heal,100,classes),180);
 assert.equal(readCalls,2,'safe starts must reuse the same exact-goal certificate');
 assert.equal(waypoints,0,'a safe start must not advance a certified movement route');
 g.isTerrainSafe=()=>false;
 g.novaReadOnlyExactRouteLength=()=>null;
 assert.equal(window.__NOVA_BATTLE_SENSE_TEST__.routeDistance(g,tank,heal,100,classes),200);
 assert.equal(waypoints,1,'a boundary cache miss retains existing route-seeding behavior');
});
