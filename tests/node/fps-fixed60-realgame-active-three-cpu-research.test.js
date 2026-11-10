'use strict';
/* Research only: measure REAL composed Game.update and Canvas renderer CPU
 * under the opt-in active-three-step catch-up policy. Node wall-clock CPU is
 * not Chromium paint, Android thermal performance, or touch-to-photon delay.
 * No production RAF, weapons, input handlers, or materializer are modified. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,frameTimes}=require('../research/fps-20hz-scheduler-pilot.cjs');
const classes=['minigun','carrier'],seeds=[1517800,1517802];
function sameWorld(actual,reference,label){
 for(const field of ['updates','hash','draws','volleys'])
  assert.equal(actual[field],reference[field],label+' '+field);
}
test('active-three-step preserves real Gunner and Controller world at clustered mean 30Hz',()=>{
 const gaps=frameTimes('30Hz-clustered');
 assert.equal(gaps.length,60);
 assert.ok(gaps.every(x=>x>0&&x<=100));
 assert.ok(Math.abs(gaps.reduce((a,b)=>a+b,0)-2000)<1e-6);
 for(const cls of classes)for(const seed of seeds){
  const options={cls,seed};
  const reference=run({...options,cadence:'60Hz',maxSteps:2});
  const pilot=run({...options,cadence:'30Hz-clustered',maxSteps:2,activeOnlyThree:true});
  assert.equal(reference.updates,120);
  assert.equal(pilot.updates,120);
  assert.equal(pilot.droppedMs,0);
  assert.equal(pilot.peakSteps,3);
  sameWorld(pilot,reference,cls+' '+seed);
 }
});
test('clustered mean-30Hz CPU profile measures full Game updates and Canvas submission',()=>{
 for(const cls of classes){
  const options={cls,seed:1517800,render:true,profileCpu:true};
  const reference=run({...options,cadence:'60Hz',maxSteps:2});
  const pilot=run({...options,cadence:'30Hz-clustered',maxSteps:2,activeOnlyThree:true});
  assert.equal(reference.frameCpuSamples,120);
  assert.equal(pilot.frameCpuSamples,60);
  assert.equal(pilot.threeStepFrameSamples,30);
  assert.equal(pilot.oneStepFrameSamples,30);
  assert.ok(Number.isFinite(pilot.threeStepFrameCpuP95Ms));
  assert.ok(Number.isFinite(pilot.oneStepFrameCpuP95Ms));
  assert.equal(pilot.updates,reference.updates);
  assert.equal(pilot.droppedMs,0);
  for(const arm of [reference,pilot]){
   for(const field of ['frameCpuP50Ms','frameCpuP95Ms','frameCpuP99Ms',
    'frameCpuPeakMs','frameUpdateCpuP95Ms','frameRenderCpuP95Ms']){
    assert.ok(Number.isFinite(arm[field])&&arm[field]>=0,cls+' '+field);
   }
   assert.ok(arm.frameCpuP50Ms<=arm.frameCpuP95Ms);
   assert.ok(arm.frameCpuP95Ms<=arm.frameCpuP99Ms);
   assert.ok(arm.frameCpuP99Ms<=arm.frameCpuPeakMs);
  }
  // Render instrumentation is observational: the world must remain identical
  // across matched simulation schedules. Never assert CPU time is below an
  // arbitrary threshold on shared CI runners.
  sameWorld(pilot,reference,cls+' rendered');
  console.log('REAL_GAME_ACTIVE_THREE_CPU '+JSON.stringify({
   cls,reference:{frames:reference.frameCpuSamples,updateP95:reference.frameUpdateCpuP95Ms,
    renderP95:reference.frameRenderCpuP95Ms,frameP95:reference.frameCpuP95Ms},
   clustered:{frames:pilot.frameCpuSamples,peakSteps:pilot.peakSteps,
    updateP95:pilot.frameUpdateCpuP95Ms,renderP95:pilot.frameRenderCpuP95Ms,
    frameP95:pilot.frameCpuP95Ms,framePeak:pilot.frameCpuPeakMs,
    threeStepP95:pilot.threeStepFrameCpuP95Ms,
    oneStepP95:pilot.oneStepFrameCpuP95Ms}
  }));
 }
});
test('active three-step remains bounded and is not universal mean-30Hz recovery',()=>{
 const gaps=frameTimes('30Hz-adversarial');
 assert.equal(gaps.length,60);
 assert.ok(gaps.every(x=>x>0&&x<=100));
 assert.ok(Math.abs(gaps.reduce((a,b)=>a+b,0)-2000)<1e-6);
 const ref=run({cls:'minigun',seed:1517800,cadence:'60Hz',maxSteps:2});
 const candidate=run({cls:'minigun',seed:1517800,cadence:'30Hz-adversarial',
  maxSteps:2,activeOnlyThree:true});
 assert.ok(candidate.peakSteps<=3);
 assert.ok(candidate.updates<=ref.updates);
 assert.ok(candidate.droppedMs>=0);
 // A future improvement is allowed to recover ALL time; do not freeze
 // today's known dropped-tick behavior as a desired golden.
 if(candidate.droppedMs>0)assert.ok(candidate.updates<ref.updates);
 console.log('REAL_GAME_ACTIVE_THREE_LIMIT '+JSON.stringify({
  referenceUpdates:ref.updates,candidateUpdates:candidate.updates,
  droppedMs:candidate.droppedMs,peakSteps:candidate.peakSteps
 }));
});
