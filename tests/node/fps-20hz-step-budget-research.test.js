'use strict';
/* Real composed NOVA Game. 20Hz presentation is not a reason to let the
 * simulation run in slow motion; however, 3 steps/frame are insufficient
 * under ordinary 48/52ms jitter. Research only; do not enable in production
 * without mobile CPU, input-to-photon, and interpolation acceptance. */
const test=require('node:test'),assert=require('node:assert/strict');
const {run,frameTimes}=require('../research/fps-20hz-scheduler-pilot.cjs');
const classes=['tempest','minigun','carrier'];
const seeds=[1517800,1517802];
function parity(a,b,label){
 for(const key of ['updates','hash','draws','volleys'])
  assert.equal(a[key],b[key],label+': '+key);
}
test('20Hz exact presentation requires three 60Hz updates to preserve complete game state',()=>{
 for(const cls of classes)for(const seed of seeds){
  const ref=run({cls,seed,cadence:'60Hz',maxSteps:2});
  const fixed=run({cls,seed,cadence:'20Hz',maxSteps:3});
  const inadequate=run({cls,seed,cadence:'20Hz',maxSteps:2});
  parity(fixed,ref,cls+' '+seed+' exact');
  assert.equal(ref.updates,120);assert.equal(fixed.droppedMs,0);
  assert.equal(inadequate.updates,80);
  assert.ok(inadequate.droppedMs>500,'two-step 20Hz loses real simulation time');
  assert.notEqual(inadequate.hash,ref.hash);
 }
});
test('48/52ms ordinary jitter needs one occasional fourth catch-up step',()=>{
 assert.equal(frameTimes('20Hz-jitter').reduce((a,b)=>a+b,0),2000);
 for(const cls of classes)for(const seed of seeds){
  const ref=run({cls,seed,cadence:'60Hz',maxSteps:2});
  const three=run({cls,seed,cadence:'20Hz-jitter',maxSteps:3});
  const four=run({cls,seed,cadence:'20Hz-jitter',maxSteps:4});
  assert.equal(three.updates,119,cls+': no spare step for ordinary jitter');
  assert.equal(three.droppedMs,0,'a missing step can be retained as lag, not dropped');
  assert.notEqual(three.hash,ref.hash);
  parity(four,ref,cls+' '+seed+' jitter');
  assert.equal(four.droppedMs,0);assert.equal(four.peakSteps,4);
 }
});
test('burst jitter recovers without time loss or physical divergence',()=>{
 for(const cls of classes)for(const seed of seeds){
  const ref=run({cls,seed,cadence:'60Hz',maxSteps:2});
  const recovered=run({cls,seed,cadence:'20Hz-bursts',maxSteps:4});
  parity(recovered,ref,cls+' '+seed+' bursts');
  assert.equal(recovered.droppedMs,0);
 }
});

test('virtual presentation-clock audit isolates three existing rail timebase divergences',()=>{
 const knownRailWallClock=new Set(['railgun','singularity','prism']);
 const all=['marksman','railgun','ghost','singularity','prism','specter','assassin','tempest'];
 const observed=[];
 for(const cls of all){
  const ref=run({cls,seed:1517800,cadence:'60Hz',maxSteps:2,virtualClock:true});
  const recovered=run({cls,seed:1517800,cadence:'20Hz-jitter',maxSteps:4,virtualClock:true});
  for(const key of ['updates','draws','volleys'])assert.equal(recovered[key],ref[key],cls+' '+key);
  if(recovered.hash!==ref.hash)observed.push(cls);
  if(!knownRailWallClock.has(cls))assert.equal(recovered.hash,ref.hash,
   cls+' gained a new wall-clock/presentation-dependent physical divergence');
 }
 // Deliberately do not assert that known rail divergences persist: fixing
 // them should make this research gate greener, not break the test suite.
 assert.ok(observed.every(cls=>knownRailWallClock.has(cls)));
});
