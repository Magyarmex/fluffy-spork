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
