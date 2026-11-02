'use strict';
/* Production 49-overlay Game. At 30Hz the firing update used to discard an
 * extra half of an eligible 60Hz cooling tick. Correct the lost pre-shot
 * slice, not weapon cadence, and preserve all established 60Hz values. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,classes}=require('../research/gunner-heat-30hz-census.cjs');
const seedList=[1517800,1517802,1517810];
for(const seed of seedList){
 test(`30Hz Twin and Minigun cooling approaches established 60Hz (${seed})`,()=>{
  for(const cls of ['twin','minigun']){
   const slow=run(cls,seed,30),ref=run(cls,seed,60);
   assert.equal(slow.volleys,ref.volleys,`${cls} must not gain or lose volleys`);
   assert.ok(Math.abs(slow.heat-ref.heat)<.012,`${cls} heat drift ${slow.heat} vs ${ref.heat}`);
   assert.ok(Math.abs(slow.heatPeak-ref.heatPeak)<1e-8,`${cls} peak heat`);
   assert.equal(slow.stepLeak,0,'simulation-step context must not persist after update');
  }
 });
}
test('coarse cooling correction does not change the 60Hz Gunner baseline',()=>{
 const expected={
  twin:[15,.245,.35866666666666736],minigun:[24,.144,.184],
  shotgun:[5,.16766666666666666,.24],tempest:[73,1.18,1.18],
  needlestorm:[22,.0226,.0546],breachlord:[5,0,.24],flakmaster:[4,0,.24]
 };
 for(const cls of classes){
  const actual=run(cls,1517800,60),[shots,heat,peak]=expected[cls];
  assert.equal(actual.volleys,shots,cls+' volleys');
  assert.ok(Math.abs(actual.heat-heat)<1e-8,cls+' heat');
  assert.ok(Math.abs(actual.heatPeak-peak)<1e-8,cls+' peak');
 }
});
test('cooling correction does not pretend to solve Tempest cadence',()=>{
 const slow=run('tempest',1517800,30),ref=run('tempest',1517800,60);
 assert.equal(slow.volleys,55);assert.equal(ref.volleys,73);
});
test('twelve-second sustained Gunner heat remains bounded at 30Hz',()=>{
 for(const cls of ['twin','minigun']){
  const slow=run(cls,1517800,30,12),ref=run(cls,1517800,60,12);
  assert.equal(slow.volleys,ref.volleys,cls+' sustained volleys');
  assert.ok(Math.abs(slow.heat-ref.heat)<.012,cls+' sustained heat parity');
  assert.ok(Math.abs(slow.heatPeak-ref.heatPeak)<1e-8,cls+' sustained peak heat');
 }
});
