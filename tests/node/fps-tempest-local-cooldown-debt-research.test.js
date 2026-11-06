'use strict';
/* Permanent research integrity gate; never pin the known-wrong 30Hz cadence
 * as a production acceptance criterion. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {experiment,schedule}=require('../research/tempest-local-cooldown-debt-pilot.cjs');
test('local cooldown-debt hypothesis runs on actual composed Tempest without rewriting production',()=>{
 const report=experiment();
 assert.equal(report.researchOnly,true);
 assert.equal(report.productionModified,false);
 assert.equal(report.rows.length,30);
 for(const row of report.rows){
  assert.equal(row.simulatedTicks,960);
  assert.ok(row.frames>0);
  for(const arm of [row.baseline,row.candidate]){
   assert.ok(Number.isFinite(arm.volleys)&&arm.volleys>0);
   assert.ok(Number.isFinite(arm.firstShot));
   assert.ok(Number.isFinite(arm.heat)&&Number.isFinite(arm.fireCd));
   assert.ok(Number.isFinite(arm.peakHeat)&&Number.isFinite(arm.carriedMs));
   assert.ok(arm.negativeAfterShot>=0);
  }
  assert.equal(row.baseline.carriedMs,0);
  assert.equal(row.baseline.negativeAfterShot,0);
  assert.equal(row.deltaVolleys,row.candidate.volleys-row.baseline.volleys);
  assert.ok(row.candidate.volleys<=row.frames,'one Game.update cannot fire more than one Tempest volley');
  assert.equal(row.candidate.firstShot,row.baseline.firstShot,
   'debt pilot must not pre-fire or change the first real volley');
  assert.ok(row.candidate.carriedMs>=0);
 }
 const ref=new Map([[0,153],[4,163],[8,236]]);
 for(const [reload,volleys] of ref){
  const row=report.rows.find(r=>r.seed===1517800&&r.reload===reload&&r.name==='native60');
  assert.equal(row.baseline.volleys,volleys,'unchanged real-game 60Hz reference');
 }
 assert.equal(schedule([4]).length,240);
 assert.equal(schedule([2]).length,480);
 console.log('TEMPest cooldown-debt research:',JSON.stringify(report.rows.filter(r=>r.seed===1517800&&['native30','native60','native120'].includes(r.name)).map(r=>({reload:r.reload,mode:r.name,baseline:r.baseline.volleys,carry:r.candidate.volleys,heatBaseline:r.baseline.heat,heatCarry:r.candidate.heat,carriedMs:r.candidate.carriedMs}))));
 // This pilot measures possible throughput differences, not an authorization
 // to assert that higher volley counts mean better balance or player value.
});
