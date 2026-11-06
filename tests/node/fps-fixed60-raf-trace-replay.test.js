'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replay,analyze}=require('../../scripts/fixed60-raf-trace-replay.cjs');
test('RAF trace replay uses real owner and exposes queued time invisible to droppedMs',()=>{
  const intervals=Array.from({length:240},(_,i)=>i%2===0?1000/120:7000/120);
  const report=analyze({frameIntervalsMs:intervals});
  const [two,three,four]=report.results;
  assert.equal(report.researchOnly,true);
  assert.equal(two.frames,240);
  assert.equal(two.droppedMs,0);
  assert.equal(three.droppedMs,0);
  assert.equal(four.droppedMs,0);
  assert.equal(two.simulatedTicks,478);
  assert.equal(three.simulatedTicks,479);
  assert.equal(four.simulatedTicks,480);
  assert.equal(two.remainingBacklogMs,33.333);
  assert.equal(three.remainingBacklogMs,16.667);
  assert.equal(four.remainingBacklogMs,0);
  assert.ok(three.catchupFrames>0);
  assert.ok(four.peakSteps===4);
});
test('RAF trace replay rejects malformed, unbounded, and hostile intervals',()=>{
  for(const value of [[],[0],[-1],[NaN],[Infinity],[10001],Array(200001).fill(1)])
    assert.throws(()=>replay(value),/expected/);
  for(const cap of [0,5,1.5])assert.throws(()=>replay([33],cap),/maxSteps/);
});
test('steady 30Hz trace reaches native60 tick budget without dropping time',()=>{
  const result=replay(Array(120).fill(1000/30),2);
  assert.equal(result.simulatedTicks,240);
  assert.equal(result.droppedMs,0);
  assert.equal(result.remainingBacklogMs,0);
  assert.equal(result.catchupFrames,0);
});
