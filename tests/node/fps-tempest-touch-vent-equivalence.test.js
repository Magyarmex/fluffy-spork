'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

test('actual composed Tempest compares released-fire and held-stick centered vents',()=>{
 const runner=path.resolve(__dirname,'../research/tempest-touch-vent-equivalence.cjs');
 const report=JSON.parse(execFileSync(process.execPath,[runner],{
  cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:120000,maxBuffer:3*1024*1024
 }));
 assert.equal(report.duration,20);
 assert.equal(report.results.length,40);
 const deltas=[];
 for(const reload of [4,8])for(const schedule of ['native30','native60','native120','irregular']){
  const rows=report.results.filter(r=>r.reload===reload&&r.schedule===schedule);
  assert.equal(rows.length,5);
  for(const row of rows){
   assert.equal(row.worldLeaks,0,'combat leak: '+JSON.stringify(row.firstLeak));
   assert.ok(row.volleys>0&&row.apexVolleys<=row.volleys);
   assert.ok(Math.abs(row.fireSeconds+row.ventSeconds-20)<1e-3);
   assert.ok(Number.isFinite(row.heatIntegral)&&Number.isFinite(row.spinIntegral));
  }
  for(const kind of ['bandWide','bandTight']){
   const released=rows.find(r=>r.policy===kind);
   const held=rows.find(r=>r.policy===kind+'Held');
   assert.ok(released&&held);
   assert.ok(released.vents>0&&held.vents>0);
   assert.equal(released.heldFiringVentSeconds,0);
   assert.ok(Math.abs(held.heldFiringVentSeconds-held.ventSeconds)<1e-3);
   deltas.push({reload,schedule,kind,volleys:held.volleys-released.volleys,
    apex:held.apexVolleys-released.apexVolleys,
    redline:held.redlineVolleys-released.redlineVolleys,
    spin:+(held.spinIntegral-released.spinIntegral).toFixed(5),
    heat:+(held.heatIntegral-released.heatIntegral).toFixed(5)});
  }
 }
 // This is a falsifier, not a golden assertion that the two input paths
 // behave identically. Preserve observed differences for design review.
 console.log('TEMPEST_HELD_VENT_DIFFERENTIAL '+JSON.stringify(deltas));
});
