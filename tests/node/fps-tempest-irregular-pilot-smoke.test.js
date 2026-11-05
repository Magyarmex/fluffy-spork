'use strict';
/* Run irregular cadence research in CI against the real composed game.
 * Only assert harness integrity and established 60Hz references; native30
 * underfire is a known bug, not a golden to preserve. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('Tempest irregular-frame research measures equal simulated time across legal reload builds',()=>{
 const file=path.resolve(__dirname,'../research/tempest-irregular-cadence-pilot.cjs');
 const raw=execFileSync(process.execPath,[file],{
  cwd:path.resolve(__dirname,'../..'),
  env:{...process.env,NOVA_JITTER_SEEDS:'1517800',NOVA_JITTER_RELOAD:'0,4,8'},
  encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024
 });
 const report=JSON.parse(raw);
 assert.equal(report.results.length,27);
 const expected60=new Map([[0,153],[4,163],[8,236]]);
 for(const [reload,reference] of expected60){
  const cohort=report.results.filter(row=>row.reload===reload);
  assert.equal(cohort.length,9);
  const byName=new Map(cohort.map(row=>[row.name,row]));
  assert.equal(byName.get('native60').volleys,reference);
  assert.equal(byName.get('native30').frames,240);
  assert.equal(byName.get('native60').frames,480);
  assert.equal(byName.get('native120').frames,960);
  for(const row of cohort){
   assert.equal(row.seed,1517800);
   assert.ok(row.volleys>0);
   assert.ok(Number.isFinite(row.heat)&&Number.isFinite(row.fireCd));
   assert.equal(row.deltaVs60,row.volleys-reference);
   assert.ok(row.firstShots.length>0&&row.lastShots.length>0);
   assert.equal(row.firstShotAngles.length,row.firstShots.length);
   assert.equal(row.firstShotHeats.length,row.firstShots.length);
   assert.ok(row.firstShotAngles.every(Number.isFinite));
   assert.ok(row.firstShotHeats.every(Number.isFinite));
  }
  for(const name of ['mixedSlow','mixedFast','bursty','alternating','aliasFast','aliasSlow'])
   assert.equal(byName.get(name).frames,480,'jitter must match 60Hz mean frame frequency');
 }
 console.log('Tempest irregular cadence research:',JSON.stringify(report.results.map(
  ({reload,name,frames,volleys,deltaVs60,heat,peakHeat})=>
   ({reload,name,frames,volleys,deltaVs60,heat,peakHeat}))));
});
