'use strict';
// Research only: compare actual Chromium Game owner reports without conflating
// different wall-time observation windows with causal gameplay improvements.
const assert=require('node:assert/strict');
const fs=require('node:fs');

function summarize(control,candidate){
 for(const [label,report,steps] of [['control',control,2],['candidate',candidate,3]]){
  assert.equal(report.controlledGate,true,`${label}: expected controlled browser`);
  assert.equal(report.configuredMaxSteps,steps,`${label}: wrong scheduler arm`);
  assert.match(report.initialFingerprint||'',/^[0-9a-f]{8}:[0-9]+$/,`${label}: missing world fingerprint`);
  const r=report.raf;
  for(const [name,value] of Object.entries({wall:r.observedWallMs,sim:r.simulatedMs,
   dropped:report.droppedMs,queued:r.remainingLagMs,frames:r.frames,
   longStall:r.longStallDroppedMs,longStallWall:r.longStallWallMs,nativeRafSkipped:r.nativeRafSkipped,
   backlog:r.backlogDroppedMs})){
   assert.ok(Number.isFinite(value)&&value>=0,`${label}: invalid ${name}`);
  }
  assert.ok(Number.isFinite(report.touchToProjectileBirthMs)&&
   report.touchToProjectileBirthMs>=0,`${label}: missing real touch-to-birth measurement`);
  assert.ok(Number.isFinite(report.touchToCanvasSubmissionMs)&&
   report.touchToCanvasSubmissionMs>=report.touchToProjectileBirthMs,
   `${label}: missing touch-to-Canvas submission`);
  assert.ok(r.longStallWallMs<r.observedWallMs,
   `${label}: no measured active observation window`);
  assert.ok(r.frames>=5&&r.observedWallMs>0,`${label}: insufficient browser evidence`);
  assert.ok(Array.isArray(report.touchInput?.events)&&report.touchInput.events.length>=2,
   `${label}: missing trusted touch chronology`);
  assert.ok(Number.isFinite(report.touchInput.firstTouchWallMs),
   `${label}: missing first trusted touch wall time`);
  assert.equal(report.touchInput.events[0].relativeWallMs,0,
   `${label}: first touch must be relative epoch`);
  for(let i=0;i<report.touchInput.events.length;i++){
   const e=report.touchInput.events[i];
   assert.ok(['pointerdown','pointermove','pointerup','pointercancel'].includes(e.type),
    `${label}: invalid touch event type`);
   assert.ok(Number.isInteger(e.pointerId)&&Number.isFinite(e.relativeWallMs)&&
    Number.isFinite(e.x)&&Number.isFinite(e.y)&&e.relativeWallMs>=0,
    `${label}: invalid touch event timestamp/identity/position`);
   if(i)assert.ok(e.relativeWallMs>=report.touchInput.events[i-1].relativeWallMs,
    `${label}: touch events not chronological`);
  }
  assert.ok(Number.isFinite(report.releaseTelemetry?.releaseWallMs),
   `${label}: missing trusted release time`);
  assert.equal(report.releaseTelemetry.volleyEventsAfterRelease,0,
   `${label}: player fired after trusted release`);
  assert.ok(report.touchInput.events.some(e=>e.type==='pointerup'),
   `${label}: no trusted pointer release`);
  assert.ok(Math.abs(r.observedWallMs-r.simulatedMs-report.droppedMs-r.remainingLagMs)<1,
   `${label}: wall time does not reconcile`);
  assert.ok(Math.abs(report.droppedMs-r.longStallDroppedMs-r.backlogDroppedMs)<1e-4,
   `${label}: dropped-time causes do not reconcile`);
  assert.ok(r.controlledLongGaps>=3,`${label}: controlled gaps not delivered`);
  assert.ok((r.stepCounts[String(steps)]||0)>0,`${label}: catch-up ceiling not exercised`);
 }
 assert.equal(control.initialFingerprint,candidate.initialFingerprint,
  'browser arms did not begin from identical world');
 // The same seeded world is necessary but not sufficient: compare the
 // browser-delivered touch event identities and relative delivery times.
 const touchSignature=report=>report.touchInput.events.map(e=>
  e.type+':'+e.pointerId);
 const controlSignature=touchSignature(control),candidateSignature=touchSignature(candidate);
 const sameTouchSequence=JSON.stringify(controlSignature)===JSON.stringify(candidateSignature);
 const touchTimingDeltasMs=sameTouchSequence?control.touchInput.events.map((e,i)=>
  candidate.touchInput.events[i].relativeWallMs-e.relativeWallMs):[];
 const maxAbsTouchTimingDeltaMs=sameTouchSequence?
  Math.max(0,...touchTimingDeltasMs.map(Math.abs)):null;
 const maxTouchPositionDeltaPx=sameTouchSequence?Math.max(0,
  ...control.touchInput.events.map((e,i)=>Math.hypot(
   e.x-candidate.touchInput.events[i].x,
   e.y-candidate.touchInput.events[i].y))):null;
 const arm=(report)=>{
  const r=report.raf;
  return {steps:report.configuredMaxSteps,wallMs:r.observedWallMs,
   presentationHz:r.presentationHz,updates:report.ticks,
   nativeRafSkipped:r.nativeRafSkipped,
   skippedNativeRafsPerDeliveredFrame:r.nativeRafSkipped/r.frames,
   droppedMs:report.droppedMs,backlogLossMs:r.backlogDroppedMs,
   longStallLossMs:r.longStallDroppedMs,
   activeWallMs:r.observedWallMs-r.longStallWallMs,
   backlogLossMsPerActiveSecond:1000*r.backlogDroppedMs/
    (r.observedWallMs-r.longStallWallMs),
   backlogLossMsPerSecond:1000*r.backlogDroppedMs/r.observedWallMs,
   longStallLossMsPerSecond:1000*r.longStallDroppedMs/r.observedWallMs,
   queuedMs:r.remainingLagMs,
   touchToProjectileBirthMs:report.touchToProjectileBirthMs,
   volleyEventsBeforeRelease:report.releaseTelemetry.volleyEventsBeforeRelease,
   volleyEventsAfterRelease:report.releaseTelemetry.volleyEventsAfterRelease,
   lastPreReleaseBirthAgeMs:report.releaseTelemetry.lastPreReleaseBirthAgeMs,
   touchToCanvasSubmissionMs:report.touchToCanvasSubmissionMs,
   callbackP95Ms:r.callbackJs.p95,
   updateP95Ms:report.updates.p95,renderP95Ms:report.renders.p95};
 };
 const a=arm(control),b=arm(candidate);
 const durationRatio=Math.max(a.wallMs,b.wallMs)/Math.min(a.wallMs,b.wallMs);
 return {initialFingerprint:control.initialFingerprint,control:a,candidate:b,
  durationRatio,matchedObservationDuration:durationRatio<=1.05,
  sameTouchSequence,maxAbsTouchTimingDeltaMs,maxTouchPositionDeltaPx,
  matchedTouchTiming:sameTouchSequence&&maxAbsTouchTimingDeltaMs<=20,
  matchedTouchGeometry:sameTouchSequence&&maxTouchPositionDeltaPx<=1,
  comparableTouchDelivery:sameTouchSequence&&maxAbsTouchTimingDeltaMs<=20&&
   maxTouchPositionDeltaPx<=1,
  causalClaimAllowed:false,
  interpretation:'Descriptive browser observations only: even matched event sequences and delivery times do not establish equal combat trajectories, input-to-photon latency or device CPU safety.'};
}
if(require.main===module){
 assert.equal(process.argv.length,4,'usage: node fixed60-paired-report.cjs two.json three.json');
 const result=summarize(...process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p,'utf8'))));
 console.log('NOVA_FIXED60_PAIRED_BROWSER_REPORT '+JSON.stringify(result));
}
module.exports={summarize};
