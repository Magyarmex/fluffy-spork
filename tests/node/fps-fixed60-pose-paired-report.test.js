'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare,compareTriple}=require('../research/fixed60-pose-paired-report.cjs');
function report(enabled){
 return {pose:{enabled,frames:enabled?60:0,interpolated:enabled?9:0,
   shiftedBulletFrames:enabled?4:0,teleportSkips:0,
   renderJs:{p95:enabled?2.3:null}},
  initialFingerprint:'1234abcd:1500',configuredMaxSteps:3,
  backlogExtraTicks:2,controlledGate:true,productionRafActive:false,
  births:5,ticks:120,droppedMs:0,updates:{p95:1.2},renders:{p95:2},
  raf:{frames:60,observedWallMs:2000,simulatedMs:2000,remainingLagMs:0,
   callbackJs:{p95:3}},
  touchToCanvasSubmissionMs:17};
}
test('paired pose report requires identical seeded world and exact owner policy',()=>{
 const off=report(false),on=report(true),out=compare(off,on);
 assert.equal(out.researchOnly,true);
 assert.equal(out.causalPerformanceComparison,false);
 assert.equal(out.on.interpolated,9);
 assert.equal(out.on.shiftedBulletFrames,4);
 assert.deepEqual(out.off.exposure,{ticks:120,wallMs:2000,simulatedMs:2000,
  queuedMs:0,droppedMs:0,conservationErrorMs:0});
 assert.deepEqual(out.on.exposure,out.off.exposure);
 on.configuredMaxSteps=4;
 assert.throws(()=>compare(off,on),/configuredMaxSteps/);
 on.configuredMaxSteps=3;on.initialFingerprint='abcd1234:1500';
 assert.throws(()=>compare(off,on),/seeded materialized Game/);
});
test('pose comparator refuses absent visual evidence and mislabeled OFF arms',()=>{
 const off=report(false),on=report(true);
 on.pose.interpolated=0;
 assert.throws(()=>compare(off,on),/actual interpolation/);
 on.pose.interpolated=9;on.pose.shiftedBulletFrames=0;
 assert.throws(()=>compare(off,on),/projectile at an interpolated pose/);
 on.pose.shiftedBulletFrames=4;off.pose.enabled=true;
 assert.throws(()=>compare(off,on),/OFF control/);
});

test('paired pose report refuses missing or contradictory RAF exposure',()=>{
 const off=report(false),on=report(true);
 on.ticks=undefined;
 assert.throws(()=>compare(off,on),/authoritative tick count/);
 on.ticks=120;on.raf.simulatedMs=1980;on.raf.remainingLagMs=20;
 assert.throws(()=>compare(off,on),/authoritative tick count/);
 on.raf.simulatedMs=2000;on.raf.remainingLagMs=0;
 on.raf.observedWallMs=2200;
 assert.throws(()=>compare(off,on),/time accounting is inconsistent/);
 on.raf.observedWallMs=2000;
 // Sequential arms may have different valid exposure; disclose it instead
 // of pretending equal wall time or claiming causal performance gains.
 on.ticks=119;on.raf.simulatedMs=119*1000/60;
 on.raf.remainingLagMs=1000/60;
 const result=compare(off,on);
 assert.equal(result.off.exposure.ticks,120);
 assert.equal(result.on.exposure.ticks,119);
 assert.equal(result.causalPerformanceComparison,false);
});

function report90(enabled){
 const r=report(enabled);
 r.configuredMaxSteps=2;r.backlogExtraTicks=2;r.presentationTargetHz=90;
 r.raf.activePresentationHz=90;r.raf.activeIntervals={p95:11.2,n:59};
 r.raf.intervals={p95:11.2,n:59};
 r.blankRaf={frames:160,hz:90,p95:11.2,supports90Hz:true};
 r.rafHostCapable=true;
 return r;
}
test('90Hz OFF/OFF/ON report requires three matched materialized worlds and bounded callback cadence',()=>{
 const offA=report90(false),offB=report90(false),on=report90(true);
 const out=compareTriple(offA,offB,on);
 assert.equal(out.targetPresentationHz,90);
 assert.deepEqual(out.activePresentationHz,{offA:90,offB:90,on:90});
 assert.equal(out.offRepeat.ticks,120);
 assert.equal(out.offRepeat.births,5);
 assert.equal(offA.pose.frames,0);
 assert.equal(out.on.interpolated,9);
 assert.equal(out.causalPerformanceComparison,false);
 offB.initialFingerprint='deadbeef:1500';
 assert.throws(()=>compareTriple(offA,offB,on),/same seeded materialized Game/);
 offB.initialFingerprint=offA.initialFingerprint;
 on.raf.activePresentationHz=72;
 assert.throws(()=>compareTriple(offA,offB,on),/near-90Hz active callbacks/);
 on.raf.activePresentationHz=90;on.raf.activeIntervals.p95=16;
 assert.throws(()=>compareTriple(offA,offB,on),/active callback p95/);
});


test('90Hz paired report marks a host-limited blank RAF control inconclusive, never passed',()=>{
 const offA=report90(false),offB=report90(false),on=report90(true);
 for(const arm of [offA,offB,on]){
  arm.blankRaf={frames:70,hz:41.2,p95:24.3,supports90Hz:false};
  arm.rafHostCapable=false;
  arm.raf.activePresentationHz=41.2;
  arm.raf.activeIntervals={p95:24.3,n:59};
 }
 const out=compareTriple(offA,offB,on);
 assert.equal(out.status,'inconclusive-host-raf-capability');
 assert.equal(out.gatePassed,false);
 assert.equal(out.inconclusive,true);
 assert.equal(out.gameRaf.ON.activePresentationHz,41.2);
 assert.equal(out.blankRaf['OFF-A'].supports90Hz,false);
});
