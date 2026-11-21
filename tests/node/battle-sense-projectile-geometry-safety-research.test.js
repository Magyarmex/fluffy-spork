'use strict';
// Research-only geometry safety: never infer an attack from corrupt projectile data.
const test=require('node:test');
const assert=require('node:assert/strict');
const {projectileCandidate}=require('../research/battle-sense-projectile-candidate.cjs');
const shooter={id:7},victim={x:100,y:0,cls:'tank'};
function evaluate(patch={}){
 const bullet={ownerId:7,x:0,y:0,vx:100,vy:0,ttl:2,r:3,...patch};
 return projectileCandidate({bullets:[bullet]},shooter,victim);
}
test('research projectile provenance: finite real lane is eligible',()=>{
 const r=evaluate();
 assert.equal(r.known,true);assert.equal(r.possible,true);
});
test('research projectile provenance: nonfinite speed, range, radius cannot certify crossfire',()=>{
 for(const patch of [
  {vx:Infinity},{vy:Infinity},{vx:NaN},{ttl:Infinity},{ttl:NaN},
  {r:Infinity},{r:-1},{x:Infinity},{y:NaN}
 ]){
  const r=evaluate(patch);
  assert.equal(r.possible,false,JSON.stringify(patch));
  assert.equal(r.known,false,JSON.stringify(patch));
  assert.equal(r.unsupported,1,JSON.stringify(patch));
 }
});
test('research projectile provenance: no other shooter and no invalid victim can certify',()=>{
 assert.equal(evaluate({ownerId:8}).possible,false);
 const r=projectileCandidate({bullets:[{ownerId:7,x:0,y:0,vx:100,vy:0,ttl:2,r:3}]},
  shooter,{x:Infinity,y:0});
 assert.equal(r.possible,false);assert.equal(r.known,false);
});

test('research projectile provenance: cover blocks a geometrically aligned shot',()=>{
 let calls=0;
 const blocked=projectileCandidate({
  bullets:[{ownerId:7,x:0,y:0,vx:100,vy:0,ttl:2,r:3}],
  firstTerrainHit(x1,y1,x2,y2,r){calls++;assert.equal(x1,0);assert.equal(y1,0);assert.ok(x2>0&&x2<=100);assert.equal(y2,0);assert.ok(r>=0);return {x:40,y:0};}
 },shooter,victim);
 assert.equal(blocked.known,true);assert.equal(blocked.possible,false);
 assert.equal(blocked.terrainChecks,1);assert.equal(calls,1);
 const clear=projectileCandidate({
  bullets:[{ownerId:7,x:0,y:0,vx:100,vy:0,ttl:2,r:3}],
  firstTerrainHit(){return null;}
 },shooter,victim);
 assert.equal(clear.known,true);assert.equal(clear.possible,true);
});
test('research projectile provenance: finite misses, insufficient range, and foreign shots do not certify',()=>{
 for(const patch of [
  {vx:0,vy:100},{vx:100,vy:0,ttl:.2},{ownerId:8}
 ]){
  const r=evaluate(patch);
  assert.equal(r.possible,false,JSON.stringify(patch));
 }
 const spread=projectileCandidate({bullets:[
  {ownerId:7,x:0,y:0,vx:100,vy:70,ttl:2,r:3},
  {ownerId:7,x:0,y:0,vx:100,vy:-70,ttl:2,r:3}
 ]},shooter,victim);
 assert.equal(spread.known,true);assert.equal(spread.possible,false);
 assert.equal(spread.checked,2);
});
test('research projectile provenance: explosive and malformed lanes remain explicitly unknown',()=>{
 for(const patch of [{shell:true},{splash:30},{cluster:true},{vx:0,vy:0}]){
  const r=evaluate(patch);
  assert.equal(r.known,false,JSON.stringify(patch));
  assert.equal(r.possible,false,JSON.stringify(patch));
  assert.equal(r.unsupported,1,JSON.stringify(patch));
 }
});

test('research projectile provenance: a clear pellet can certify even when a sibling misses',()=>{
 const result=projectileCandidate({
  bullets:[
   {ownerId:7,x:0,y:0,vx:100,vy:70,ttl:2,r:3},
   {ownerId:7,x:0,y:0,vx:100,vy:0,ttl:2,r:3}
  ],
  firstTerrainHit(){return null;}
 },shooter,victim);
 assert.equal(result.known,true);
 assert.equal(result.possible,true);
 assert.equal(result.checked,2);
 assert.equal(result.terrainChecks,1);
});
test('research projectile provenance: a blocked first pellet cannot suppress a later clear pellet',()=>{
 let queries=0;
 const result=projectileCandidate({
  bullets:[
   {ownerId:7,x:0,y:0,vx:100,vy:0,ttl:2,r:3},
   {ownerId:7,x:0,y:8,vx:100,vy:0,ttl:2,r:3}
  ],
  firstTerrainHit(){return ++queries===1?{solid:true}:null;}
 },shooter,victim);
 assert.equal(result.known,true);
 assert.equal(result.possible,true);
 assert.equal(result.checked,2);
 assert.equal(result.terrainChecks,2);
});

test('research projectile provenance: cover plus penetration is unknown until real impact resolution',()=>{
 const bullet={ownerId:7,x:0,y:0,vx:100,vy:0,ttl:2,r:3,pen:3};
 const covered=projectileCandidate({
  bullets:[bullet],firstTerrainHit(){return {solid:true,destructible:true,hp:10};}
 },shooter,victim);
 assert.equal(covered.possible,false);
 assert.equal(covered.known,false,'penetration may breach destructible cover');
 assert.equal(covered.unsupported,1);
 assert.equal(covered.terrainChecks,1);
 const clear=projectileCandidate({
  bullets:[bullet],firstTerrainHit(){return null;}
 },shooter,victim);
 assert.equal(clear.known,true);
 assert.equal(clear.possible,true);
 const spent=projectileCandidate({
  bullets:[{...bullet,pen:0}],firstTerrainHit(){return {solid:true};}
 },shooter,victim);
 assert.equal(spent.known,true);
 assert.equal(spent.possible,false);
});

test('research projectile provenance: seeded segment-circle oracle agrees for 512 lanes',()=>{
 let seed=0x12345678;
 function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
 for(let i=0;i<512;i++){
  const b={ownerId:7,x:(rand()-.5)*4500,y:(rand()-.5)*4500,
   vx:(rand()-.5)*2000,vy:(rand()-.5)*2000,ttl:.01+rand()*3,r:rand()*8};
  const v={x:(rand()-.5)*4500,y:(rand()-.5)*4500};
  const speed=Math.hypot(b.vx,b.vy);
  if(speed<=1)continue;
  const dx=b.vx*b.ttl,dy=b.vy*b.ttl,fx=b.x-v.x,fy=b.y-v.y,rr=18+b.r;
  const A=dx*dx+dy*dy,B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-rr*rr;
  const D=B*B-4*A*C;
  const hit=C<=0||(D>=0&&(
   ((-B-Math.sqrt(D))/(2*A)>=0&&(-B-Math.sqrt(D))/(2*A)<=1)||
   ((-B+Math.sqrt(D))/(2*A)>=0&&(-B+Math.sqrt(D))/(2*A)<=1)));
  const result=projectileCandidate({bullets:[b]},shooter,v);
  assert.equal(result.known,true,'valid seeded lane '+i);
  assert.equal(result.possible,hit,'seeded lane '+i);
 }
});

test('research projectile provenance: malformed penetration cannot certify a lane',()=>{
 for(const pen of [Infinity,-Infinity,NaN,-1,'3']){
  const r=evaluate({pen});
  assert.equal(r.known,false,'pen='+String(pen));
  assert.equal(r.possible,false,'pen='+String(pen));
  assert.equal(r.unsupported,1,'pen='+String(pen));
 }
});

test('research projectile provenance: dead bullets do not certify a fresh threat',()=>{
 for(const state of [true,1]){
  const dead=evaluate({dead:state});
  assert.equal(dead.possible,false);
  assert.equal(dead.known,false);
  assert.equal(dead.checked,0);
 }
 const live=evaluate({dead:false});
 assert.equal(live.possible,true);
 assert.equal(live.known,true);
});

test('research projectile provenance: coercible strings and booleans are not velocities',()=>{
 for(const patch of [{vx:'100'},{vy:'0'},{vx:true},{vy:false}]){
  const r=evaluate(patch);
  assert.equal(r.known,false,JSON.stringify(patch));
  assert.equal(r.possible,false,JSON.stringify(patch));
  assert.equal(r.unsupported,1,JSON.stringify(patch));
 }
});
