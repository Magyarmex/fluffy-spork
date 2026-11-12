'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare}=require('../research/fixed60-pose-paired-report.cjs');
function report(enabled){
 return {pose:{enabled,frames:enabled?20:0,interpolated:enabled?9:0,
   shiftedBulletFrames:enabled?4:0,teleportSkips:0,
   renderJs:{p95:enabled?2.3:null}},
  initialFingerprint:'1234abcd:1500',configuredMaxSteps:3,
  backlogExtraTicks:2,controlledGate:true,productionRafActive:false,
  births:5,droppedMs:0,renders:{p95:2},raf:{frames:20,callbackJs:{p95:3}},
  touchToCanvasSubmissionMs:17};
}
test('paired pose report requires identical seeded world and exact owner policy',()=>{
 const off=report(false),on=report(true),out=compare(off,on);
 assert.equal(out.researchOnly,true);
 assert.equal(out.causalPerformanceComparison,false);
 assert.equal(out.on.interpolated,9);
 assert.equal(out.on.shiftedBulletFrames,4);
 on.configuredMaxSteps=4;
 assert.throws(()=>compare(off,on),/configuredMaxSteps/);
 on.configuredMaxSteps=3;on.initialFingerprint='abcd1234:1500';
 assert.throws(()=>compare(off,on),/seeded materialized Game/);
});
test('pose comparator refuses absent visual evidence and mislabeled OFF arms',()=>{
 const off=report(false),on=report(true);
 on.pose.interpolated=0;
 assert.throws(()=>compare(off,on),/actual interpolation/);
 on.pose.interpolated=9;off.pose.enabled=true;
 assert.throws(()=>compare(off,on),/OFF control/);
});
