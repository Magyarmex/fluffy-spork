'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeRaf}=require('../research/fixed60-raf-capability.cjs');
function intervals(pattern,count=180){return Array.from({length:count},(_,i)=>pattern[i%pattern.length]);}
test('blank controlled RAF accepts stable 90Hz callbacks under the strict p95 gate',()=>{
 const report=summarizeRaf(intervals([1000/90]),2000);
 assert.ok(report.hz>=80&&report.hz<=100);
 assert.ok(report.p95<15);
 assert.equal(report.supports90Hz,true);
});
test('native 60Hz cadence cannot masquerade as a 90Hz-capable controlled gate',()=>{
 const report=summarizeRaf(intervals([1000/60]),3000);
 assert.equal(report.supports90Hz,false);
});
test('120Hz native cadence with 90Hz gate quantization fails the strict p95 criterion',()=>{
 const report=summarizeRaf(intervals([1000/120,1000/120,1000/60]),2000);
 assert.ok(report.hz>=80&&report.hz<=100);
 assert.ok(report.p95>=15);
 assert.equal(report.supports90Hz,false);
});
test('blank RAF summary rejects sparse, non-finite and zero intervals',()=>{
 assert.throws(()=>summarizeRaf([10,11,12],100),/at least eight/);
 assert.throws(()=>summarizeRaf(intervals([10,NaN]),2000),/finite and positive/);
 assert.throws(()=>summarizeRaf(intervals([10,0]),2000),/finite and positive/);
});
