'use strict';
// Keep the independent finite-cover chronology research executable in CI.
// This does not change the known-red shipping collision acceptance tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('finite cover / moving-body chronological research is frame-partition invariant',()=>{
  const script=path.resolve(__dirname,'../research/chronology-finite-cover-frame-partition.js');
  const text=execFileSync(process.execPath,[script],{encoding:'utf8',timeout:20000});
  const result=JSON.parse(text);
  assert.equal(result.deterministic,10);
  assert.equal(result.worlds,18911);
  assert.equal(result.comparisons,113466);
  assert.equal(result.events,34772);
  assert.equal(result.excludedNearTies,1089);
  assert.equal(result.disagreements,0);
});
