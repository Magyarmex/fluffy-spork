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
