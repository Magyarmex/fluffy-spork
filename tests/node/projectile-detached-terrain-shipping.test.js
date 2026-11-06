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
