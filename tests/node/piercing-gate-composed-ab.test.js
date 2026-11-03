'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,removeGate}=require('../research/piercing-gate-ab.cjs');
test('draft piercing gate is removable only at the exact expected source markers',()=>{
 assert.throws(()=>removeGate('not the expected Battlefield source'),/gate markers changed/);
});
for(const hz of [30,60])for(const dense of [false,true]){
 test('piercing gate preserves composed physical state and gameplay RNG ('+hz+'Hz, '+(dense?'crowded':'ordinary')+')',()=>{
  const scenario={seed:1517800,hz,seconds:1,dense,fire:true};
  const base=run({...scenario,gate:false});
  const candidate=run({...scenario,gate:true});
  assert.equal(candidate.physicalHash,base.physicalHash);
  assert.equal(candidate.rngDraws,base.rngDraws);
 });
}
