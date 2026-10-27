'use strict';
// Shipping-composition acceptance for exact, certified idle-drone TTL contacts.
// Must fail before implementation; no synthetic damage shortcut is substituted.
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
  this.tmp=[];this.hitOwners=[];this.hash={query:(_x,_y,_r,out)=>{out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);}};
  this.droneCounts=new Map();this.tankById=new Map();
  this.__novaTerrain=[];this.quality='high';this.sfx={};
  this.cam={x:0,y:0,zoom:1,shake:0};this.w=800;this.h=600;
 }
 update(dt){this.time+=dt;this.updateDrones(dt);this.updateBullets(dt);}
 updateDrones(){}
 updateBullets(){}
 initBulletIntegrity(){}
 resolveBulletCollisions(){}
 moveTank(){}
 tryFire(){}
 setClass(){}
 spawnDrone(){}
 removeDroneAt(i){this.drones.splice(i,1);}
 acquireDroneTarget(){return null;}
 getTank(id){return this.tankById.get(id)||null;}
 damageTank(){}
 damageDrone(d,amount,owner){this.hitOwners.push(owner);d.hp-=amount;}
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
const marker='    updateBullets(dt) {';
const start=html.indexOf(marker);
assert.ok(start>=0);
let end=start+marker.length,depth=1;
while(depth&&end<html.length){if(html[end]==='{')depth++;else if(html[end]==='}')depth--;end++;}
assert.equal(depth,0);
Game.prototype.updateBullets=new Function('types_1','classes_1','M',
 'return function(dt){'+html.slice(start+marker.length,end-1)+'}')(
 {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
 {CLASSES:classes},2250);
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

function shotWorld(hz,{terrain=[],command=false,trace=false,x=20,y=0,
  vx=2500,ttl=.004,otherBullets=[],friendly=false,phase='form',idleVY=null}={}){
 const {g,d,owner}=world({trace,terrain,command});
 owner.x=-200;owner.y=0;
 const shooter={id:2,cls:'basic',kind:'tank',alive:true,x:-1000,y:0,hp:100};
 g.tanks.push(shooter);g.tankById.set(2,shooter);
 g.shapes[0].x=0;g.shapes[0].y=50;
 d.x=x;d.y=y;d.__novaPhase=phase;
 if(idleVY!==null)d.__novaIdleVY=idleVY;
 g.bullets=[{kind:'bullet',id:100,ownerId:friendly?1:2,x:0,y:0,
  vx,vy:0,r:3,dmg:20,ttl,pen:0,hits:0,dead:false,
  shell:false,beam:false},...otherBullets];
 g.update(1/hz);
 return {g,d,owner};
}
for(const hz of [30,60,120,240]){
 test('certified idle drone receives physical pre-TTL contact at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz);
  assert.equal(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch,
   'real shipping movement chain must certify the single unmodified idle step');
  assert.deepEqual(g.hitOwners,[2],
   'one legitimate hostile hit before expiration; no synthetic duplicates');
  assert.equal(d.hp,10);
  assert.notEqual(g.__novaDroneChronoTraceEnabled,true,
   'temporary tracing must not remain globally enabled');
 });
 test('certified idle drone beyond TTL remains unharmed at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{x:32});
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('earlier permanent cover blocks certified drone hit at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{terrain:[{id:-1,shape:'rect',
   x:6,y:0,w:2,h:70,solid:true,destructible:false}]});
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('owned projectile never damages its own certified drone at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{friendly:true});
  assert.equal(g.hitOwners.includes(1),false);
 });
 test('uncertified commanded movement never invents contact at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{command:true});
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('side projectile competing for the drone vetoes speculative credit at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{otherBullets:[{kind:'bullet',id:101,ownerId:3,
   x:20,y:10,vx:0,vy:0,r:3,dmg:2,ttl:1,pen:0,hits:0,
   dead:false,shell:false,beam:false}]});
  assert.equal(g.hitOwners.includes(2),false);
 });
}
for(const hz of [30,60,120,240]){
 test('certified lateral idle motion may contact before TTL at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{x:15,y:13,idleVY:-800});
  assert.equal(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch);
  const t=.004,dt=1/hz;
  const x=d.__novaChronoIdleRawX+
   (d.__novaChronoIdleRawEndX-d.__novaChronoIdleRawX)*t/dt;
  const y=d.__novaChronoIdleRawY+
   (d.__novaChronoIdleRawEndY-d.__novaChronoIdleRawY)*t/dt;
  assert.ok(Math.hypot(x-2500*t,y)<12,
   'independent relative-position oracle proves pre-expiry overlap');
  assert.deepEqual(g.hitOwners,[2]);
 });
}
test('non-expiring shots do not activate the optional motion witness',()=>{
 const {g,d}=shotWorld(60,{ttl:1,x:100});
 assert.equal(d.__novaChronoIdleRawEpoch,undefined);
 assert.notEqual(g.__novaDroneChronoTraceEnabled,true);
});
