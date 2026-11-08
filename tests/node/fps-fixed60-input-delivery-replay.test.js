'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replayInputDelivery}=require('../../scripts/fixed60-input-delivery-replay.cjs');
test('real owner records exact input-handler delay without claiming photon latency',()=>{
 const events=[{atMs:25,kind:'keydown',key:'w'},
   {atMs:175,kind:'keyup',key:'w'}];
 const sixty=replayInputDelivery(Array(12).fill(1000/60),events);
 const twenty=replayInputDelivery(Array(4).fill(50),events,{maxSteps:3});
 assert.equal(sixty.deliveredCount,2);
 assert.equal(twenty.deliveredCount,2);
 assert.equal(sixty.pendingCount,0);
 assert.equal(twenty.pendingCount,0);
 assert.equal(sixty.droppedMs,0);
 assert.equal(twenty.droppedMs,0);
 assert.equal(sixty.simulatedTicks,12);
 assert.equal(twenty.simulatedTicks,12);
 assert.deepEqual(twenty.events.map(e=>[e.kind,e.key]),[['keydown','w'],['keyup','w']]);
 for(const result of [sixty,twenty]){
   assert.ok(result.p50ApplyDelayMs>=0);
   assert.ok(result.p95ApplyDelayMs>=result.p50ApplyDelayMs);
   assert.ok(result.p99ApplyDelayMs>=result.p95ApplyDelayMs);
   assert.ok(result.maxApplyDelayMs>=result.p99ApplyDelayMs);
 }
});
test('insufficient step budget discloses deferred input independently of dropped simulation',()=>{
 const events=[{atMs:25,kind:'keydown',key:'w'},
   {atMs:175,kind:'keyup',key:'w'}];
 const limited=replayInputDelivery(Array(4).fill(50),events,{maxSteps:2});
 assert.ok(limited.simulatedTicks<12);
 assert.ok(limited.droppedMs>=0);
 assert.ok(limited.deliveredCount<=events.length);
 assert.equal(limited.deliveredCount+limited.pendingCount,events.length);
});
test('invalid event clocks and trace boundaries fail closed',()=>{
 const intervals=[50,50];
 for(const events of [
   [{atMs:101,kind:'keydown',key:'w'}],
   [{atMs:-1,kind:'keydown',key:'w'}],
   [{atMs:20,kind:'keydown',key:'w'},{atMs:10,kind:'keyup',key:'w'}],
   [{atMs:10,kind:'pointerdown',key:'w'}],
   [{atMs:NaN,kind:'keydown',key:'w'}]
 ])assert.throws(()=>replayInputDelivery(intervals,events),/input event|chronological|outside/);
 assert.throws(()=>replayInputDelivery([0],[]),/RAF intervals/);
 assert.equal(replayInputDelivery([50],[]).p95ApplyDelayMs,null);
});
