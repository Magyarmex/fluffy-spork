'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {makePermanentTerrainProvider}=require('../research/projectile-permanent-terrain-provider.cjs');
const {observeProjectilePairs}=require('../research/projectile-pair-chronology-observer.cjs');
const shot=(ownerId,x,vx)=>({kind:'bullet',dead:false,shell:false,beam:false,pen:0,hits:0,ttl:.42,r:3,ownerId,x,y:0,vx,vy:0});
const wall=()=>({shape:'rect',x:0,y:0,w:4,h:40,solid:true,destructible:false});
function fixture(wallFraction){return {__novaResearchHostilityFixture:true,bullets:[shot(1,-20,1000),shot(2,20,-1000)],tanks:[],shapes:[],drones:[],terrain:[],__novaTerrain:[wall()],firstTerrainHit:function(){return wallFraction==null?null:{solid:this.__novaTerrain[0],hit:{t:wallFraction}};}};}
test('wall before interception vetoes chronological certificate',()=>{
 const g=fixture(.1),dt=.04;
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,false);assert.equal(r.certified.length,0);
});
test('wall after interception preserves chronological certificate',()=>{
 const g=fixture(.9),dt=.04;
 const r=observeProjectilePairs(g,dt,makePermanentTerrainProvider(g,dt));
 assert.equal(r.incomplete,false);assert.equal(r.certified.length,1);
});
test('active destructible cover vetoes provider',()=>{
 const g=fixture(.9);g.__novaTerrain[0].destructible=true;g.__novaTerrain[0].hp=10;
 assert.equal(makePermanentTerrainProvider(g,.04),null);
});
test('live game and bullet snapshots stay unchanged',()=>{
 const g=fixture(.9),before=JSON.stringify(g.__novaTerrain),bullets=JSON.stringify(g.bullets);
 makePermanentTerrainProvider(g,.04);
 assert.equal(JSON.stringify(g.__novaTerrain),before);assert.equal(JSON.stringify(g.bullets),bullets);
});

test('unmarked live Game is not treated as a hostile-owner fixture',()=>{
 const g=fixture(.9);delete g.__novaResearchHostilityFixture;
 assert.equal(makePermanentTerrainProvider(g,.04),null);
});

test('provider rejects terrain that changes between snapshot and certificate',()=>{
 const g=fixture(.9),dt=.04;
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 g.__novaTerrain[0].x=7;
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,true);
 assert.equal(r.certified.length,0);
});

test('provider refuses bodies or withdrawn fixture authorization after snapshot',()=>{
 for (const mutation of [g=>g.tanks.push({id:9,x:0,y:0}),
   g=>{g.__novaResearchHostilityFixture=false;},
   g=>{g.terrain.push(wall());}]) {
   const g=fixture(.9),dt=.04,provider=makePermanentTerrainProvider(g,dt);
   assert.equal(typeof provider,'function');
   mutation(g);
   const r=observeProjectilePairs(g,dt,provider);
   assert.equal(r.incomplete,true);
   assert.equal(r.certified.length,0);
 }
});

test('earlier wall-blocked projectile contact cannot veto later clear hostile interception',()=>{
 const g=fixture(null),dt=.04;
 g.bullets=[shot(1,-17.5,1000),shot(2,0,0),shot(3,27.5,-1000)];
 g.__novaTerrain=[{...wall(),x:-12,w:2}];
 // Use the actual firstTerrainHit geometry in the composed Battlefield test;
 // this synthetic query explicitly models the earlier wall hit for shot A.
 g.firstTerrainHit=function(ax,ay,bx,by,pad){
   if(ax!==-17.5)return null;
   return {solid:this.__novaTerrain[0],hit:{t:.08}};
 };
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,false);
 assert.equal(r.certified.length,1);
 assert.equal(r.certified[0].i,1);
 assert.equal(r.certified[0].j,2);
 assert.ok(Math.abs(r.certified[0].time-.02)<1e-9);
});

test('wall resolves geometric shared-projectile tie before valid-contact arbitration',()=>{
 const g=fixture(null),dt=.04;
 g.bullets=[shot(1,-17.5,1000),shot(2,0,0),shot(3,17.5,-1000)];
 g.__novaTerrain=[{...wall(),x:-12,w:2}];
 g.firstTerrainHit=function(ax){
   return ax===-17.5?{solid:this.__novaTerrain[0],hit:{t:.08}}:null;
 };
 const provider=makePermanentTerrainProvider(g,dt);
 assert.equal(typeof provider,'function');
 const r=observeProjectilePairs(g,dt,provider);
 assert.equal(r.incomplete,false);
 assert.equal(r.certified.length,1);
 assert.deepEqual([r.certified[0].i,r.certified[0].j],[1,2]);
 assert.ok(Math.abs(r.certified[0].time-.01)<1e-9);
});

test('unblocked simultaneous shared-projectile tie remains conservatively uncertified',()=>{
 const g=fixture(null),dt=.04;
 g.bullets=[shot(1,-17.5,1000),shot(2,0,0),shot(3,17.5,-1000)];
 g.__novaTerrain=[{...wall(),x:200}];
 g.firstTerrainHit=()=>null;
 assert.equal(makePermanentTerrainProvider(g,dt),null);
});
