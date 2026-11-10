'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../research/fixed60-paired-report.cjs');
function arm(steps,wall=1000){return {controlledGate:true,configuredMaxSteps:steps,
 initialFingerprint:'09a37c35:8241',ticks:45,droppedMs:240,
 touchToProjectileBirthMs:21,touchToCanvasSubmissionMs:28,
 updates:{p95:2},renders:{p95:3},raf:{observedWallMs:wall,simulatedMs:750,
 remainingLagMs:10,frames:30,presentationHz:30,controlledLongGaps:4,
 stepCounts:{[steps]:5},longStallDroppedMs:100,backlogDroppedMs:140,
 callbackJs:{p95:5}}};}
test('paired browser report is descriptive and normalized by actual elapsed time',()=>{
 const result=summarize(arm(2),arm(3,1000));
 assert.equal(result.control.backlogLossMsPerSecond,140);
 assert.equal(result.matchedObservationDuration,true);
 assert.equal(result.causalClaimAllowed,false);
});
test('unequal observation duration is explicitly exposed',()=>{
 const a=arm(2),b=arm(3,1500);
 b.raf.simulatedMs=1250;
 const result=summarize(a,b);
 assert.equal(result.durationRatio,1.5);
 assert.equal(result.matchedObservationDuration,false);
 assert.equal(result.candidate.backlogLossMsPerSecond,140/1.5);
});
test('mismatched initial world fails closed',()=>{
 const b=arm(3);b.initialFingerprint='ffffffff:8241';
 assert.throws(()=>summarize(arm(2),b),/identical world/);
});
test('unaccounted wall time fails closed',()=>{
 const b=arm(3);b.raf.remainingLagMs=30;
 assert.throws(()=>summarize(arm(2),b),/does not reconcile/);
});
test('missing actual catch-up path fails closed',()=>{
 const b=arm(3);b.raf.stepCounts={'2':30};
 assert.throws(()=>summarize(arm(2),b),/ceiling not exercised/);
});
test('invalid dropped-time attribution fails closed',()=>{
 const b=arm(3);b.raf.backlogDroppedMs=0;
 assert.throws(()=>summarize(arm(2),b),/causes do not reconcile/);
});

test('missing real projectile-to-Canvas evidence fails closed',()=>{
 const b=arm(3);b.touchToCanvasSubmissionMs=null;
 assert.throws(()=>summarize(arm(2),b),/Canvas submission/);
});
test('Canvas submission cannot precede projectile birth',()=>{
 const b=arm(3);b.touchToCanvasSubmissionMs=10;
 assert.throws(()=>summarize(arm(2),b),/Canvas submission/);
});
