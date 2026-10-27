'use strict';
// Real shipping-order movement chain. The raw idle witness is NOT a collision
// certificate: later wrappers can redirect, clamp, or repair the drone.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const overlays=[
 'controller-v1.3.0.js',
 'drone-discipline-v1.5.1.js',
 'battlefield-v1.6.0.js',
 'performance-v1.7.5.js',
 'terrain-intelligence-v1.10.2.js',
 'drone-field-service-v1.10.3.js',
 'second-body-live-vector-v1.10.7.js',
 'fair-engagement-v1.11.2.js'
];
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(let i=1;i<overlays.length;i++){
 assert.ok(html.indexOf('nova-updates/'+overlays[i])>
  html.indexOf('nova-updates/'+overlays[i-1]),
  'actual production must load '+overlays[i]+' after '+overlays[i-1]);
}
class Game {
 constructor(){
  this.time=1;this.tanks=[];this.drones=[];this.shapes=[];this.bullets=[];
  this.droneCounts=new Map();this.tankById=new Map();
  this.__novaTerrain=[];this.quality='high';this.sfx={};
  this.cam={x:0,y:0,zoom:1,shake:0};this.w=800;this.h=600;
 }
 update(dt){this.time+=dt;this.updateDrones(dt);}
 updateDrones(){}
 updateBullets(){}
 moveTank(){}
 tryFire(){}
 setClass(){}
 spawnDrone(){}
 removeDroneAt(i){this.drones.splice(i,1);}
 acquireDroneTarget(){return null;}
 getTank(id){return this.tankById.get(id)||null;}
 damageTank(){}
 damageDrone(){}
 damageShape(){}
 addImpactDebris(){}
 addParticles(){}
 addRing(){}
}
class Input {attach(){}destroy(){}}
class Sfx {}
const mods={
 'game/engine':m=>{m.exports.Game=Game;},
 'game/input':m=>{m.exports.Input=Input;},
 'game/audio':m=>{m.exports.Sfx=Sfx;},
 'game/ai':m=>{m.exports.updateAI=()=>{};},
 'game/render':m=>{m.exports.render=()=>{};}
};
const win={__novaModules:mods,NOVATips:{registerMany(){}}};
const logger={info(){},warn(){},error(...a){throw Error(a.join(' '));}};
const classes={
 carrier:{size:15,droneCount:1,droneLeash:650,droneRole:'hunter',color:'#fff'},
 basic:{size:15,droneCount:0,droneLeash:0,droneRole:'hunter',color:'#fff'}
};
const requireMock=p=>p.includes('classes')?{
 CLASSES:classes,lineageForClass:id=>id==='carrier'?'controller':'gunner'
}:p.includes('types')?{TAU:Math.PI*2,MAP_LIMIT:2250}:p.includes('render')?{render(){}}:{};
for(const file of overlays){
 const source=fs.readFileSync(path.join(root,'nova-updates',file),'utf8');
 new Function('window','console','performance','document',source)(
  win,logger,{now:()=>0},{addEventListener(){}});
}
const m={exports:{}};
mods['game/engine'](m,m.exports,requireMock);
function world({trace=true,terrain=[],damaged=false,command=false}={}){
 const g=new m.exports.Game();
 const owner={id:1,cls:'carrier',kind:'tank',alive:true,isPlayer:true,
  x:0,y:0,angle:0,hp:100,maxHp:100,swarmT:0,droneRespawnT:999,
  __novaSwarm:{active:false,power:0}};
 const d={id:10,kind:'drone',ownerId:1,x:20,y:0,r:8,
  hp:damaged?8:30,maxHp:30,speed:200,dmg:12,attackCd:999,
  retargetT:999,leash:650,role:'hunter',slot:0,orbitA:0,orbitR:55,
  __novaPhase:'form',__novaPhaseT:0};
 const shape={id:20,kind:'shape',type:'circle',x:0,y:0,r:10,hp:100};
 Object.assign(g,{tanks:[owner],drones:[d],shapes:[shape],player:owner,
  tankById:new Map([[1,owner]]),__novaTerrain:terrain,
  input:{aim:{active:command,dx:50,dy:0}},
  __novaDroneChronoTraceEnabled:trace});
 return {g,d,owner,shape};
}
for(const hz of [30,60,120,240]){
 test('full shipping movement chain records raw idle integrator at '+hz+'Hz',()=>{
  const {g,d}=world(),dt=1/hz;
  g.update(dt);
  const epoch=g.__novaShapeSweepEpoch;
  assert.equal(d.__novaChronoIdleRawEpoch,epoch);
  assert.equal(d.__novaChronoIdleRawX,20);
  assert.equal(d.__novaChronoIdleRawY,0);
  assert.equal(d.__novaChronoIdleRawDt,dt);
  assert.equal(d.__novaChronoDroneTraceEpoch,epoch);
  assert.equal(d.__novaChronoDroneRouteEpoch,epoch);
  assert.equal(d.__novaChronoDroneLiveEpoch,epoch);
  assert.equal(d.__novaChronoIdleUnmodifiedEpoch,epoch,
   'unobstructed idle integration survives every shipping movement owner');
  assert.equal(d.__novaChronoIdleRawEndX,d.__novaChronoDroneBaseX);
  assert.equal(d.__novaChronoIdleRawEndX,d.__novaChronoDroneTerrainX);
  assert.equal(d.__novaChronoIdleRawEndX,d.__novaChronoDroneRouteX);
  assert.equal(d.__novaChronoIdleRawEndX,d.__novaChronoDroneLiveX);
  assert.equal(g.__novaShapeSweepActive,false);
 });
}
test('full shipping chain retains raw trace separately from terrain correction',()=>{
 const wall={id:-1,shape:'rect',x:20,y:0,w:16,h:60,
  solid:true,destructible:false};
 const {g,d}=world({terrain:[wall]});
 g.update(1/30);
 assert.equal(d.__novaChronoIdleRawEpoch,g.__novaShapeSweepEpoch);
 assert.notEqual(d.__novaChronoIdleRawEndX,d.__novaChronoDroneTerrainX,
  'raw integration must not be mistaken for a valid terrain-crossing path');
});
test('full shipping chain leaves optional trace inert when disabled',()=>{
 const {g,d}=world({trace:false});
 g.update(1/60);
 assert.equal(d.__novaChronoIdleRawEpoch,undefined);
});
test('full shipping chain does not certify actively commanded drones as idle',()=>{
 const {g,d}=world({command:true});
 g.update(1/60);
 assert.equal(d.__novaChronoIdleRawEpoch,-1);
});

test('full shipping path witnesses a physical contact before TTL that remains unawarded',()=>{
 const {g,d}=world();
 const dt=1/60,ttl=.004,projectileVX=2500,combinedRadius=12;
 g.update(dt);
 assert.equal(d.__novaChronoIdleRawEpoch,g.__novaShapeSweepEpoch);
 const x0=d.__novaChronoIdleRawX,x1=d.__novaChronoIdleRawEndX;
 const velocity=(x1-x0)/dt;
 const first=(x0-combinedRadius)/(projectileVX-velocity);
 assert.ok(first>0&&first<ttl,
  'exact witnessed relative-motion contact precedes physical expiration');
 assert.equal(x1,d.__novaChronoDroneLiveX,
  'this fixture has no later displacement, unlike the terrain test');
 // No additional projectile damage is authorized by the witness alone.
 assert.equal(d.hp,30);
});

test('wall correction invalidates the final idle motion witness',()=>{
 const wall={id:-1,shape:'rect',x:20,y:0,w:16,h:60,
  solid:true,destructible:false};
 const {g,d}=world({terrain:[wall]});
 g.update(1/30);
 assert.equal(d.__novaChronoIdleRawEpoch,g.__novaShapeSweepEpoch);
 assert.notEqual(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch);
 assert.equal(d.__novaChronoIdleInvalidEpoch,g.__novaShapeSweepEpoch);
});
test('Live Vector repair invalidates the raw Swarm motion even with safe terrain',()=>{
 const {g,d}=world({damaged:true});
 g.update(1/60);
 assert.equal(d.__novaChronoIdleRawEpoch,g.__novaShapeSweepEpoch);
 assert.equal(d.__novaChronoIdleInvalidEpoch,g.__novaShapeSweepEpoch);
 assert.notEqual(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch);
});
test('Performance cached steering invalidates a previous idle integration',()=>{
 const {g,d}=world();
 g.__novaPerfDronePlanAt=g.time+1;
 d.__v172Waypoint={x:150,y:0};
 d.__v172WaypointUntil=g.time+2;
 g.update(1/60);
 assert.equal(d.__novaChronoIdleRawEpoch,g.__novaShapeSweepEpoch);
 assert.equal(d.__novaChronoIdleInvalidEpoch,g.__novaShapeSweepEpoch);
 assert.notEqual(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch);
});
test('diagnostics-disabled shipping chain creates no final motion witness',()=>{
 const {g,d}=world({trace:false});
 g.update(1/60);
 assert.equal(d.__novaChronoIdleUnmodifiedEpoch,undefined);
});
