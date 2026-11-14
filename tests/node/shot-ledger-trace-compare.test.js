'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {comparePhysicalTraces}=require('../research/shot-ledger-trace-compare.cjs');
const mk=(hashes,frames=20)=>({frames,physicalTrace:hashes.map((hash,i)=>({frame:i*10,hash}))});
test('shot ledger physical parity accepts identical traces',()=>{
 const r=comparePhysicalTraces(mk(['a:b','c:d','e:f']),mk(['a:b','c:d','e:f']));
 assert.equal(r.initialStateMatched,true);assert.equal(r.firstDivergence,null);
 assert.equal(r.complete,true);assert.equal(r.comparedSamples,3);
});
test('shot ledger physical parity identifies first divergence without inferring missed hits',()=>{
 const r=comparePhysicalTraces(mk(['a:b','c:d','e:f']),mk(['a:b','f:a','e:f']));
 assert.deepEqual(r.firstDivergence,{frame:10,off:'c:d',on:'f:a'});
});
test('shot ledger physical parity refuses different initial worlds',()=>{
 assert.throws(()=>comparePhysicalTraces(mk(['a:b','c:d','e:f']),mk(['0:1','c:d','e:f'])),/frame zero/);
});
test('shot ledger physical parity refuses missing samples and wrong frame epochs',()=>{
 const a=mk(['a:b','c:d','e:f']);
 assert.throws(()=>comparePhysicalTraces({...a,physicalTrace:a.physicalTrace.slice(0,2)},a),/cadence/);
 assert.throws(()=>comparePhysicalTraces({...a,physicalTrace:[{frame:1,hash:'a:b'},...a.physicalTrace.slice(1)]},a),/epoch/);
});
test('shot ledger physical parity discloses incomplete run durations',()=>{
 const r=comparePhysicalTraces(mk(['a:b','c:d','e:f']),mk(['a:b','c:d'],10));
 assert.equal(r.complete,false);assert.equal(r.comparedSamples,2);
});
