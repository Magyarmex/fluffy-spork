'use strict';
/* Research acceptance only: no fixed balance golden values or player efficacy claims. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('Tempest heat-band feedback executes actual composed Game without redline',()=>{
 const runner=path.resolve(__dirname,'../research/tempest-heat-band-feedback.cjs');
 const report=JSON.parse(execFileSync(process.execPath,[runner],{
  cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024
 }));
 assert.equal(report.duration,20);
 assert.equal(report.results.length,24);
 for(const reload of [4,8])for(const schedule of ['native30','native60','native120','irregular']){
  const rows=report.results.filter(r=>r.reload===reload&&r.schedule===schedule);
  assert.equal(rows.length,3);
  const continuous=rows.find(r=>r.policy==='continuous');
  const bands=rows.filter(r=>r.policy==='bandWide'||r.policy==='bandTight');
  assert.ok(continuous&&bands.length===2);
  for(const row of rows){
   assert.ok(row.frames>0&&row.volleys>0);
   assert.equal(row.worldLeaks,0,'isolated combat must not silently repopulate shapes or AI');
   assert.ok(row.apexVolleys<=row.volleys&&row.redlineVolleys<=row.volleys);
   assert.ok(row.peakHeat>=row.lastHeat&&row.peakHeat<=1.18+1e-6);
   assert.ok(Math.abs(row.fireSeconds+row.ventSeconds-20)<1e-3);
   assert.ok(row.bandSeconds>=0&&row.bandSeconds<=20);
   assert.ok(Number.isFinite(row.heatIntegral)&&Number.isFinite(row.spinIntegral));
  }
  assert.equal(continuous.ventSeconds,0);
  for(const band of bands){
   assert.equal(band.redlineVolleys,0,'feedback policy should not cross redline');
   assert.ok(band.peakHeat<.9,'feedback policy should stay below redline');
   assert.ok(band.vents>0,'feedback must actually cycle, not merely fire continuously');
   assert.ok(band.apexVolleys>0,'feedback must reach the actual Tempest Apex band');
  }
 }
 console.log('TEMPEST_HEATBAND_FEEDBACK '+JSON.stringify(report.results));
});
