'use strict';
/* A physical body before permanent cover must be hit before the later wall.
 * This executes the materialized shipping core and real Battlefield wrapper,
 * optionally with the Performance overlay, not a replacement physics model.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
const marker='    updateBullets(dt) {',start=html.indexOf(marker);
assert.ok(start>=0,'shipping core method');
let end=start+marker.length,depth=1;
while(depth&&end<html.length){if(html[end]==='{')depth++;else if(html[end]==='}')depth--;end++;}
assert.equal(depth,0);
const moveMarker='    moveTank(t, vx, vy, dt) {',moveStart=html.indexOf(moveMarker);
assert.ok(moveStart>=0,'shipping core movement method');
let moveEnd=moveStart+moveMarker.length,moveDepth=1;
while(moveDepth&&moveEnd<html.length){if(html[moveEnd]==='{')moveDepth++;else if(html[moveEnd]==='}')moveDepth--;moveEnd++;}
assert.equal(moveDepth,0);
const coreMove=new Function('types_1','M',
 'return function(t,vx,vy,dt){'+html.slice(moveStart+moveMarker.length,moveEnd-1)+'}')(
 {clamp:(v,min,max)=>Math.max(min,Math.min(max,v))},2250);
const CLASSES={scout:{size:14},marksman:{size:14}};
/* Extract projectile integrity directly from the shipping core. Test stubs
 * elsewhere intentionally bypass interception HP, but a breach must not
 * initialize integrity using penetration AFTER that breach. */
function coreIntegrityMethod(name,args){
 const marker='    '+name+'('+args+') {',start=html.indexOf(marker);
 assert.ok(start>=0,'shipping core '+name);
 let end=start+marker.length,depth=1;
 while(depth&&end<html.length){if(html[end]==='{')depth++;else if(html[end]==='}')depth--;end++;}
 assert.equal(depth,0);
 return new Function('types_1','return function('+args+'){'+
  html.slice(start+marker.length,end-1)+'}')(
  {clamp:(v,min,max)=>Math.max(min,Math.min(max,v))});
}
const realInitIntegrity=coreIntegrityMethod('initBulletIntegrity','b');
const realWeakenBullet=coreIntegrityMethod('weakenBullet','b, absorbed');
const core=new Function('types_1','classes_1','M',
 'return function(dt){'+html.slice(start+marker.length,end-1)+'}')(
 {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
 {CLASSES},2250);
function boot(optimized){
 class Game{
  constructor(){
   this.time=1;this.bullets=[];this.tanks=[];this.shapes=[];this.drones=[];
   this.__novaShapeSweepActive=true;this.__novaShapeSweepEpoch=1;
   this.__novaTerrain=[];this.tmp=[];this.cam={shake:0};this.sfx={};
   this.player={id:999,x:1000,y:1000,alive:true};
   this.hash={query:(_x,_y,_r,out)=>{out.length=0;
    out.push(...this.tanks,...this.shapes,...this.drones);
    if(this.__novaStaleHashShape)out.push(this.__novaStaleHashShape);}};
   this.hits=[];this.coverHits=0;
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'updateDrones','update','moveTank','addParticles','splashAt',
  'initBulletIntegrity','addRing','addFlash','addImpactDebris',
  'damageShape','damageDrone','weakenBullet','clusterBurst'])
  Game.prototype[name]=function(){};
 Game.prototype.moveTank=coreMove;
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.getTank=id=>id===1?{id:1,cls:'scout',alive:true}:null;
 Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.damageTank=function(t,dmg){this.hits.push(t.id);t.hp-=dmg;};
 Game.prototype.updateBullets=core;
 class Sfx{resume(){}}
 const modules={
  'game/engine':m=>{m.exports={Game}},
  'game/audio':m=>{m.exports={Sfx}},
  'game/ai':m=>{m.exports={updateAI(){}}},
  'game/render':m=>{m.exports={render(){}}}
 };
 const ctx={window:{__novaModules:modules},
  console:{info(){},warn(){},error(){}},Math,Map,Set,Date,
  performance:{now:()=>0}};
 vm.runInNewContext(read('nova-updates/battlefield-v1.6.0.js'),ctx);
 if(optimized)vm.runInNewContext(read('nova-updates/performance-v1.7.5.js'),ctx);
 const m={exports:{}};
 modules['game/engine'](m,m.exports,spec=>spec==='./classes'
  ?{CLASSES}:{ARENA_HALF:2250});
 return m.exports.Game;
}
function run(Game,{fps=30,speed=6000,vy=0,wall=120,wallY=0,target=60,targetY=0,laterWallY=0,
 wallShape='rect',otherShape=false,otherBullet=false,otherShell=false,moving=false,
 remoteBullets=0,remoteShapes=0,laterCoverHp=null,realIntegrity=false,preinitialized=false,
 shield=false,otherTank=false,ttl=1,pen=1,radius=3,laterWall=null,
 active=true,knock=0,allied=false,destructible=false,damage=10,
 linearMove=null,tamperMove=false,doubleMove=false,
 otherNearMovingStart=false,bornThisFrame=false,coverHp=1000,
 shellInterception=false,secondShell=false,shellShape=null,
 shellStaleHashShape=false}={}){
 const g=new Game(),dt=1/fps;
 g.__novaBattlefield={coverBroken:0};
 if(shellStaleHashShape)g.__novaStaleHashShape={
  kind:'shape',id:888,type:'square',x:0,y:990,r:20,hp:0};
 g.__novaShapeSweepActive=active;
 g.areAllies=()=>allied;
 const t={kind:'tank',id:2,cls:'scout',x:target,y:targetY,hp:100,
  alive:true,__novaSweepMoveTime:1,__novaSweepPrevX:moving?target-4:target,
  __novaSweepPrevY:targetY,spawnShieldT:shield?2:0};
 g.tanks=[t];
 if(otherTank)g.tanks.push({kind:'tank',id:3,cls:'scout',x:30,y:0,
  hp:100,alive:true,__novaSweepMoveTime:1,__novaSweepPrevX:30,__novaSweepPrevY:0});
 if(otherShape)g.shapes.push({kind:'shape',id:4,x:30,y:0,r:8,hp:100});
 const remoteDefs={circle:{r:12,hp:14},triangle:{r:16,hp:30},
  square:{r:20,hp:55},pentagon:{r:26,hp:100},hexagon:{r:33,hp:190}};
 for(let i=0;i<remoteShapes;i++){
  const type=i<62?'circle':i<92?'triangle':i<108?'square':
   i<116?'pentagon':'hexagon',def=remoteDefs[type];
  const x=-900+(i%20)*4,y=-900+Math.floor(i/20)*4;
  g.shapes.push({kind:'shape',id:2000+i,type,x,y,r:def.r,hp:def.hp,
   __novaShapeSweepEpoch:g.__novaShapeSweepEpoch,
   __novaShapeSweepPrevX:x,__novaShapeSweepPrevY:y});
 }
 if(shellShape){
  const y=shellShape==='near'||shellShape==='dead-near'?950:750;
  g.shapes.push({kind:'shape',id:99,type:'square',x:0,y,r:20,
   hp:shellShape==='dead-near'?0:55,
   __novaShapeSweepEpoch:g.__novaShapeSweepEpoch,
   __novaShapeSweepPrevX:0,
   __novaShapeSweepPrevY:shellShape==='teleport'?0:y});
 }
 g.__novaTerrain=[wallShape==='rect'
  ?{id:-1,shape:'rect',x:wall,y:wallY,w:10,h:80,solid:true,destructible,hp:destructible?coverHp:0,maxHp:destructible?coverHp:0}
   :{id:-1,shape:'circle',x:wall,y:wallY,r:5,solid:true,destructible,hp:destructible?coverHp:0,maxHp:destructible?coverHp:0}];
 if(laterWall!=null)g.__novaTerrain.push({id:-2,shape:'rect',x:laterWall,y:laterWallY,w:10,h:80,solid:true,destructible:laterCoverHp!=null,hp:laterCoverHp||0,maxHp:laterCoverHp||0});
 g.bullets=[{kind:'bullet',id:10,ownerId:1,x:0,y:0,
  vx:speed,vy,r:radius,dmg:damage,knock,ttl,pen,hits:0,dead:false,shell:false,beam:false}];
 if(realIntegrity){g.initBulletIntegrity=realInitIntegrity;g.weakenBullet=realWeakenBullet;}
 if(preinitialized)g.initBulletIntegrity(g.bullets[0]);
 if(otherBullet)g.bullets.push({kind:'bullet',id:11,ownerId:4,
  x:0,y:1,vx:speed,vy:0,r:3,dmg:10,ttl:1,pen:0,hits:0,dead:false});
 if(otherShell){
  const cfg=otherShell===true?{}:otherShell;
  g.bullets.push({kind:'bullet',id:12,ownerId:4,
   x:cfg.x??0,y:cfg.y??1000,vx:cfg.vx??0,vy:cfg.vy??0,
   r:9,dmg:10,ttl:cfg.ttl??1,pen:1,hits:0,dead:false,
   shell:true,splash:cfg.splash??100,
   __v17Cannon:cfg.cannon||false,__v17FuseDist:cfg.fuse||0,
   __v17SpawnX:cfg.spawnX,__v17SpawnY:cfg.spawnY});
 }
 if(shellInterception)g.bullets.push({kind:'bullet',id:13,ownerId:8,
  x:0,y:1000,vx:0,vy:0,r:3,dmg:10,ttl:1,pen:0,hits:0,dead:false});
 if(secondShell)g.bullets.push({kind:'bullet',id:14,ownerId:9,
  x:-1400,y:-1400,vx:400,vy:0,r:9,dmg:10,ttl:1,pen:1,
  hits:0,dead:false,shell:true,splash:100});
 /* Separate remote lanes by more than the native projectile-pair radius.
  * They are independent fire, not an artificial pile of overlapping shots. */
 for(let i=0;i<remoteBullets;i++)g.bullets.push({kind:'bullet',id:100+i,
  ownerId:100+i,x:-1900+(i%20)*190,y:900+Math.floor(i/20)*100,
  vx:speed,vy:0,r:3,dmg:10,
  ttl:1,pen:1,hits:0,dead:false});
 /* Simulate the shipping update wrapper's pre-movement nextId snapshot.
  * A newly fired bullet cannot retroactively collide during that motion. */
 g.__novaFrameStartBulletEpoch=g.__novaShapeSweepEpoch;
 g.__novaFrameStartBulletIdCeiling=bornThisFrame?10:11;
 if(otherNearMovingStart)g.bullets.push({kind:'bullet',id:1001,
  ownerId:4,x:target+5,y:16,vx:0,vy:0,r:3,dmg:10,ttl:1,
  pen:0,hits:0,dead:false,shell:false,beam:false});
 if(linearMove){
  t.vx=linearMove.vx;t.vy=linearMove.vy;
  g.moveTank(t,linearMove.vx,linearMove.vy,dt);
  if(doubleMove)g.moveTank(t,linearMove.vx,linearMove.vy,dt);
  if(tamperMove)t.x+=4;
 }
 const shot=g.bullets[0];
 g.updateBullets(dt);
 return {hits:g.hits,hp:t.hp,bullet:g.bullets[0],shot,g};
}
for(const optimized of [false,true]){
 const label=optimized?'Battlefield + Performance':'Battlefield';
 test(label+': stationary scout BEFORE a later permanent wall is hit',()=>{
  const r=run(boot(optimized));
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
  assert.equal(r.g.bullets.length,0,'later wall must still stop the round');
 });
 test(label+': circular pillar behind a body cannot veto earlier contact',()=>{
  const r=run(boot(optimized),{wallShape:'circle'});
  assert.deepEqual(r.hits,[2]);
 });
 test(label+': wall BEFORE target still blocks the bullet',()=>{
  const r=run(boot(optimized),{wall:25,target:90});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': body BEHIND wall remains protected',()=>{
  const r=run(boot(optimized),{wall:50,target:120});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': no early speculative hit with moving target',()=>{
  const r=run(boot(optimized),{moving:true});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': shielded tank retains ordinary cover protection',()=>{
  const r=run(boot(optimized),{shield:true});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': earlier neutral body vetoes speculative tank contact',()=>{
  const r=run(boot(optimized),{otherShape:true});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': earlier tank vetoes later target shortcut',()=>{
  const r=run(boot(optimized),{otherTank:true});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': competing projectile vetoes speculative hit',()=>{
  const r=run(boot(optimized),{otherBullet:true});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': remote unspent shell cannot suppress earlier hull contact',()=>{
  const r=run(boot(optimized),{otherShell:true});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
 });
 for(const fps of [30,60,120,240]){
  test(label+': remote shell preserves real Marksman front hit at '+fps+'Hz',()=>{
   const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
   const r=run(boot(optimized),{fps,speed,wall:55,target:29,
    pen:2,radius,damage:21,otherShell:true});
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,79);
  });
  test(label+': nearby shell still vetoes unproven ordering at '+fps+'Hz',()=>{
   const r=run(boot(optimized),{fps,speed:200*fps,
    otherShell:{y:30}});
   assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
  });
 }
 test(label+': real Cannon fuse far ahead remains independent',()=>{
  const r=run(boot(optimized),{otherShell:{cannon:true,fuse:350,
   spawnX:0,spawnY:1000,vx:420}});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
 });
 test(label+': Cannon fuse reached this frame still vetoes',()=>{
  const r=run(boot(optimized),{otherShell:{cannon:true,fuse:10,
   spawnX:0,spawnY:1000,vx:420}});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': Cannon missing launch witness fails closed',()=>{
  const r=run(boot(optimized),{otherShell:{cannon:true,fuse:350,vx:420}});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': ordinary moving remote shell remains independent',()=>{
  const r=run(boot(optimized),{otherShell:{vx:420,vy:0}});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
 });
 test(label+': two separated unspent shells remain independent',()=>{
  const r=run(boot(optimized),{otherShell:true,secondShell:true});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
 });
 test(label+': distant witnessed neutral does not disable remote-shell proof',()=>{
  const r=run(boot(optimized),{otherShell:true,shellShape:'far'});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
 });
 test(label+': neutral near shell retains explosion veto',()=>{
  const r=run(boot(optimized),{otherShell:true,shellShape:'near'});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': stale hash-only shape still vetoes possible shell burst',()=>{
  const r=run(boot(optimized),{otherShell:true,shellStaleHashShape:true});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': pending-dead neutral cannot be ignored by shell proof',()=>{
  const r=run(boot(optimized),{otherShell:true,shellShape:'dead-near'});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': teleported neutral cannot certify a shell-free frame',()=>{
  const r=run(boot(optimized),{otherShell:true,shellShape:'teleport'});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': shell threatened by another projectile fails closed',()=>{
  const r=run(boot(optimized),{otherShell:true,shellInterception:true});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 for(const cfg of [{ttl:.001},{vy:-30000},{cannon:true},{fuse:20},
  {y:350},{x:0,y:0}]){
  test(label+': shell hazard fails closed '+JSON.stringify(cfg),()=>{
   const r=run(boot(optimized),{otherShell:cfg});
   assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
  });
 }
 for(const pen of [3,4])for(const fps of [30,60,120,240]){
  test(label+': remote shell cannot expose rear hull after breach pen'+pen+
   ' at '+fps+'Hz',()=>{
   const r=run(boot(optimized),{fps,speed:200*fps,pen,
    destructible:true,wall:55,laterWall:110,target:165,coverHp:5,
    otherShell:true});
   assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,0);
   assert.equal(r.g.bullets.some(b=>b.id===10),false);
  });
 }
 test(label+': TTL expiry before target is not bypassed',()=>{
  const r=run(boot(optimized),{ttl:.002});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': pen=2 shot hits one hull then stops at the later permanent wall',()=>{
  const r=run(boot(optimized),{pen:2});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
 });
 test(label+': pen=3 and pen=4 retain the same first-contact order',()=>{
  for(const pen of [3,4]){
   const r=run(boot(optimized),{pen});
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
  }
 });
 test(label+': 13-shot remote fire preserves certified hull-before-cover chronology',()=>{
  const r=run(boot(optimized),{remoteBullets:12});
  assert.deepEqual(r.hits,[2],'remote bullets must not erase earlier hull contact');
  assert.equal(r.hp,90);
 });
 for(const fps of [30,60,120,240])for(const remoteBullets of [12,60,120,220]){
  test(label+': '+remoteBullets+' remote rounds preserve first hull at '+fps+'Hz',()=>{
   const r=run(boot(optimized),{fps,speed:200*fps,remoteBullets});
   assert.deepEqual(r.hits,[2],'unrelated projectiles cannot change contact order');
   assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].solid,true,
    'later permanent wall still stops the shot');
  });
 }
 test(label+': canonical upgraded Marksman hits before cover with 120 remote shots',()=>{
  const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
  const r=run(boot(optimized),{fps:30,speed,wall:55,target:29,
   pen:2,radius,damage:21,remoteBullets:120,destructible:true});
  assert.deepEqual(r.hits,[2]);
  assert.equal(r.hp,79);
  assert.equal(r.g.__novaTerrain[0].hp,979,
   'cover still receives its later canonical structural damage');
 });
 test(label+': nearby competing projectile still vetoes proof amid remote fire',()=>{
  const r=run(boot(optimized),{remoteBullets:24,otherBullet:true});
  assert.deepEqual(r.hits,[],'local projectile interception remains ambiguous');
 });
 test(label+': remote unspent shell cannot suppress proof amid distant fire',()=>{
  const r=run(boot(optimized),{remoteBullets:24,otherShell:true});
  assert.deepEqual(r.hits,[2],'independent shell and shots cannot change first contact');
  assert.equal(r.hp,90);
 });
 test(label+': earlier neutral still vetoes proof amid remote fire',()=>{
  const r=run(boot(optimized),{remoteBullets:24,otherShape:true});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': wall before hull remains protective amid remote fire',()=>{
  const r=run(boot(optimized),{remoteBullets:24,wall:25,target:90});
  assert.deepEqual(r.hits,[]);
  assert.equal(r.hp,100);
 });
 test(label+': 600-check proof budget still fails closed',()=>{
  const r=run(boot(optimized),{remoteBullets:600});
  assert.deepEqual(r.hits,[],'over-budget proof must use legacy path');
 });
 test(label+': no live movement epoch never authorizes early damage',()=>{
  assert.deepEqual(run(boot(optimized),{active:false}).hits,[]);
 });
 test(label+': knockback effects remain on canonical path',()=>{
  assert.deepEqual(run(boot(optimized),{knock:30}).hits,[]);
 });
 test(label+': allied tank cannot be damaged by the shortcut',()=>{
  assert.deepEqual(run(boot(optimized),{allied:true}).hits,[]);
 });
 test(label+': pen1 hull contact precedes damage to later destructible cover',()=>{
  const r=run(boot(optimized),{destructible:true});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
  assert.equal(r.g.__novaTerrain[0].hp,990);
 });
 test(label+': pen=5 remains outside this bounded proof',()=>{
  const r=run(boot(optimized),{pen:5});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': realistic 30Hz Marksman speed can reach a hull before cover',()=>{
  const speed=1050*(1+.085*8);
  const radius=5.5*(1+21*.0085); // canonical Marksman base + damage-size scaling
  const r=run(boot(optimized),{speed,wall:55,target:29,
   pen:2,radius,damage:21});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,79);
 });
}


/* Independent first-surface geometry oracle. This intentionally includes
 * very high speeds at 120/240Hz to stress ordering, not to estimate normal
 * player encounter frequency. The actual materialized core and both shipping
 * overlay compositions execute for every seeded world. */
test('2,000 seeded wall-crossing worlds obey first physical hull/cover order',()=>{
 let seed=0x147437;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const variants=[boot(false),boot(true)];
 let before=0,behind=0;
 for(const fps of [30,60,120,240])for(let i=0;i<500;i++){
  const wall=65+rand()*150,front=rand()<.75,
   target=front?25+rand()*(wall-55):wall+35+rand()*60,
   speed=(wall+10+rand()*80)*fps,pen=1+Math.floor(rand()*4);
  for(const Game of variants){
   const r=run(Game,{fps,wall,target,speed,pen});
   assert.deepEqual(r.hits,front?[2]:[],
    'wrong first-contact result at '+fps+'Hz world '+i);
   assert.equal(r.hp,front?90:100);
   assert.equal(r.g.bullets.length,0,
    'wall must consume shot at '+fps+'Hz world '+i);
  }
  if(front)before++;else behind++;
 }
 assert.ok(before>1000&&behind>300,'both chronological orders exercised');
});


/* Independent 2D segment/circle projection oracle: unlike the shipping
 * quadratic, this computes closest approach and entry by perpendicular
 * distance. The rectangular wall's first x-slab is known analytically.
 * This stresses oblique shots and near-grazes at four frame rates. */
test('1,000 oblique 2D worlds preserve body-before-wall ordering',()=>{
 let seed=0x2d147437;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const variants=[boot(false),boot(true)];
 let hits=0,misses=0;
 for(const fps of [30,60,120,240])for(let i=0;i<250;i++){
  const dx=180+rand()*40,dy=(rand()-.5)*55,
   target=30+rand()*60,targetY=dy*target/dx+(rand()-.5)*65,
   A=dx*dx+dy*dy,projection=(target*dx+targetY*dy)/A,
   perpX=target-projection*dx,perpY=targetY-projection*dy,
   perp2=perpX*perpX+perpY*perpY,rr=20,
   entry=perp2<rr*rr
    ?projection-Math.sqrt(rr*rr-perp2)/Math.sqrt(A):Infinity,
   wallEntry=(120-5-3*.45)/dx,
   expected=entry>1e-9&&entry<wallEntry-1e-6;
  for(const Game of variants){
   const r=run(Game,{fps,speed:dx*fps,vy:dy*fps,target,targetY,pen:2});
   assert.deepEqual(r.hits,expected?[2]:[],
    '2D first-surface mismatch at '+fps+'Hz case '+i);
   assert.equal(r.hp,expected?90:100);
  }
  if(expected)hits++;else misses++;
 }
 assert.ok(hits>400&&misses>100,'oracle must exercise hits and misses');
});

/* Regression-first: real core moveTank and shipping Battlefield must agree
 * on a single unobstructed Scout motion before the permanent wall. A bare
 * start/end position is not proof of continuous motion. */
for(const optimized of [false,true]){
 const label=optimized?'Battlefield + Performance':'Battlefield';
 test(label+': moving Scout crosses the bullet before a later wall at 30–240 Hz',()=>{
  const Game=boot(optimized);
  for(const fps of [30,60,120,240]){
   const r=run(Game,{fps,speed:200*fps,linearMove:{vx:-600,vy:0}});
   assert.deepEqual(r.hits,[2],'moving pre-cover body at '+fps+' Hz');
   assert.equal(r.hp,90);
   assert.equal(r.g.bullets.length,0,'later wall still stops shot');
  }
 });
 test(label+': realistic 30Hz upgraded Marksman round hits moving Scout before wall',()=>{
  const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
  const r=run(boot(optimized),{fps:30,speed,wall:60,target:32,
   radius,damage:21,pen:2,linearMove:{vx:-200,vy:0}});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,79);
 });
 test(label+': Scout tunneling through a wall is not a certified linear hit',()=>{
  const r=run(boot(optimized),{wall:60,target:85,
   linearMove:{vx:-1800,vy:0}});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': certified moving Scout behind cover remains protected',()=>{
  const r=run(boot(optimized),{wall:50,target:150,
   linearMove:{vx:-600,vy:0}});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': moving Scout outside bullet lane cannot receive phantom hit',()=>{
  const r=run(boot(optimized),{targetY:65,
   linearMove:{vx:-600,vy:0}});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': a competing shot near the moving hull start vetoes backdated damage',()=>{
  const r=run(boot(optimized),{linearMove:{vx:-600,vy:0},
   otherNearMovingStart:true});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': a newly fired shot cannot backdate through earlier Scout motion',()=>{
  const r=run(boot(optimized),{linearMove:{vx:-600,vy:0},
   bornThisFrame:true});
  assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
 });
 test(label+': second movement in the same tick invalidates linear witness',()=>{
  const r=run(boot(optimized),{linearMove:{vx:-600,vy:0},doubleMove:true});
  assert.deepEqual(r.hits,[]);
 });
 test(label+': post-move position mutation invalidates linear witness',()=>{
  const r=run(boot(optimized),{linearMove:{vx:-600,vy:0},tamperMove:true});
  assert.deepEqual(r.hits,[]);
 });
}

/* 1,000 independent 2D moving-hull worlds, each with actual core moveTank,
 * materialized Battlefield and optional Performance. The oracle uses
 * perpendicular closest approach, not the shipping stable quadratic roots.
 * The 200-unit frame travel is synthetic stress, not a player hit-rate sample.
 */
test('1,000 seeded moving Scout worlds match independent first-contact geometry',()=>{
 let seed=0x438147;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const games=[boot(false),boot(true)];
 let hits=0,misses=0;
 for(let i=0;i<1000;i++){
  const fps=[30,60,120,240][i%4],target=45+rand()*30,
   targetY=(rand()-.5)*70,vx=(rand()-.5)*1000,vy=(rand()-.5)*400,
   mx=vx/fps,my=vy/fps,rx=200-mx,ry=-my,
   A=rx*rx+ry*ry,u=(target*rx+targetY*ry)/A,
   perpX=target-u*rx,perpY=targetY-u*ry,
   perp2=perpX*perpX+perpY*perpY,rr=20,
   entry=perp2<rr*rr
    ?u-Math.sqrt((rr*rr-perp2)/A):Infinity,
   wallT=(120-5-3*.45)/200,
   expected=entry>1e-9&&entry<wallT-1e-6;
  for(const Game of games){
   const r=run(Game,{fps,speed:200*fps,target,targetY,
    linearMove:{vx,vy}});
   assert.deepEqual(r.hits,expected?[2]:[],
    'moving-hull contact mismatch at '+fps+'Hz world '+i);
   assert.equal(r.hp,expected?90:100);
  }
  if(expected)hits++;else misses++;
 }
 assert.ok(hits>100&&misses>100,'oracle exercises hits and misses');
});

/* A tank physically before destructible cover must receive a nonpiercing
 * shot before that cover. This is the same first-contact contract already
 * shipped for permanent walls, not permission to pierce intact cover.
 * Test the materialized core with both shipping overlay compositions. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const fps of [30,60,120,240]){
  test(label+': nonpiercing shot hits certified hull BEFORE destructible cover at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen:0,destructible:true});
   assert.deepEqual(r.hits,[2]);
   assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,1000,
    'later cover must not be damaged by an already consumed shot');
   assert.equal(r.g.bullets.length,0);
  });
  test(label+': destructible cover BEFORE hull retains interception at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen:0,destructible:true,
    wall:40,target:140});
   assert.deepEqual(r.hits,[]);
   assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,990);
  });
  test(label+': shielded hull does not bypass later destructible cover at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen:0,destructible:true,shield:true});
   assert.deepEqual(r.hits,[]);
   assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,990);
  });
  test(label+': earlier neutral body vetoes speculative cover-front hit at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen:0,destructible:true,otherShape:true});
   assert.deepEqual(r.hits,[]);
   assert.equal(r.hp,100);
  });
 }
}

/* Adversarial neighbors: first-surface certification must not depend on
 * rectangular geometry, falsely infer teleport motion, or grant a shot
 * permission to cross cover when it still has piercing capacity. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const fps of [30,60,120,240]){
  test(label+': nonpiercing hull before circular destructible cover at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen:0,destructible:true,wallShape:'circle'});
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,1000);
  });
  test(label+': certified moving Scout before destructible cover at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen:0,destructible:true,
    linearMove:{vx:-600,vy:0}});
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,1000);
  });
  test(label+': teleport-like movement remains unproven before cover at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen:0,destructible:true,
    linearMove:{vx:-600,vy:0},tamperMove:true});
   assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
  });
  test(label+': pen3 with competing shell still abstains at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen:3,destructible:true,otherShell:{y:30}});
   assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,990);
  });
 }
}

/* Independent 1D first-surface oracle: a nonpiercing shot cannot damage
 * later cover if the healthy hull was first, nor hit a hull behind cover.
 * Distances keep both orders well away from tangencies and wall overlap.
 * Synthetic fast rounds test correctness, not ordinary player hit rates. */
test('1,000 seeded nonpiercing hull/destructible-cover orders at 30–240 Hz',()=>{
 let seed=0x490147;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const games=[boot(false),boot(true)];
 let frontCount=0,behindCount=0;
 for(const fps of [30,60,120,240])for(let i=0;i<250;i++){
  const wall=80+rand()*140,front=rand()<.55,
   target=front?25+rand()*(wall-65):wall+45+rand()*60,
   wallShape=rand()<.5?'rect':'circle',speed=(wall+170)*fps;
  for(const Game of games){
   const r=run(Game,{fps,wall,target,speed,wallShape,pen:0,destructible:true});
   assert.deepEqual(r.hits,front?[2]:[],
    'wrong first surface at '+fps+'Hz world '+i);
   assert.equal(r.hp,front?90:100);
   assert.equal(r.g.__novaTerrain[0].hp,front?1000:990,
    'wrong cover damage at '+fps+'Hz world '+i);
   assert.equal(r.g.bullets.length,0);
  }
  if(front)frontCount++;else behindCount++;
 }
 assert.ok(frontCount>400&&behindCount>300,'both orders exercised');
});

/* Reachable build, not just synthetic hypervelocity: canonical Marksman
 * begins with pen=2, base speed 1050 and damage 21. Its eight-speed-upgrade
 * 30Hz corridor can hit a Scout before a destructible barricade. */
for(const optimized of [false,true]){
 test((optimized?'Battlefield + Performance':'Battlefield')+
  ': upgraded Marksman pen2 hit precedes later destructible cover at 30Hz',()=>{
  const speed=1050*(1+.085*8);
  const radius=5.5*(1+21*.0085);
  const r=run(boot(optimized),{fps:30,speed,wall:55,target:29,
   pen:2,radius,damage:21,destructible:true});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,79);
  assert.equal(r.g.__novaTerrain[0].hp,979);
 });
}

/* Oblique first-contact oracle uses independent projection/perpendicular
 * distance rather than Battlefield's quadratic roots. The 80u-tall
 * barricade is always intersected by these shallow projectile angles. */
test('1,000 oblique 2D nonpiercing shots respect destructible first surface',()=>{
 let seed=0x2d490147;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const games=[boot(false),boot(true)];
 let hits=0,misses=0;
 for(const fps of [30,60,120,240])for(let i=0;i<250;i++){
  const dx=180+rand()*40,dy=(rand()-.5)*55,
   target=30+rand()*60,targetY=dy*target/dx+(rand()-.5)*65,
   A=dx*dx+dy*dy,projection=(target*dx+targetY*dy)/A,
   perpX=target-projection*dx,perpY=targetY-projection*dy,
   perp2=perpX*perpX+perpY*perpY,rr=20,
   entry=perp2<rr*rr
    ?projection-Math.sqrt(rr*rr-perp2)/Math.sqrt(A):Infinity,
   wallEntry=(120-5-3*.45)/dx,
   expected=entry>1e-9&&entry<wallEntry-1e-6;
  for(const Game of games){
   const r=run(Game,{fps,speed:dx*fps,vy:dy*fps,target,targetY,
    pen:0,destructible:true});
   assert.deepEqual(r.hits,expected?[2]:[],
    'oblique first-surface mismatch at '+fps+'Hz world '+i);
   assert.equal(r.hp,expected?90:100);
   assert.equal(r.g.__novaTerrain[0].hp,expected?1000:990);
  }
  if(expected)hits++;else misses++;
 }
 assert.ok(hits>400&&misses>100,'oracle must exercise both outcomes');
});

/* Penetration 1/2 may resolve a hull and later cover, but cannot continue
 * beyond that cover in the same frame, even if the barricade is destroyed. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const fps of [30,60,120,240])for(const pen of [1,2]){
  test(label+': pen'+pen+' hull then destructible cover at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true});
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,990);
   assert.equal(r.g.bullets.length,0);
  });
  test(label+': pen'+pen+' hull then breached cover cannot continue at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,coverHp:5});
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,0);
   assert.equal(r.g.bullets.length,0);
  });
 }
}

/* A penetrating round can legitimately strike a hull before a later intact
 * barricade even when pen=3/4. Only the non-breaching case is certified:
 * if the later cover could break, leave that event chain to the original
 * owner until a full chronological breach solver exists. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const fps of [30,60,120,240])for(const pen of [3,4]){
  test(label+': pen'+pen+' first hull then intact cover at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,coverHp:1000});
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,990);
   assert.equal(r.g.bullets.length,0);
  });
  test(label+': pen'+pen+' cover first still protects hull at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
    wall:40,target:140,coverHp:1000});
   assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,990);
  });
  test(label+': pen'+pen+' shielded hull cannot claim first hit at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
    shield:true,coverHp:1000});
   assert.deepEqual(r.hits,[]);assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,990);
  });
 }
}

/* A barely surviving barricade is still non-breaching; a barricade that
 * would break must remain on the old path. A competing shell makes the
 * latter abstention observable without relying on speculative breach order. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const pen of [3,4]){
  test(label+': pen'+pen+' near-threshold intact cover still follows hull at 30Hz',()=>{
   const r=run(Game,{fps:30,speed:6000,pen,destructible:true,coverHp:10.1});
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
   assert.ok(Math.abs(r.g.__novaTerrain[0].hp-.1)<1e-8);
   assert.equal(r.g.__novaTerrain[0].solid,true);
  });
  test(label+': pen'+pen+' breakable cover keeps canonical breach path with competing shell',()=>{
   const r=run(Game,{fps:30,speed:6000,pen,destructible:true,
    coverHp:5,otherShell:true});
   /* Canonical pre-pass breaches first, then the core resolves the hull.
    * This is NOT a certified hull-before-cover event. Preserve the existing
    * one-hit behavior while the full breach chronology remains unresolved. */
   assert.deepEqual(r.hits,[2]);assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,0);
  });
 }
}

/* Reachable upgraded Marksman geometry: base speed 1050, eight bullet-speed
 * upgrades, base damage 21 and canonical size scaling. Pen3/4 can be reached
 * via penetration upgrades; the shot still reaches this hull before cover. */
for(const optimized of [false,true])for(const pen of [3,4]){
 test((optimized?'Battlefield + Performance':'Battlefield')+
  ': upgraded Marksman pen'+pen+' hull precedes intact barricade at 30Hz',()=>{
  const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
  const r=run(boot(optimized),{fps:30,speed,wall:55,target:29,
   pen,radius,damage:21,destructible:true,coverHp:1000});
  assert.deepEqual(r.hits,[2]);assert.equal(r.hp,79);
  assert.equal(r.g.__novaTerrain[0].hp,979);
  assert.equal(r.g.bullets.length,0);
 });
}

/* Regression-first: a breached barricade must not let a high-penetration
 * round hit a tank behind a SECOND, permanent wall in the same frame.
 * These are real shipping core + Battlefield/Performance compositions. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const fps of [30,60,120,240])for(const pen of [3,4]){
  test(label+': pen'+pen+' breached cover then permanent wall protects rear hull at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
    wall:55,laterWall:110,target:165,coverHp:5});
   assert.deepEqual(r.hits,[],'a permanent wall must protect the rear hull');
   assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,0,'earlier barricade must still breach');
   assert.equal(r.g.__novaTerrain[1].solid,true);
  });
  test(label+': pen'+pen+' pre-breach front hull is not erased at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
    wall:75,laterWall:140,target:30,coverHp:5});
   assert.deepEqual(r.hits,[2],'legitimate front hull must not be erased');
   assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,0);
  });
 }
}

/* Adversarial neighbors: a body between the breached cover and the
 * permanent wall must remain hittable; distant bullets must not defeat
 * the isolated local wall proof merely by increasing global shot count. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const fps of [30,60,120,240])for(const pen of [3,4]){
  test(label+': pen'+pen+' middle hull after breach remains hittable at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
    wall:55,laterWall:145,target:95,coverHp:5});
   assert.deepEqual(r.hits,[2]);
   assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,0);
  });
  test(label+': pen'+pen+' remote fire does not expose rear hull at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
    wall:55,laterWall:110,target:165,coverHp:5,remoteBullets:4});
   assert.deepEqual(r.hits,[]);
   assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,0);
  });
 }
}

/* A breached barricade must not turn an unrelated crowded firefight
 * into permission to shoot through a later permanent wall or an intact
 * second barricade. This executes the materialized core and Battlefield's
 * actual structural-damage/penetration owners at four frame rates. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const fps of [30,60,120,240])for(const pen of [3,4]){
  for(const remoteBullets of [12,60,120,220])for(const laterCoverHp of [null,1000]){
   test(label+': pen'+pen+' breach respects second '+(laterCoverHp?'cover':'wall')+
    ' with '+remoteBullets+' remote shots at '+fps+'Hz',()=>{
    const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
     wall:55,laterWall:110,laterCoverHp,target:165,coverHp:5,remoteBullets});
    assert.deepEqual(r.hits,[],'later solid must protect rear hull');
    assert.equal(r.hp,100);
    assert.equal(r.g.__novaTerrain[0].hp,0,'first cover still breaches');
    assert.equal(r.g.__novaTerrain[1].hp,laterCoverHp?990:0,
     'second solid must receive its canonical response');
    assert.equal(r.g.bullets.some(b=>b.id===10),false,
     'the piercing projectile must stop at the second solid');
   });
  }
 }
 for(const pen of [3,4]){
  test(label+': real upgraded Marksman pen'+pen+
   ' cannot tunnel through second wall amid 120 remote shots at 30Hz',()=>{
   const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
   const r=run(Game,{fps:30,speed,pen,radius,damage:21,
    destructible:true,wall:17,laterWall:35,target:60,coverHp:5,
    remoteBullets:120});
   assert.deepEqual(r.hits,[]);
   assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,0);
   assert.equal(r.g.bullets.some(b=>b.id===10),false);
  });
  test(label+': real upgraded Marksman pen'+pen+
   ' damages second intact cover amid 120 remote shots at 30Hz',()=>{
   const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
   const r=run(Game,{fps:30,speed,pen,radius,damage:21,
    destructible:true,wall:17,laterWall:35,laterCoverHp:1000,
    target:60,coverHp:5,remoteBullets:120});
   assert.deepEqual(r.hits,[]);
   assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,0);
   assert.equal(r.g.__novaTerrain[1].hp,979);
  });
 }
}

/* The real neutral population contains 120 shapes. A crowded-fire
 * improvement must remain reachable with that population present, not
 * only in an empty synthetic arena. 120 shapes + one Scout + 121 shots
 * stays within the existing 260-entity safety budget. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 test(label+': canonical 120-shape ecology preserves hull-before-cover with 120 remote shots',()=>{
  const r=run(Game,{fps:30,speed:6000,remoteShapes:120,remoteBullets:120});
  assert.deepEqual(r.hits,[2]);
  assert.equal(r.hp,90);
 });
 for(const laterCoverHp of [null,1000]){
  test(label+': canonical 120-shape ecology preserves second '+
   (laterCoverHp?'barricade':'wall')+' amid 120 remote shots',()=>{
   const r=run(Game,{fps:30,speed:6000,pen:3,destructible:true,
    wall:55,laterWall:110,target:165,coverHp:5,laterCoverHp,
    remoteShapes:120,remoteBullets:120});
   assert.deepEqual(r.hits,[]);
   assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,0);
   assert.equal(r.g.__novaTerrain[1].hp,laterCoverHp?990:0);
  });
 }
}

/* Regression: canonical 120 neutral shapes plus 220 remote projectiles
 * exceeds the former 260-global-entity cap, but the actual proof has only
 * 342 scans. No distant shot may erase the earlier hull contact or let a
 * penetrating Marksman tunnel through a second permanent wall. The 30Hz
 * case uses real upgraded Marksman velocity; 60–240Hz cases scale velocity
 * to retain two contacts within one frame as geometric stress fixtures.
 * The local competitor and over-budget cases still fail closed. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
 for(const fps of [30,60,120,240]){
  test(label+': dense hull-before-cover (real Marksman at 30Hz) with 120 shapes and 220 remote shots at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:fps===30?speed:60*fps,
    wall:55,target:29,pen:2,radius,damage:21,destructible:true,
    remoteShapes:120,remoteBullets:220});
   assert.deepEqual(r.hits,[2]);
   assert.equal(r.hp,79);
   assert.equal(r.g.__novaTerrain[0].hp,979);
  });
  test(label+': dense breach then permanent wall (real Marksman at 30Hz) with 120 shapes and 220 remote shots at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:fps===30?speed:60*fps,
    wall:17,laterWall:35,target:60,pen:3,radius,damage:21,
    destructible:true,coverHp:5,remoteShapes:120,remoteBullets:220});
   assert.deepEqual(r.hits,[]);
   assert.equal(r.hp,100,'second wall must protect the rear hull');
   assert.equal(r.g.__novaTerrain[0].hp,0);
   assert.equal(r.g.bullets.some(b=>b.id===10),false);
  });
 }
 test(label+': nearby projectile still vetoes dense earlier-hull proof',()=>{
  const r=run(Game,{remoteShapes:120,remoteBullets:220,otherBullet:true});
  assert.deepEqual(r.hits,[]);
  assert.equal(r.hp,100);
 });
 test(label+': over-600 work with real ecology still fails closed',()=>{
  const r=run(Game,{remoteShapes:120,remoteBullets:480});
  assert.deepEqual(r.hits,[]);
  assert.equal(r.hp,100);
 });
}

/* Reachable 30Hz Marksman geometry, not a 6,000u/s synthetic bullet.
 * Base 1050 speed × eight 8.5% speed upgrades travels 58.8u/frame.
 * Cover face ~9, wall face ~27, rear Scout hull entry ~36.5.
 * The rear hull is near the wall, so a padded-AABB-only veto would
 * incorrectly abandon this real-build corridor. */
for(const optimized of [false,true])for(const pen of [3,4]){
 test((optimized?'Battlefield + Performance':'Battlefield')+
  ': upgraded Marksman pen'+pen+' breaches then stops at nearby wall at 30Hz',()=>{
  const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
  const r=run(boot(optimized),{fps:30,speed,pen,radius,damage:21,
   destructible:true,wall:17,laterWall:35,target:60,coverHp:5});
  assert.deepEqual(r.hits,[],'rear Scout cannot be hit through permanent cover');
  assert.equal(r.hp,100);
  assert.equal(r.g.__novaTerrain[0].hp,0);
  assert.equal(r.g.__novaTerrain[1].solid,true);
 });
}

/* Run 442 regression-first: a second, intact barricade is still physical
 * cover after a high-penetration shot breaches the first barricade. The
 * original core would otherwise advance directly to the rear hull. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 for(const fps of [30,60,120,240])for(const pen of [3,4]){
  test(label+': pen'+pen+' breach then intact second cover absorbs at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
    wall:55,laterWall:110,laterCoverHp:1000,target:165,coverHp:5});
   assert.deepEqual(r.hits,[],'intact second barricade protects rear Scout');
   assert.equal(r.hp,100);
   assert.equal(r.g.__novaTerrain[0].hp,0,'first barricade breaks once');
   assert.equal(r.g.__novaTerrain[1].hp,990,'second barricade takes one hit');
   assert.equal(r.g.__novaTerrain[1].solid,true);
   assert.equal(r.g.bullets.length,0,'second barricade consumes shot');
  });
  test(label+': pen'+pen+' earlier middle hull is not erased by second cover at '+fps+'Hz',()=>{
   const r=run(Game,{fps,speed:200*fps,pen,destructible:true,
    wall:55,laterWall:145,laterCoverHp:1000,target:95,coverHp:5});
   assert.deepEqual(r.hits,[2]);
   assert.equal(r.hp,90);
   assert.equal(r.g.__novaTerrain[0].hp,0);
  });
 }
}
for(const optimized of [false,true])for(const pen of [3,4]){
 test((optimized?'Battlefield + Performance':'Battlefield')+
  ': reachable Marksman pen'+pen+' damages second intact barricade, not rear hull',()=>{
  const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
  const r=run(boot(optimized),{fps:30,speed,pen,radius,damage:21,
   destructible:true,wall:17,laterWall:35,laterCoverHp:1000,
   target:60,coverHp:5});
  assert.deepEqual(r.hits,[]);
  assert.equal(r.hp,100);
  assert.equal(r.g.__novaTerrain[0].hp,0);
  assert.equal(r.g.__novaTerrain[1].hp,979);
 });
}

/* The real materialized core defines bullet integrity at original penetration.
 * A first-frame breach must not silently lower interception HP by calling
 * initBulletIntegrity after consuming two penetration points. */
for(const optimized of [false,true])for(const fps of [30,60,120,240])
 for(const pen of [3,4]){
 test((optimized?'Battlefield + Performance':'Battlefield')+
  ': first breach preserves launch integrity pen'+pen+' at '+fps+'Hz',()=>{
  const r=run(boot(optimized),{fps,speed:200*fps,pen,destructible:true,
   wall:55,laterWall:110,laterCoverHp:1000,target:165,coverHp:5,
   realIntegrity:true});
  const expectedMax=10*(.72+3*.08)*(1+pen*.055);
  assert.ok(Math.abs(r.shot.maxHp-expectedMax)<1e-9,
   'first-frame breach must initialize integrity at original penetration');
  assert.equal(r.shot.baseDmg,10);
  assert.ok(r.shot.dmg>0&&r.shot.dmg<10,'breach weakens damage');
  assert.ok(Math.abs(r.g.__novaTerrain[1].hp-(1000-r.shot.dmg))<1e-9,
   'second barricade receives exactly the weakened damage');
  assert.deepEqual(r.hits,[]);
  assert.equal(r.g.__novaTerrain[0].hp,0);
  assert.equal(r.g.__novaTerrain[1].solid,true);
 });
}

/* Reachable first-frame gameplay: the bullet was spawned without integrity
 * fields by the real tryFire core. A wounded barricade breaks, and a rear
 * exposed tank is hit with exactly 62% of the launch damage. Pre-initializing
 * the same projectile must produce the same result. */
for(const optimized of [false,true])for(const pen of [3,4]){
 const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
 test(label+': first-frame breach has same damage as preinitialized pen'+pen,()=>{
  const options={fps:30,speed:6000,pen,destructible:true,
   wall:55,target:165,coverHp:5,realIntegrity:true};
  const fresh=run(Game,options),initialized=run(Game,{...options,preinitialized:true});
  for(const r of [fresh,initialized]){
   assert.deepEqual(r.hits,[2]);
   assert.ok(Math.abs(r.hp-(100-6.2))<1e-9,
    'breach weakens the 10-damage projectile to 62%');
   assert.ok(Math.abs(r.shot.dmg-6.2)<1e-9);
   assert.ok(Math.abs(r.shot.hp-r.shot.maxHp*.62)<1e-9);
   assert.equal(r.g.__novaTerrain[0].hp,0);
  }
  assert.equal(fresh.shot.maxHp,initialized.shot.maxHp);
  assert.equal(fresh.shot.dmg,initialized.shot.dmg);
 });
 test(label+': reachable upgraded Marksman pen'+pen+' first-frame breach damage',()=>{
  const speed=1050*(1+.085*8),radius=5.5*(1+21*.0085);
  const r=run(Game,{fps:30,speed,pen,radius,damage:21,
   destructible:true,wall:17,target:50,coverHp:5,realIntegrity:true});
  assert.deepEqual(r.hits,[2]);
  assert.ok(Math.abs(r.hp-(100-21*.62))<1e-9);
  assert.ok(Math.abs(r.shot.dmg-21*.62)<1e-9);
  assert.ok(Math.abs(r.shot.maxHp-
   (21*(.72+radius*.08)*(1+pen*.055)))<1e-9);
 });
}

/* Seeded diagonal two-cover contacts exercise the real shipping collision
 * geometry, not a bespoke segment-rectangle implementation. A damaged first
 * barricade breaks; a healthy second barricade must take exactly one weakened
 * hit and protect a rear hull, independent of Battlefield/Performance order. */
test('600 seeded diagonal two-cover contacts preserve structural order',()=>{
 let seed=0x442147;
 const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const optimized of [false,true]){
  const Game=boot(optimized);
  for(let i=0;i<300;i++){
   const slope=(rnd()-.5)*1.2;
   const wall=30+rnd()*20,laterWall=wall+30+rnd()*35;
   const target=laterWall+45+rnd()*15;
   const pen=i%2?3:4;
   const r=run(Game,{fps:30,speed:6000,vy:6000*slope,
    pen,destructible:true,wall,wallY:wall*slope,
    laterWall,laterWallY:laterWall*slope,laterCoverHp:1000,
    target,targetY:target*slope,coverHp:5,realIntegrity:true});
   assert.deepEqual(r.hits,[],
    'rear hull must be protected: optimized='+optimized+' seed='+i);
   assert.equal(r.g.__novaTerrain[0].hp,0);
   assert.ok(Math.abs(r.g.__novaTerrain[1].hp-993.8)<1e-8,
    'second cover takes 62% damage once: seed='+i);
   assert.equal(r.g.__novaTerrain[1].solid,true);
   assert.equal(r.g.__novaBattlefield.coverBroken,1);
  }
 }
});
