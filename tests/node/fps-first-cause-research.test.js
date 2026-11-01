'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {run,compare}=require('../research/fps-first-cause.cjs');
test('research FPS comparator is read-only in actual 48-overlay Game at 30/60/120 Hz',()=>{
 for(const seed of [1517800,1517802,1517810])for(const hz of [30,60,120]){
  const observed=run(seed,hz,1,true);
  const untouched=run(seed,hz,1,false);
  assert.equal(observed.initial,untouched.initial);
  assert.equal(observed.final,untouched.final);
  assert.equal(observed.draws,untouched.draws);
  assert.deepEqual(observed.checkpoints,untouched.checkpoints);
  assert.equal(observed.observer.moves,hz);
  assert.equal(observed.observer.linearValid+observed.observer.linearInvalid,hz);
  assert.equal(observed.observer.nonLinear,0);
  assert.equal(observed.observer.damageEventsTruncated,false);
  assert.equal(observed.observer.damageEventsTotal,observed.observer.damageEvents.length);
 }
});
test('research FPS comparator compares equal simulated times and never claims equality',()=>{
 const a=run(1517802,30),b=run(1517802,60),c=run(1517802,120);
 assert.equal(a.initial,b.initial);assert.equal(b.initial,c.initial);
 for(const candidate of [a,c]){
  const comparison=compare(candidate,b);
  assert.equal(comparison.sameInitial,true);
  assert.equal(comparison.firstCommon.time,b.checkpoints[1].time);
  assert.equal(comparison.firstCommon.rngDrawDifference,0);
  assert.ok(Number.isFinite(comparison.firstCommon.dx));
  assert.ok(comparison.first.player===null||Number.isInteger(comparison.first.player.checkpoint));
 }
});
test('research FPS comparator rejects mismatched worlds and invalid timebases',()=>{
 assert.throws(()=>run(1,59),/invalid/);
 assert.throws(()=>run(1,30,0),/invalid/);
 const a=run(1517802,60),b=run(1517800,60);
 assert.throws(()=>compare(a,b),/unmatched/);
});
