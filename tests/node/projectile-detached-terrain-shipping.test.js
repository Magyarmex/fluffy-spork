'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {firstDetachedPermanentTerrainEvent:query}=require('../research/projectile-detached-permanent-terrain.cjs');
function boot(){
 class Game{constructor(){this.__novaTerrain=[];this.bullets=[];this.tanks=[];this.drones=[];this.shapes=[];}}
 for(const n of ['spawnPlayer','spawnShape','spawnPowerup','tryFire','updateDrones','update','moveTank','damageTank','damageDrone','damageShape','setClass','addParticles','addRing','addImpactDebris','splashAt','initBulletIntegrity','useAbility','addFlash']) Game.prototype[n]=function(){};
 Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.updateBullets=function(){};
 Game.prototype.clusterBurst=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 class Sfx{resume(){}}
 const modules={'game/engine':m=>{m.exports={Game};},'game/audio':m=>{m.exports={Sfx};},'game/render':m=>{m.exports={render(){}};},'game/ai':m=>{m.exports={updateAI(){}};}};
 const context={window:{__novaModules:modules},console:{info(){},warn(){},error(){}},Math,Map,Set,Date,Number,Object,performance:{now:()=>0},document:{},navigator:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/battlefield-v1.6.0.js'),'utf8'),context,{filename:'battlefield-v1.6.0.js'});
 const m={exports:{}};modules['game/engine'](m,m.exports,spec=>spec.includes('classes')?{CLASSES:{scout:{size:15}},lineageForClass:()=>null}:{ARENA_HALF:2250});
 return new m.exports.Game();
}
const shot=()=>({kind:'bullet',dead:false,shell:false,beam:false,pen:0,hits:0,x:-20,y:0,vx:1000,vy:0,r:3,ttl:.5});
const rect=(y=0)=>({id:-1,shape:'rect',x:0,y,w:4,h:40,solid:true,destructible:false});
test('actual Battlefield permanent wall first contact does not mutate live terrain index',()=>{
 const g=boot();g.__novaTerrain=[rect()];const before=JSON.stringify(g.__novaTerrain);
 const o=query(g,shot(),.04);
 assert.equal(o.complete,true);assert.ok(Math.abs(o.time-.01665)<1e-10);
 assert.equal(JSON.stringify(g.__novaTerrain),before);
 assert.equal(Object.hasOwn(g,'__novaBattlefieldIndex'),false);
});
test('actual Battlefield clear shot is a complete null event',()=>{
 const g=boot();g.__novaTerrain=[rect(100)];
 assert.deepEqual(query(g,shot(),.04),{complete:true,time:null,reason:null});
 assert.equal(Object.hasOwn(g,'__novaBattlefieldIndex'),false);
});
test('actual Battlefield destructible cover must abstain',()=>{
 const g=boot();g.__novaTerrain=[{...rect(),destructible:true,hp:20}];
 assert.equal(query(g,shot(),.04).complete,false);
});

test('actual Battlefield selects earliest permanent obstacle regardless of array order',()=>{
 const a={...rect(),id:-11,x:-10},b={...rect(),id:-12,x:10};
 for(const terrain of [[a,b],[b,a]]){
  const g=boot();g.__novaTerrain=terrain;
  const o=query(g,shot(),.04);
  assert.equal(o.complete,true);
  assert.ok(Math.abs(o.time-.00665)<1e-10);
  assert.equal(Object.hasOwn(g,'__novaBattlefieldIndex'),false);
 }
});
test('actual Battlefield pillar uses circular swept padding',()=>{
 const g=boot();g.__novaTerrain=[{id:-13,shape:'circle',x:0,y:0,r:5,solid:true,destructible:false}];
 const o=query(g,shot(),.04);
 assert.equal(o.complete,true);
 assert.ok(Math.abs(o.time-.01365)<1e-10);
 assert.equal(Object.hasOwn(g,'__novaBattlefieldIndex'),false);
});

test('actual Battlefield inert destroyed cover cannot block detached projectile',()=>{
 const g=boot();g.__novaTerrain=[{...rect(),destructible:true,solid:false,hp:0}];
 const before=JSON.stringify(g.__novaTerrain);
 assert.deepEqual(query(g,shot(),.04),{complete:true,time:null,reason:null});
 assert.equal(JSON.stringify(g.__novaTerrain),before);
 assert.equal(Object.hasOwn(g,'__novaBattlefieldIndex'),false);
});

test('live spatial-hash stamp 1 must not hide a permanent wall in a fresh detached index',()=>{
 const g=boot();g.__novaTerrain=[{...rect(),__novaBattlefieldStamp:1}];
 const before=JSON.stringify(g.__novaTerrain);
 const o=query(g,shot(),.04);
 assert.equal(o.complete,true);
 assert.ok(Math.abs(o.time-.01665)<1e-10);
 assert.equal(JSON.stringify(g.__novaTerrain),before);
});

test('detached first-hit query preserves an existing live Battlefield index and stamp',()=>{
 const g=boot();g.__novaTerrain=[{...rect(),__novaBattlefieldStamp:1}];
 const original={terrain:g.__novaTerrain,length:1,cells:new Map(),scratch:[],stamp:1};
 g.__novaBattlefieldIndex=original;
 const o=query(g,shot(),.04);
 assert.equal(o.complete,true);
 assert.ok(Math.abs(o.time-.01665)<1e-10);
 assert.strictEqual(g.__novaBattlefieldIndex,original);
 assert.equal(original.stamp,1);
 assert.equal(g.__novaTerrain[0].__novaBattlefieldStamp,1);
});

test('detached pillar chronology distinguishes exact-face departure from inward entry',()=>{
 const g=boot();g.__novaTerrain=[{id:-14,shape:'circle',x:0,y:0,r:5,solid:true,destructible:false}];
 const base={...shot(),x:-5,y:0};
 const outward=query(g,{...base,vx:-1000},.04);
 const inward=query(g,{...base,vx:1000},.04);
 const tangent=query(g,{...base,vx:0,vy:1000},.04);
 assert.deepEqual(outward,{complete:true,time:null,reason:null});
 assert.deepEqual(tangent,{complete:true,time:null,reason:null});
 assert.deepEqual(inward,{complete:true,time:0,reason:null});
});
test('detached pillar chronology rejects embedded origins even when heading outward',()=>{
 const g=boot();g.__novaTerrain=[{id:-15,shape:'circle',x:0,y:0,r:5,solid:true,destructible:false}];
 const o=query(g,{...shot(),x:-4.999,y:0,vx:-1000},.04);
 assert.deepEqual(o,{complete:true,time:0,reason:null});
});

test('actual Battlefield wall-blocked early pair leaves later clear projectile contact',()=>{
 const {makePermanentTerrainProvider}=require('../research/projectile-permanent-terrain-provider.cjs');
 const {observeProjectilePairs}=require('../research/projectile-pair-chronology-observer.cjs');
 const g=boot(),dt=.04;
 const bullet=(ownerId,x,vx)=>({kind:'bullet',dead:false,shell:false,beam:false,
   pen:0,hits:0,ttl:.42,r:3,ownerId,x,y:0,vx,vy:0});
 g.__novaResearchHostilityFixture=true;
 g.player=null;g.powerups=[];g.terrain=[];
 g.bullets=[bullet(1,-17.5,1000),bullet(2,0,0),bullet(3,27.5,-1000)];
 g.__novaTerrain=[{...rect(),x:-12,w:2}];
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const result=observeProjectilePairs(g,dt,provider);
 assert.equal(result.incomplete,false);
 assert.equal(result.certified.length,1);
 assert.deepEqual([result.certified[0].i,result.certified[0].j],[1,2]);
 assert.ok(Math.abs(result.certified[0].time-.02)<1e-9);
});

test('wall-qualified first contact is invariant to projectile storage order',()=>{
 const {makePermanentTerrainProvider}=require('../research/projectile-permanent-terrain-provider.cjs');
 const {observeProjectilePairs}=require('../research/projectile-pair-chronology-observer.cjs');
 for(const order of [[0,1,2],[2,1,0],[1,0,2],[2,0,1]]) {
   const g=boot(),dt=.04;
   const bullet=(ownerId,x,vx)=>({kind:'bullet',dead:false,shell:false,beam:false,
     pen:0,hits:0,ttl:.42,r:3,ownerId,x,y:0,vx,vy:0});
   const shots=[bullet(1,-17.5,1000),bullet(2,0,0),bullet(3,27.5,-1000)];
   g.__novaResearchHostilityFixture=true;g.player=null;g.powerups=[];g.terrain=[];
   g.bullets=order.map(i=>shots[i]);g.__novaTerrain=[{...rect(),x:-12,w:2}];
   const provider=makePermanentTerrainProvider(g,dt);
   assert.equal(typeof provider,'function');
   const result=observeProjectilePairs(g,dt,provider);
   assert.equal(result.incomplete,false);
   assert.equal(result.certified.length,1);
   const hit=result.certified[0];
   assert.deepEqual([g.bullets[hit.i].ownerId,g.bullets[hit.j].ownerId].sort(),[2,3]);
   assert.ok(Math.abs(hit.time-.02)<1e-9);
 }
});


test('distant active cover cannot suppress a clear detached Battlefield corridor',()=>{
 const g=boot();g.__novaTerrain=[{...rect(150),id:10,destructible:true,hp:20}];
 const before=JSON.stringify(g.__novaTerrain);
 assert.deepEqual(query(g,shot(),.04),{complete:true,time:null,reason:null});
 assert.equal(JSON.stringify(g.__novaTerrain),before);
 assert.equal(Object.hasOwn(g,'__novaBattlefieldIndex'),false);
});
test('distant active cover preserves earlier permanent wall contact',()=>{
 const g=boot();g.__novaTerrain=[{...rect(150),id:10,destructible:true,hp:20},rect()];
 const result=query(g,shot(),.04);
 assert.equal(result.complete,true);
 assert.ok(Math.abs(result.time-.01665)<1e-10);
});
test('near-corridor active cover remains uncertified even if it is beyond a wall',()=>{
 const g=boot();g.__novaTerrain=[rect(),{...rect(),id:10,x:12,destructible:true,hp:20}];
 assert.equal(query(g,shot(),.04).complete,false);
});
test('active circular cover at swept bounding-box tangent remains uncertain',()=>{
 const g=boot();g.__novaTerrain=[{id:11,shape:'circle',x:0,y:6.35,r:5,solid:true,destructible:true,hp:20}];
 assert.equal(query(g,shot(),.04).complete,false);
});
test('active cover outside swept bounding box does not hide a permanent pillar',()=>{
 const g=boot();g.__novaTerrain=[{id:12,shape:'circle',x:0,y:100,r:5,solid:true,destructible:true,hp:20},
   {id:-13,shape:'circle',x:0,y:0,r:5,solid:true,destructible:false}];
 const result=query(g,shot(),.04);
 assert.equal(result.complete,true);
 assert.ok(Math.abs(result.time-.01365)<1e-10);
});


test('seeded distant active cover preserves Battlefield first-hit geometry',()=>{
 let seed=0x737147;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const reference=boot();reference.__novaTerrain=[rect()];
 const expected=query(reference,shot(),.04);
 assert.equal(expected.complete,true);
 for(let world=0;world<200;world++){
   const g=boot();g.__novaTerrain=[rect()];
   for(let i=0;i<12;i++){
     const circle=random()<.5;
     const x=(random()-.5)*400,y=(random()<.5?-1:1)*(60+random()*150);
     g.__novaTerrain.push(circle?
       {id:100+i,shape:'circle',x,y,r:1+random()*15,solid:true,destructible:true,hp:20}:
       {id:100+i,shape:'rect',x,y,w:1+random()*30,h:1+random()*30,
        solid:true,destructible:true,hp:20});
   }
   const before=JSON.stringify(g.__novaTerrain);
   assert.deepEqual(query(g,shot(),.04),expected,'world '+world);
   assert.equal(JSON.stringify(g.__novaTerrain),before,'world '+world);
   assert.equal(Object.hasOwn(g,'__novaBattlefieldIndex'),false,'world '+world);
 }
});


test('actual Battlefield cover contacts are never excluded by swept AABB',()=>{
 let seed=0x147737;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 let contacts=0;
 for(let world=0;world<500;world++){
   const g=boot(),dt=.04;
   const circle=random()<.5;
   const x=(random()-.5)*100,y=(random()-.5)*100;
   const cover=circle?
     {id:1,shape:'circle',x,y,r:2+random()*18,solid:true,destructible:true,hp:20}:
     {id:1,shape:'rect',x,y,w:2+random()*36,h:2+random()*36,
       solid:true,destructible:true,hp:20};
   g.__novaTerrain=[cover];
   const b={...shot(),x:(random()-.5)*100,y:(random()-.5)*100,
     vx:(random()-.5)*4000,vy:(random()-.5)*4000};
   const actual=g.firstTerrainHit(b.x,b.y,b.x+b.vx*dt,b.y+b.vy*dt,b.r*.45);
   const result=query(g,b,dt);
   if(actual){contacts++;assert.equal(result.complete,false,'world '+world);}
 }
 assert.ok(contacts>10,'oracle must exercise real cover contacts');
});
