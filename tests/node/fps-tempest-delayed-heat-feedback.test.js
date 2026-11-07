'use strict';
// Research-only #648: latency is applied to observed heat, not game input.
// No gameplay defaults or 60Hz balance values are changed.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('Tempest delayed heat feedback stays isolated and compares matched policies',()=>{
 const runner=path.resolve(__dirname,'../research/tempest-heat-band-feedback.cjs');
 const report=JSON.parse(execFileSync(process.execPath,[runner],{
  cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:120000,
  maxBuffer:3*1024*1024,env:{...process.env,NOVA_HEAT_DELAY_PILOT:'1'}
 }));
 assert.equal(report.duration,20);
 assert.equal(report.results.length,56);
 for(const reload of [4,8])for(const schedule of ['native30','native60','native120','irregular']){
  const rows=report.results.filter(r=>r.reload===reload&&r.schedule===schedule);
  assert.equal(rows.length,7);
  const perfect=rows.find(r=>r.policy==='bandWide');
  const delayed=rows.filter(r=>r.observationDelayMs>0);
  assert.ok(perfect);
  assert.equal(delayed.length,4);
  assert.equal(delayed.filter(r=>r.observationKind==='eightBinHeatArc').length,2);
  assert.equal(perfect.observationDelayMs,0);
  assert.equal(perfect.delayedSamples,0);
  for(const row of delayed){
   assert.ok([100,200].includes(row.observationDelayMs));
   assert.ok(['exactHeat','eightBinHeatArc'].includes(row.observationKind));
   assert.equal(row.worldLeaks,0,JSON.stringify(row.firstLeak));
   assert.ok(row.delayedSamples>0);
   assert.ok(row.maxHeatObservationError>0,
    'lagged observations must differ from current heat at least once');
   assert.ok(row.volleys>0&&row.vents>0);
   assert.ok(row.apexVolleys<=row.volleys);
   assert.ok(row.redlineVolleys<=row.volleys);
   assert.ok(row.peakHeat<=1.18+1e-6);
   assert.ok(row.apexSeconds>=0&&row.apexSeconds<=20);
   assert.ok(row.redlineSeconds>=0&&row.redlineSeconds<=20);
   assert.ok(Number.isFinite(row.stabilityIntegral));
   assert.ok(Math.abs(row.fireSeconds+row.ventSeconds-20)<1e-3);
   assert.ok(Number.isFinite(row.spinIntegral));
  }
 }
 console.log('TEMPEST_DELAYED_HEAT_FEEDBACK '+JSON.stringify(report.results.filter(r=>r.observationDelayMs)));
});
