'use strict';
// Contract tests for the paired Chromium report's input comparability gate.
// Synthetic fixtures prove the reporter refuses missing release evidence and
// does not upgrade matched browser observations into a causal gameplay claim.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../research/fixed60-paired-report.cjs');

function fixture(steps=2){
 return {
  controlledGate:true,configuredMaxSteps:steps,initialFingerprint:'1234abcd:200',
  droppedMs:0,ticks:12,updates:{p95:1},renders:{p95:2},
  touchToProjectileBirthMs:10,touchToCanvasSubmissionMs:12,
  touchInput:{firstTouchWallMs:100,firstTouchOwnerPhaseMs:80,events:[
   {type:'pointerdown',pointerId:42,x:100,y:200,relativeWallMs:0,nominalOwnerTick:4},
   {type:'pointermove',pointerId:42,x:120,y:220,relativeWallMs:20,nominalOwnerTick:6},
   {type:'pointerup',pointerId:42,x:120,y:220,relativeWallMs:100,nominalOwnerTick:10}
  ]},
  releaseTelemetry:{releaseWallMs:200,volleyEventsBeforeRelease:3,
   volleyEventsAfterRelease:0,lastPreReleaseBirthAgeMs:12},
  raf:{observedWallMs:200,simulatedMs:200,remainingLagMs:0,frames:12,
   longStallDroppedMs:0,longStallWallMs:20,nativeRafSkipped:2,
   backlogDroppedMs:0,controlledLongGaps:3,stepCounts:{[steps]:1},
   presentationHz:60,callbackJs:{p95:3}}
 };
}
const copy=x=>JSON.parse(JSON.stringify(x));

test('matched seeded browser inputs remain descriptive, never causal',()=>{
 const result=summarize(fixture(2),fixture(3));
 assert.equal(result.sameTouchSequence,true);
 assert.equal(result.maxAbsTouchTimingDeltaMs,0);
 assert.equal(result.matchedTouchTiming,true);
 assert.equal(result.matchedTouchGeometry,true);
 assert.equal(result.comparableTouchDelivery,true);
 assert.equal(result.firstTouchOwnerPhaseDeltaMs,0);
 assert.equal(result.matchedTouchPhase,true);
 assert.equal(result.sameNominalInputTicks,true);
 assert.equal(result.causalClaimAllowed,false);
 assert.equal(result.control.volleyEventsAfterRelease,0);
 assert.equal(result.candidate.lastPreReleaseBirthAgeMs,12);
});

test('matching world alone does not imply matching touch histories',()=>{
 const candidate=fixture(3);
 candidate.touchInput.events[1].relativeWallMs=45;
 const result=summarize(fixture(2),candidate);
 assert.equal(result.sameTouchSequence,true);
 assert.equal(result.maxAbsTouchTimingDeltaMs,25);
 assert.equal(result.matchedTouchTiming,false);
 assert.equal(result.comparableTouchDelivery,false);
 assert.equal(result.causalClaimAllowed,false);
});

test('identical event identities but different aim positions are not comparable',()=>{
 const candidate=fixture(3);
 candidate.touchInput.events[1].x+=30;
 const result=summarize(fixture(2),candidate);
 assert.equal(result.sameTouchSequence,true);
 assert.equal(result.matchedTouchTiming,true);
 assert.equal(result.maxTouchPositionDeltaPx,30);
 assert.equal(result.matchedTouchGeometry,false);
 assert.equal(result.comparableTouchDelivery,false);
});

test('identical gestures at different owner phases are not comparable',()=>{
 const candidate=fixture(3);
 candidate.touchInput.firstTouchOwnerPhaseMs+=40;
 const result=summarize(fixture(2),candidate);
 assert.equal(result.sameTouchSequence,true);
 assert.equal(result.matchedTouchTiming,true);
 assert.equal(result.matchedTouchGeometry,true);
 assert.equal(result.firstTouchOwnerPhaseDeltaMs,40);
 assert.equal(result.matchedTouchPhase,false);
 assert.equal(result.comparableTouchDelivery,false);
});

test('same gestures delivered in different nominal owner ticks are flagged',()=>{
 const candidate=fixture(3);
 candidate.touchInput.events[1].nominalOwnerTick++;
 const result=summarize(fixture(2),candidate);
 assert.equal(result.sameTouchSequence,true);
 assert.equal(result.matchedTouchTiming,true);
 assert.equal(result.matchedTouchGeometry,true);
 assert.equal(result.sameNominalInputTicks,false);
 assert.equal(result.comparableTouchDelivery,false);
});

test('different pointer histories fail closed before comparison',()=>{
 const candidate=fixture(3);
 candidate.touchInput.events[1].pointerId=99;
 assert.throws(()=>summarize(fixture(2),candidate),/retain one owner/);
});

test('missing or invalid release evidence fails closed',()=>{
 for(const mutate of [
  r=>{delete r.touchInput;},
  r=>{r.touchInput.events[2].relativeWallMs=10;},
  r=>{r.releaseTelemetry.volleyEventsAfterRelease=1;},
  r=>{r.releaseTelemetry.releaseWallMs=null;},
  r=>{r.releaseTelemetry.releaseWallMs+=5;},
  r=>{r.releaseTelemetry.volleyEventsBeforeRelease=0;},
  r=>{r.touchInput.events[2].type='pointermove';}
 ]){
  const candidate=copy(fixture(3));
  mutate(candidate);
  assert.throws(()=>summarize(fixture(2),candidate));
 }
});

test('mixed touch owners, post-release gestures and incomplete gestures fail closed',()=>{
 const mutations=[
  r=>{r.touchInput.events[2].pointerId=99;},
  r=>{r.touchInput.events[0].type='pointermove';},
  r=>{r.touchInput.events[1].type='pointerdown';},
  r=>{r.touchInput.events.push({...r.touchInput.events[2],
   type:'pointermove',relativeWallMs:101});},
  r=>{r.touchInput.events.push({...r.touchInput.events[2],
   type:'pointerdown',relativeWallMs:101});},
  r=>{r.touchInput.events[2].type='pointercancel';},
  r=>{r.touchInput.events[1].pointerId=99;}
 ];
 for(const mutate of mutations){
  const candidate=copy(fixture(3));
  mutate(candidate);
  assert.throws(()=>summarize(fixture(2),candidate));
 }
});
