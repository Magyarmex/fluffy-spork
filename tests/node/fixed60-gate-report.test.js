'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../research/fixed60-gate-report.cjs');
function arm(timer=false,wall=1000){
 return {controlledGate:true,configuredMaxSteps:3,timerArmedGate:timer,
  initialFingerprint:'09a37c35:8241',droppedMs:120,
  touchToProjectileBirthMs:8,touchToCanvasSubmissionMs:12,
  raf:{observedWallMs:wall,frames:30,nativeRafSkipped:timer?3:900,
   simulatedMs:750,backlogDroppedMs:80,timerArms:timer?25:0,
   timerWakeLagMs:{n:timer?25:0,p95:timer?2:null}}};
}
test('gate comparison reports actual per-frame native overhead, not causal gain',()=>{
 const r=summarize(arm(),arm(true));
 assert.equal(r.poll.skippedPerFrame,30);
 assert.equal(r.timer.skippedPerFrame,.1);
 assert.equal(r.matchedObservationDuration,true);
 assert.equal(r.causalClaimAllowed,false);
});
test('different observation windows remain explicit',()=>{
 const r=summarize(arm(),arm(true,1500));
 assert.equal(r.durationRatio,1.5);
 assert.equal(r.matchedObservationDuration,false);
});
test('initial worlds must match',()=>{
 const b=arm(true);b.initialFingerprint='ffffffff:8241';
 assert.throws(()=>summarize(arm(),b),/identical initial worlds/);
});
test('gate mode and policy cannot be silently swapped',()=>{
 const b=arm(true);b.timerArmedGate=false;
 assert.throws(()=>summarize(arm(),b),/gate mode mismatch/);
 b.timerArmedGate=true;b.configuredMaxSteps=2;
 assert.throws(()=>summarize(arm(),b),/scheduler policy mismatch/);
});
test('timer must actually wake and touch must reach Canvas',()=>{
 const b=arm(true);b.raf.timerWakeLagMs.n=0;
 assert.throws(()=>summarize(arm(),b),/timer wakeups/);
 b.raf.timerWakeLagMs.n=25;b.touchToCanvasSubmissionMs=1;
 assert.throws(()=>summarize(arm(),b),/Canvas precedes/);
});
