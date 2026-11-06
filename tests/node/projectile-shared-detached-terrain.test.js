'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makeDetachedPermanentTerrainQuery,firstDetachedPermanentTerrainEvent}=require('../research/projectile-detached-permanent-terrain.cjs');
const shot=(x=-20,y=0)=>({kind:'bullet',dead:false,shell:false,beam:false,pen:0,hits:0,x,y,vx:1000,vy:0,r:3,ttl:.5});
const wall=()=>({shape:'rect',x:0,y:0,w:4,h:40,solid:true,destructible:false});
test('multi-shot chronology reuses one detached terrain owner, not live spatial state',()=>{
 const live=wall(),seen=[];
 const game={__novaTerrain:[live],firstTerrainHit:function(){
   seen.push(this);
   assert.notStrictEqual(this.__novaTerrain,game.__novaTerrain);
   assert.notStrictEqual(this.__novaTerrain[0],live);
   this.__novaBattlefieldIndex ??={index:1};
   this.__novaTerrain[0].__novaBattlefieldStamp=seen.length;
   return {solid:this.__novaTerrain[0],hit:{t:.25}};
 }};
 const before=JSON.stringify(game.__novaTerrain),query=makeDetachedPermanentTerrainQuery(game);
 assert.equal(typeof query,'function');
 assert.equal(query(shot(),.04).time,.01);
 assert.equal(query(shot(-30),.04).time,.01);
 assert.strictEqual(seen[0],seen[1],'both shots must share detached index owner');
 assert.equal(JSON.stringify(game.__novaTerrain),before);
 assert.equal(Object.hasOwn(game,'__novaBattlefieldIndex'),false);
 assert.equal(firstDetachedPermanentTerrainEvent(game,shot(),.04).time,.01);
 assert.notStrictEqual(seen[2],seen[0],'legacy one-shot entry point must remain independent');
});
test('active cover corridor abstention remains per projectile with shared index',()=>{
 const cover={...wall(),x:100,y:100,destructible:true,hp:20};
 const game={__novaTerrain:[wall(),cover],firstTerrainHit:function(){
   assert.equal(this.__novaTerrain.length,1);
   return {solid:this.__novaTerrain[0],hit:{t:.5}};
 }};
 const query=makeDetachedPermanentTerrainQuery(game);
 assert.equal(query(shot(),.04).time,.02);
 assert.equal(query(shot(90,100),.04).complete,false);
 assert.equal(query(shot(),.04).time,.02);
});
test('malformed terrain and unsupported shots fail closed without querying',()=>{
 let calls=0;
 const game={__novaTerrain:[wall()],firstTerrainHit(){calls++;return null;}};
 const query=makeDetachedPermanentTerrainQuery(game);
 assert.equal(query({...shot(),shell:true},.04).complete,false);
 assert.equal(query({...shot(),vx:Infinity},.04).complete,false);
 assert.equal(calls,0);
 assert.equal(makeDetachedPermanentTerrainQuery({...game,__novaTerrain:[{...wall(),w:NaN}]}),null);
});
