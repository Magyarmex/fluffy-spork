'use strict';
// Descriptive comparison only: sequential Chromium runs do not establish
// causal performance or physical touch-to-photon improvements.
const assert=require('node:assert/strict');
const fs=require('node:fs');
function summarize(poll,timer){
 for(const [label,r,expected] of [['poll',poll,false],['timer',timer,true]]){
  assert.equal(r.controlledGate,true,label+': uncontrolled browser');
  assert.equal(r.configuredMaxSteps,3,label+': scheduler policy mismatch');
  assert.equal(r.timerArmedGate,expected,label+': gate mode mismatch');
  assert.match(r.initialFingerprint||'',/^[a-f0-9]{8}:[0-9]+$/,label+': missing world');
  for(const [name,n] of Object.entries({
   wall:r.raf.observedWallMs,frames:r.raf.frames,
   skipped:r.raf.nativeRafSkipped,skipJs:r.raf.nativeRafSkipCallbackJsMs,
   sim:r.raf.simulatedMs,
   dropped:r.droppedMs,backlog:r.raf.backlogDroppedMs,
   touchBirth:r.touchToProjectileBirthMs,
   touchCanvas:r.touchToCanvasSubmissionMs
  }))assert.ok(Number.isFinite(n)&&n>=0,label+': invalid '+name);
  assert.ok(r.raf.observedWallMs>0&&r.raf.frames>0,label+': no observation');
  assert.ok(r.raf.deliveryLateMs?.n===r.raf.frames&&
   Number.isFinite(r.raf.deliveryLateMs.p95)&&r.raf.deliveryLateMs.p95>=0,
   label+': missing actual RAF delivery lateness');
  assert.ok(r.touchToCanvasSubmissionMs>=r.touchToProjectileBirthMs,
   label+': Canvas precedes projectile birth');
 }
 assert.equal(poll.initialFingerprint,timer.initialFingerprint,
  'comparison requires identical initial worlds');
 assert.ok(timer.raf.timerArms>0&&timer.raf.timerWakeLagMs?.n>0,
  'timer arm must have observed actual timer wakeups');
 const row=r=>({
  observedWallMs:r.raf.observedWallMs,
  deliveredFrames:r.raf.frames,
  skippedNativeRafs:r.raf.nativeRafSkipped,
  skippedPerFrame:r.raf.nativeRafSkipped/r.raf.frames,
  skipCallbackJsMs:r.raf.nativeRafSkipCallbackJsMs,
  skipCallbackJsMsPerSecond:r.raf.nativeRafSkipCallbackJsMs*1000/r.raf.observedWallMs,
  simulatedMs:r.raf.simulatedMs,
  backlogLossMsPerSecond:r.raf.backlogDroppedMs*1000/r.raf.observedWallMs,
  touchToProjectileBirthMs:r.touchToProjectileBirthMs,
  touchToCanvasSubmissionMs:r.touchToCanvasSubmissionMs,
  timerArms:r.raf.timerArms||0,
  timerWakeP95Ms:r.raf.timerWakeLagMs?.p95??null,
  deliveryLateP95Ms:r.raf.deliveryLateMs.p95
 });
 const durationRatio=timer.raf.observedWallMs/poll.raf.observedWallMs;
 return {poll:row(poll),timer:row(timer),durationRatio,
  matchedObservationDuration:durationRatio>=.9&&durationRatio<=1.1,
  causalClaimAllowed:false,
  caveat:'Sequential browser runs with differing scheduling phases; no physical device or causal claim.'};
}
if(require.main===module){
 const [a,b]=process.argv.slice(2);
 assert.ok(a&&b,'usage: node fixed60-gate-report.cjs poll.json timer.json');
 console.log('NOVA_FIXED60_GATE_COMPARISON '+JSON.stringify(summarize(
  JSON.parse(fs.readFileSync(a,'utf8')),JSON.parse(fs.readFileSync(b,'utf8')))));
}
module.exports={summarize};
