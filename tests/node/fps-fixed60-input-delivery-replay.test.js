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
 assert.equal(twenty.appliedDuringSkippedTime,0);
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

test('skipped simulation time is not misreported as an executed input tick',()=>{
 const intervals=Array(8).fill(50);
 const events=[{atMs:130,kind:'keydown',key:'w'},
   {atMs:310,kind:'keyup',key:'w'}];
 const low=replayInputDelivery(intervals,events,{maxSteps:2});
 const sufficient=replayInputDelivery(intervals,events,{maxSteps:3});
 assert.ok(low.droppedMs>0,'two steps cannot sustain 20Hz over this interval');
 assert.equal(sufficient.droppedMs,0);
 assert.equal(sufficient.appliedDuringSkippedTime,0);
 assert.equal(low.deliveredCount+low.pendingCount,2);
 assert.equal(sufficient.deliveredCount,2);
 assert.ok(low.appliedDuringSkippedTime>0,
   'a queued key edge can be consumed by skipped chronology without an update');
 assert.equal(low.events[0].appliedWallMs,200);
 assert.equal(low.events[0].delayMs,70);
 assert.equal(low.events[0].appliedDuringSkip,true);
 assert.equal(sufficient.events[0].appliedWallMs,150);
 assert.equal(sufficient.events[0].delayMs,20);
 assert.equal(sufficient.events[0].appliedDuringSkip,false);
 assert.ok(low.appliedDuringSkippedTime<=low.deliveredCount);
});
test('simultaneous event timestamps retain distinct original keys',()=>{
 const r=replayInputDelivery([50,50],[{atMs:20,kind:'keydown',key:'w'},
   {atMs:20,kind:'keydown',key:'d'},
   {atMs:30,kind:'keyup',key:'w'}],{maxSteps:3});
 assert.deepEqual(r.events.map(e=>e.key),['w','d','w']);
 assert.equal(r.deliveredCount,3);
});
