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
const CLASSES={scout:{size:14},marksman:{size:14}};
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
   this.hash={query:(_x,_y,_r,out)=>{out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);}};
   this.hits=[];this.coverHits=0;
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'updateDrones','update','moveTank','addParticles','splashAt',
  'initBulletIntegrity','addRing','addFlash','addImpactDebris',
  'damageShape','damageDrone','weakenBullet','clusterBurst'])
  Game.prototype[name]=function(){};
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
function run(Game,{fps=30,speed=6000,vy=0,wall=120,wallY=0,target=60,targetY=0,
 wallShape='rect',otherShape=false,otherBullet=false,otherShell=false,moving=false,
 remoteBullets=0,
 shield=false,otherTank=false,ttl=1,pen=1,radius=3,
 active=true,knock=0,allied=false,destructible=false,damage=10}={}){
 const g=new Game(),dt=1/fps;
 g.__novaShapeSweepActive=active;
 g.areAllies=()=>allied;
 const t={kind:'tank',id:2,cls:'scout',x:target,y:targetY,hp:100,
  alive:true,__novaSweepMoveTime:1,__novaSweepPrevX:moving?target-4:target,
  __novaSweepPrevY:targetY,spawnShieldT:shield?2:0};
 g.tanks=[t];
 if(otherTank)g.tanks.push({kind:'tank',id:3,cls:'scout',x:30,y:0,
  hp:100,alive:true,__novaSweepMoveTime:1,__novaSweepPrevX:30,__novaSweepPrevY:0});
 if(otherShape)g.shapes.push({kind:'shape',id:4,x:30,y:0,r:8,hp:100});
 g.__novaTerrain=[wallShape==='rect'
  ?{id:-1,shape:'rect',x:wall,y:wallY,w:10,h:80,solid:true,destructible,hp:destructible?1000:0,maxHp:destructible?1000:0}
   :{id:-1,shape:'circle',x:wall,y:wallY,r:5,solid:true,destructible,hp:destructible?1000:0,maxHp:destructible?1000:0}];
 g.bullets=[{kind:'bullet',id:10,ownerId:1,x:0,y:0,
  vx:speed,vy,r:radius,dmg:damage,knock,ttl,pen,hits:0,dead:false,shell:false,beam:false}];
 if(otherBullet)g.bullets.push({kind:'bullet',id:11,ownerId:4,
  x:0,y:1,vx:speed,vy:0,r:3,dmg:10,ttl:1,pen:0,hits:0,dead:false});
 if(otherShell)g.bullets.push({kind:'bullet',id:12,ownerId:4,
  x:0,y:1000,vx:0,vy:0,r:9,dmg:10,ttl:1,pen:1,hits:0,dead:false,
  shell:true,splash:100});
 for(let i=0;i<remoteBullets;i++)g.bullets.push({kind:'bullet',id:100+i,
  ownerId:100+i,x:0,y:1000+i*3,vx:speed,vy:0,r:3,dmg:10,
  ttl:1,pen:1,hits:0,dead:false});
 g.updateBullets(dt);
 return {hits:g.hits,hp:t.hp,bullet:g.bullets[0],g};
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
 test(label+': unrelated live shell still vetoes speculative kill-credit ordering',()=>{
  const r=run(boot(optimized),{otherShell:true});
  assert.deepEqual(r.hits,[]);
 });
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
 test(label+': dense remote fire stays on canonical collision path',()=>{
  const r=run(boot(optimized),{remoteBullets:12});
  assert.deepEqual(r.hits,[],'13-shot frame must not speculate');
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
 test(label+': destructible cover remains with existing breach authority',()=>{
  assert.deepEqual(run(boot(optimized),{destructible:true}).hits,[]);
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
