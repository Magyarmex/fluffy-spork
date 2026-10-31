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
  this.tmp=[];this.hitOwners=[];this.tankHits=[];this.hash={query:(_x,_y,_r,out)=>{out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);}};
  this.droneCounts=new Map();this.tankById=new Map();
  this.__novaTerrain=[];this.quality='high';this.sfx={};
  this.cam={x:0,y:0,zoom:1,shake:0};this.w=800;this.h=600;
 }
 update(dt){this.time+=dt;if(this.__novaTestSpawnBullet){this.bullets.push(this.__novaTestSpawnBullet);this.__novaTestSpawnBullet=null;}this.updateDrones(dt);this.updateBullets(dt);}
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
 damageTank(t,amount,owner){this.tankHits.push([t.id,owner]);}
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
  hp:damaged?3:30,maxHp:30,speed:200,dmg:12,attackCd:999,
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
  vx=2500,ttl=.004,pen=0,otherBullets=[],friendly=false,phase='form',idleVY=null,bornThisFrame=false,frontTank=null,cachedSteering=false,
  remoteBullets=0,reverseBullets=false,extraDrone=false,damaged=false}={}){
 const {g,d,owner}=world({trace,terrain,command,damaged});
 owner.x=-200;owner.y=0;
 const shooter={id:2,cls:'basic',kind:'tank',alive:true,x:-1000,y:0,hp:100};
 g.tanks.push(shooter);g.tankById.set(2,shooter);
 g.shapes[0].x=0;g.shapes[0].y=50;
 if(frontTank!==null){const t={id:3,cls:'basic',kind:'tank',alive:true,
  x:frontTank,y:0,hp:100};g.tanks.push(t);g.tankById.set(3,t);}
 d.x=x;d.y=y;d.__novaPhase=phase;
 if(extraDrone)g.drones.push({...d,id:11,x:x+5,y:y,slot:1,
  __novaPhase:'form',__novaPhaseT:0,attackCd:999});
 if(idleVY!==null)d.__novaIdleVY=idleVY;
 if(cachedSteering){g.__novaPerfDronePlanAt=g.time+1;
  d.__v172Waypoint={x:150,y:0};d.__v172WaypointUntil=g.time+2;}
 g.bullets=[{kind:'bullet',id:100,ownerId:friendly?1:2,x:0,y:0,
  vx,vy:0,r:3,dmg:20,ttl,pen,hits:0,dead:false,
  shell:false,beam:false},...otherBullets];
 for(let i=0;i<remoteBullets;i++)g.bullets.push({kind:'bullet',
  id:200+i,ownerId:3,x:1200+i*.1,y:1200,vx:10,vy:0,
  r:3,dmg:2,ttl:1,pen:0,hits:0,dead:false,shell:false,beam:false});
 if(reverseBullets)g.bullets.reverse();
 if(bornThisFrame)g.__novaTestSpawnBullet=g.bullets.find(b=>b.id===100),
  g.bullets=g.bullets.filter(b=>b.id!==100);
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
 test('same-frame newly fired projectile receives certified contact at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{bornThisFrame:true});
  assert.equal(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch,
   'tracing must arm after the firing phase, before drone movement');
  assert.deepEqual(g.hitOwners,[2]);
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
 test('certified commanded movement must recover guaranteed pre-TTL hit at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true});
  assert.equal(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch,
   'all shipping movement owners must certify one commanded form integration');
  assert.deepEqual(g.hitOwners,[2]);
  assert.equal(d.hp,10);
 });
 test('commanded pen=1 shot recovers certified pre-TTL contact at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,pen:1});
  assert.equal(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch,
   'ordinary piercing shot must arm the existing safe command witness');
  assert.deepEqual(g.hitOwners,[2],
   'single guaranteed contact before expiry retains real damage owner');
  assert.equal(d.hp,10);
 });
 test('commanded pen=1 shot beyond physical TTL remains harmless at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,pen:1,x:24});
  assert.equal(d.hp,30);assert.equal(g.hitOwners.includes(2),false);
 });
 test('commanded pen=1 shot cannot bypass earlier solid cover at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,pen:1,
   terrain:[{id:-1,shape:'rect',x:6,y:0,w:2,h:70,
    solid:true,destructible:false}]});
  assert.equal(d.hp,30);assert.equal(g.hitOwners.includes(2),false);
 });
 test('remote projectile density cannot suppress local pen=1 contact at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,pen:1,remoteBullets:20});
  assert.equal(d.hp,10);
 });
 test('commanded target beyond physical TTL is unharmed at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{command:true,x:24});
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('commanded cached-steering displacement invalidates TTL certificate at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,cachedSteering:true,trace:true});
  assert.notEqual(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch);
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('commanded drone behind earlier permanent cover is not hit at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{command:true,terrain:[{id:-1,shape:'rect',
   x:6,y:0,w:2,h:70,solid:true,destructible:false}]});
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('commanded drone cannot steal earlier tank contact at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{command:true,frontTank:23});
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('later tank cannot suppress certified commanded hit at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{command:true,frontTank:40});
  assert.deepEqual(g.hitOwners,[2]);
 });
 test('commanded own drone cannot receive friendly projectile damage at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{command:true,friendly:true});
  assert.equal(g.hitOwners.includes(1),false);
 });
 test('commanded drone with competing projectile is not awarded speculative hit at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{command:true,otherBullets:[{kind:'bullet',
   id:101,ownerId:3,x:20,y:10,vx:0,vy:0,r:3,dmg:2,ttl:1,
   pen:0,hits:0,dead:false,shell:false,beam:false}]});
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('commanded windup never inherits ordinary form certificate at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,phase:'windup'});
  assert.notEqual(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch);
 });
 test('commanded dash never inherits ordinary form certificate at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,phase:'dash'});
  assert.notEqual(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch);
 });
 test('commanded swarm separation invalidates mixed steering certificate at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,extraDrone:true,trace:true});
  assert.equal(d.__novaChronoCommandInvalidEpoch,g.__novaShapeSweepEpoch,
   'real Terrain Intelligence separation must explicitly reject a mixed owner');
  assert.notEqual(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch);
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('commanded repair movement invalidates single-step certificate at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{command:true,damaged:true,trace:true});
  assert.equal(d.__novaChronoCommandInvalidEpoch,g.__novaShapeSweepEpoch,
   'real Live Vector repair performs a second integration');
  assert.notEqual(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch);
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('earlier tank contact vetoes a later certified drone shortcut at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{frontTank:23});
  assert.equal(g.hitOwners.includes(2),false,
   'later drone hit must not steal earlier tank priority; full tank TTL arbitration remains deferred');
 });
 test('later tank cannot suppress earlier certified drone hit at '+hz+'Hz',()=>{
  const {g}=shotWorld(hz,{frontTank:40});
  assert.deepEqual(g.hitOwners,[2]);
 });
 test('terrain-corrected idle path is never certified for damage at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{terrain:[{id:-1,shape:'rect',
   x:20,y:0,w:16,h:60,solid:true,destructible:false}]});
  assert.notEqual(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch);
  assert.equal(g.hitOwners.includes(2),false);
 });
 test('cached-steering displacement invalidates first-contact proof at '+hz+'Hz',()=>{
  const {g,d}=shotWorld(hz,{cachedSteering:true});
  assert.notEqual(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch);
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
  const {g,d}=shotWorld(hz,{x:14,y:9.5,idleVY:-800});
  assert.equal(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch);
  const t=.004,dt=1/hz;
  const x=d.__novaChronoIdleRawX+
   (d.__novaChronoIdleRawEndX-d.__novaChronoIdleRawX)*t/dt;
  const y=d.__novaChronoIdleRawY+
   (d.__novaChronoIdleRawEndY-d.__novaChronoIdleRawY)*t/dt;
  assert.ok(Math.hypot(x-2500*t,y)<12,
   'independent relative-position oracle proves pre-expiry overlap: '+JSON.stringify({x,y,dt}));
  assert.deepEqual(g.hitOwners,[2]);
 });
}
/* Independent conservative speed-ball oracle: only cases guaranteed
 * to overlap despite ANY drone path <=200u/s are required to hit.
 * Do not confuse uncertified possible contacts with guaranteed ones. */
for(const hz of [30,60,120,240]){
 test('seeded commanded guaranteed-contact speed envelopes at '+hz+'Hz',()=>{
  let seed=0x12345+hz;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  let certified=0;
  for(let i=0;i<240;i++){
   const x=13.5+rand()*11,y=(rand()-.5)*10;
   const vx=2000+rand()*2000,ttl=.002+rand()*.002;
   const radius=12,speedBound=200;
   let guaranteed=false;
   for(let k=1;k<=80;k++){
    const t=ttl*k/80;
    if(Math.hypot(vx*t-x,y)+speedBound*t<radius-.015){
     guaranteed=true;break;
    }
   }
   if(!guaranteed)continue;
   const {g,d}=shotWorld(hz,{command:true,x,y,vx,ttl});
   assert.equal(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch,
    'single commanded movement must be witnessed in clear world '+JSON.stringify({hz,x,y,vx,ttl}));
   assert.deepEqual(g.hitOwners,[2],
    'guaranteed physical contact must not vanish at TTL '+JSON.stringify({hz,x,y,vx,ttl}));
   certified++;
  }
  assert.ok(certified>=12,'seed must exercise multiple guaranteed command contacts: '+certified);
 });
}

/* Exact Run 494 pre-fix paired distribution: the old generic speed ball
 * missed 416 of these 605 mathematically guaranteed commanded contacts.
 * This regression uses the same seed and physical source composition. */
test('Run 494 commanded 605-contact replay no longer misses physical TTL hits',()=>{
 let seed=4942026,guaranteed=0;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const hz of [30,60,120,240]){
  let atFps=0;
  for(let i=0;i<200;i++){
   const x=15+rand()*8,y=-4+rand()*8;
   if(!(Math.hypot(x,y)>12&&Math.hypot(x-10,y)+.8<12))continue;
   const {g,d}=shotWorld(hz,{command:true,x,y});
   assert.equal(d.__novaChronoCommandBoundedEpoch,g.__novaShapeSweepEpoch);
   assert.deepEqual(g.hitOwners,[2],
    'previously missed guaranteed contact '+JSON.stringify({hz,i,x,y}));
   atFps++;guaranteed++;
  }
  assert.equal(atFps,({30:148,60:151,120:163,240:143})[hz],
   'same predeclared geometric exposure as the baseline');
 }
 assert.equal(guaranteed,605);
});

test('non-expiring shots do not activate the optional motion witness',()=>{
 const {g,d}=shotWorld(60,{ttl:1,x:100});
 assert.equal(d.__novaChronoIdleRawEpoch,undefined);
 assert.notEqual(g.__novaDroneChronoTraceEnabled,true);
});

for(const hz of [30,60,120,240])for(const reverse of [false,true]){
 test('remote projectile density cannot disable local certified TTL contact '+
  hz+'Hz reverse='+reverse,()=>{
  const {g,d}=shotWorld(hz,{remoteBullets:960,reverseBullets:reverse});
  assert.equal(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch,
   'unrelated remote bullets must not globally disable the local motion witness');
  assert.deepEqual(g.hitOwners,[2]);
 });
}


/* Run 387: verify the actual eight-overlay Controller movement and
 * certified first-contact chain above the former 1,200-body global cap. */
for(const hz of [30,60])for(const reverse of [false,true]){
 test('certified idle drone survives 2000 unrelated projectiles at '+
  hz+'Hz, reversed='+reverse,()=>{
  const {g,d}=shotWorld(hz,{remoteBullets:2000,reverseBullets:reverse});
  assert.equal(d.__novaChronoIdleUnmodifiedEpoch,g.__novaShapeSweepEpoch,
   'real movement epoch must remain certified under remote fire');
  assert.deepEqual(g.hitOwners,[2],
   'one physical pre-expiry drone hit must retain ordinary damage attribution');
  assert.equal(d.hp,10);
  assert.notEqual(g.__novaDroneChronoTraceEnabled,true,
   'optional tracing must be reset after the real update');
 });
}
