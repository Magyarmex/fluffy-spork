'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare}=require('../research/fixed60-pose-paired-report.cjs');
function report(enabled){
 return {pose:{enabled,frames:enabled?20:0,interpolated:enabled?9:0,
   shiftedBulletFrames:enabled?4:0,teleportSkips:0,
   renderJs:{p95:enabled?2.3:null}},
  initialFingerprint:'1234abcd:1500',configuredMaxSteps:3,
  backlogExtraTicks:2,controlledGate:true,productionRafActive:false,
  births:5,ticks:120,droppedMs:0,updates:{p95:1.2},renders:{p95:2},
  raf:{frames:20,observedWallMs:2000,simulatedMs:2000,remainingLagMs:0,
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
 on.ticks=120;on.raf.observedWallMs=2200;
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
