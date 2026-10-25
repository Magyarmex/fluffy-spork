'use strict';
// Production-order, opt-in drone motion checkpoints. These are phase positions,
// NOT timestamps or proof of a continuously traversed straight-line segment.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const battlefield=fs.readFileSync(path.join(root,'nova-updates/battlefield-v1.6.0.js'),'utf8');
const live=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const terrainIntelligence=fs.readFileSync(path.join(root,'nova-updates/terrain-intelligence-v1.10.2.js'),'utf8');

function boot({trace=true,spawn=false,baseMotion=25,damaged=true,ownerX=100,ownerY=100,withTerrainIntelligence=false}={}){
  class Game {
    update(dt){this.time+=dt;this.updateDrones(dt);}
    updateDrones(){
      if(baseMotion)this.drones[0].x+=baseMotion;
      if(spawn)this.drones.push({id:99,ownerId:1,x:-90,y:0,r:8,hp:100,maxHp:100,
        speed:200,__novaPhase:'form',attackCd:1});
    }
    getTank(id){return this.tankById.get(id)||null;}
  }
  const modules={
    'game/engine':m=>{m.exports.Game=Game;},
    'game/audio':m=>{m.exports.Sfx=null;},
    'game/ai':m=>{m.exports.updateAI=null;},
    'game/render':m=>{m.exports.render=null;}
  };
  const window={__novaModules:modules,NOVATips:{registerMany(){}}};
  const ctx={window,document:{addEventListener(){}},
    console:{info(){},warn(){},error(){}},performance:{now:()=>0},
    Math,Date,Map,Set,Number,Object,Array,WeakMap};
  vm.runInNewContext(battlefield,ctx,{filename:'battlefield-v1.6.0.js'});
  if(withTerrainIntelligence)vm.runInNewContext(terrainIntelligence,ctx,{filename:'terrain-intelligence-v1.10.2.js'});
  vm.runInNewContext(live,ctx,{filename:'second-body-live-vector-v1.10.7.js'});
  const m={exports:{}};
  modules['game/engine'](m,m.exports,()=>({CLASSES:{
    carrier:{droneLeash:650,size:15},gunner:{size:15}
  },lineageForClass:id=>id==='carrier'?'controller':'gunner'}));
  const owner={id:1,cls:'carrier',team:1,alive:true,isPlayer:true,
    x:ownerX,y:ownerY,hp:100,maxHp:100,angle:0,swarmT:0,
    __novaSwarm:{active:false,power:0}};
  const drone={id:11,ownerId:1,x:-30,y:0,r:8,hp:damaged?10:100,
    maxHp:100,speed:200,__novaPhase:'form',attackCd:1};
  const g=new m.exports.Game();
  Object.assign(g,{drones:[drone],tanks:[owner],shapes:[],bullets:[],
    player:owner,time:1,quality:'high',status:'test',
    tankById:new Map([[1,owner]]),
    __novaTerrain:[{id:-1,shape:'rect',x:0,y:0,w:20,h:200,
      solid:true,destructible:false}],
    __novaBattlefield:{name:'test',coverTotal:0,coverBroken:0},
    __novaDroneChronoTraceEnabled:trace});
  return {g,drone,owner};
}
test('materialized shipping chain loads Battlefield before Live Vector',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const b=html.indexOf('nova-updates/battlefield-v1.6.0.js');
  const l=html.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
  assert.ok(b>=0&&l>b);
});
test('trace distinguishes initial, pre-terrain, post-terrain and post-Live-Vector positions',()=>{
  const {g,drone}=boot();
  g.update(.2);
  const epoch=g.__novaShapeSweepEpoch;
  assert.equal(drone.__novaChronoDroneEpoch,epoch);
  assert.equal(drone.__novaChronoDroneTraceEpoch,epoch);
  assert.equal(drone.__novaChronoDroneLiveEpoch,epoch);
  assert.equal(drone.__novaChronoDronePrevX,-30);
  assert.equal(drone.__novaChronoDronePrevY,0);
  assert.equal(drone.__novaChronoDroneBaseX,-5);
  assert.equal(drone.__novaChronoDroneBaseY,0);
  assert.ok(drone.__novaChronoDroneTerrainX<=-19,
    'Battlefield moves the drone out of the wall after base movement');
  assert.ok(Number.isFinite(drone.__novaChronoDroneTerrainY));
  assert.notEqual(drone.__novaChronoDroneTerrainY,drone.__novaChronoDroneBaseY,
    'the real Battlefield terrain-bias recovery changes the lateral position');
  assert.equal(drone.__novaChronoDroneLiveX,drone.x);
  assert.equal(drone.__novaChronoDroneLiveY,drone.y);
  assert.ok(drone.y>drone.__novaChronoDroneTerrainY,
    'the tiny terrain clearance lets Live Vector resume tangential repair');
  assert.equal(g.isTerrainSafe(drone.x,drone.y,9),true);
});
test('wall-corrected drone resumes repair without diagnostic instrumentation',()=>{
  const {g,drone}=boot({trace:false,baseMotion:25,damaged:true});
  g.update(.2);
  assert.equal(g.isTerrainSafe(drone.x,drone.y,9),true,
    'Battlefield leaves the drone outside the inclusive padded wall');
  assert.ok(drone.y>0,'Live Vector can slide along the wall toward its owner');
  assert.equal(drone.__novaChronoDroneTraceEpoch,undefined,
    'gameplay correction does not depend on diagnostic mode');
});
test('safe open-field movement receives no artificial wall clearance',()=>{
  const {g,drone}=boot({trace:true,baseMotion:0,damaged:false});
  g.update(1/60);
  assert.equal(drone.__novaChronoDroneTerrainX,drone.__novaChronoDroneBaseX);
  assert.equal(drone.__novaChronoDroneTerrainY,drone.__novaChronoDroneBaseY);
});
test('unobstructed Live Vector repair is a separate observed movement stage',()=>{
  const {g,drone}=boot({baseMotion:0,ownerX:-50,ownerY:100});
  g.update(1/30);
  assert.equal(drone.__novaChronoDroneBaseX,-30);
  assert.equal(drone.__novaChronoDroneTerrainX,-30);
  assert.ok(drone.__novaChronoDroneLiveY>drone.__novaChronoDroneTerrainY,
    'postprocess moves toward owner after the Battlefield stage');
  assert.equal(drone.__novaChronoDroneLiveEpoch,g.__novaShapeSweepEpoch);
  assert.equal(g.isTerrainSafe(drone.x,drone.y,9),true);
});
test('full Battlefield → Terrain Intelligence → Live Vector chain observes route stage',()=>{
  const {g,drone}=boot({withTerrainIntelligence:true,baseMotion:0,
    ownerX:-50,ownerY:100});
  g.update(1/30);
  const epoch=g.__novaShapeSweepEpoch;
  assert.equal(drone.__novaChronoDroneTraceEpoch,epoch);
  assert.equal(drone.__novaChronoDroneRouteEpoch,epoch);
  assert.equal(drone.__novaChronoDroneLiveEpoch,epoch);
  assert.ok(Number.isFinite(drone.__novaChronoDroneRouteX));
  assert.ok(Number.isFinite(drone.__novaChronoDroneRouteY));
  assert.equal(drone.__novaChronoDroneRouteX,drone.__novaChronoDroneTerrainX,
    'no separate routing displacement in this unobstructed fixture');
  assert.equal(drone.__novaChronoDroneRouteY,drone.__novaChronoDroneTerrainY);
  assert.ok(drone.__novaChronoDroneLiveY>drone.__novaChronoDroneRouteY,
    'postprocess movement remains a distinct later stage');
});
test('routing stage is inert when diagnostics are disabled',()=>{
  const a=boot({withTerrainIntelligence:true,trace:true,baseMotion:0,
    ownerX:-50,ownerY:100});
  const b=boot({withTerrainIntelligence:true,trace:false,baseMotion:0,
    ownerX:-50,ownerY:100});
  a.g.update(1/60);b.g.update(1/60);
  assert.equal(a.drone.x,b.drone.x);
  assert.equal(a.drone.y,b.drone.y);
  assert.equal(b.drone.__novaChronoDroneRouteEpoch,undefined);
});
test('opt-in checkpoints do not alter gameplay state',()=>{
  const a=boot({trace:true}),b=boot({trace:false});
  for(let i=0;i<3;i++){a.g.update(1/30);b.g.update(1/30);}
  for(const key of ['x','y','hp','__novaPhase','__lvRepairing','__novaVX','__novaVY']){
    assert.equal(a.drone[key],b.drone[key],key+' must be unaffected');
  }
  assert.equal(b.drone.__novaChronoDroneTraceEpoch,undefined);
  assert.equal(b.drone.__novaChronoDroneLiveEpoch,undefined);
});
test('newborn drones are not assigned a fictitious frame-start movement trace',()=>{
  const {g,drone}=boot({spawn:true,baseMotion:0,damaged:false});
  g.update(1/60);
  const newborn=g.drones.find(d=>d.id===99);
  assert.ok(newborn);
  assert.equal(newborn.__novaChronoDroneEpoch,undefined);
  assert.equal(newborn.__novaChronoDroneTraceEpoch,undefined);
  assert.equal(newborn.__novaChronoDroneLiveEpoch,undefined);
  assert.equal(drone.__novaChronoDroneTraceEpoch,g.__novaShapeSweepEpoch);
});
test('a new frame invalidates previous optional stage epochs',()=>{
  const {g,drone}=boot({baseMotion:0,damaged:false});
  g.update(1/60);
  const first=drone.__novaChronoDroneTraceEpoch;
  g.__novaDroneChronoTraceEnabled=false;
  g.update(1/60);
  assert.ok(g.__novaShapeSweepEpoch>first);
  assert.notEqual(drone.__novaChronoDroneTraceEpoch,g.__novaShapeSweepEpoch);
  assert.notEqual(drone.__novaChronoDroneLiveEpoch,g.__novaShapeSweepEpoch);
});
test('phase snapshots are not an authority for time of collision',()=>{
  const {g,drone}=boot();
  g.update(.2);
  assert.ok(drone.__novaChronoDroneBaseX>drone.__novaChronoDroneTerrainX);
  assert.notEqual(drone.__novaChronoDroneBaseY,drone.__novaChronoDroneTerrainY,
    'terrain correction is a separate physical stage');
  assert.ok(drone.__novaChronoDroneLiveY>drone.__novaChronoDroneTerrainY,
    'postprocess now escapes the inclusive contact boundary');
  // Base movement crossed solid terrain and was corrected. An endpoint-only
  // interpolation would invent a physically impossible path through the wall.
  assert.equal(g.isTerrainSafe(drone.__novaChronoDroneBaseX,0,9),false);
  assert.equal(g.isTerrainSafe(drone.__novaChronoDroneLiveX,
    drone.__novaChronoDroneLiveY,9),true);
});
