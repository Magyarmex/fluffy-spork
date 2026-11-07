'use strict';
/* Research gate: real composed Game, legal Tempest builds, burst-fire input.
 * Do not turn a known variable-step cadence deficit into a golden. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
test('Tempest 1s-on/1s-off cadence preserves input duty and exposes heat recovery',()=>{
 const raw=execFileSync(process.execPath,
  [path.resolve(__dirname,'../research/tempest-irregular-cadence-pilot.cjs')],{
   cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:120000,
   maxBuffer:2*1024*1024,
   env:{...process.env,NOVA_JITTER_FIRE_PATTERN:'burst1s',
    NOVA_JITTER_SEEDS:'1517800',NOVA_JITTER_RELOAD:'0,4,8',
    NOVA_JITTER_PHASES:'0'}
  });
 const report=JSON.parse(raw);
 assert.equal(report.firePattern,'burst1s');
 assert.equal(report.results.length,30);
 for(const row of report.results){
  assert.equal(row.firePattern,'burst1s');
  assert.equal(row.simulatedTicks,960);
  assert.ok(row.updateCalls>=row.frames);
  assert.equal(row.extraInputBoundaryUpdates,row.updateCalls-row.frames);
  assert.equal(row.firingTicks,480);
  assert.equal(row.restTicks,480);
  assert.equal(row.restHeatWindows.length,4,'four complete one-second cooling windows');
  for(const window of row.restHeatWindows){
   assert.ok(Number.isFinite(window.start)&&Number.isFinite(window.end));
   assert.ok(Number.isFinite(window.drop));
   assert.ok(Math.abs((window.start-window.end)-window.drop)<0.000002);
  }
  assert.ok(row.volleys>0);
  assert.equal(row.restVolleys,0,'release of fire input must prevent volleys during rest');
  assert.ok(Number.isInteger(row.baseCadenceEligibleVolleys)&&row.cadenceEligibleVolleys>=0&&row.cadenceEligibleVolleys<=row.volleys);
  assert.ok(Number.isInteger(row.tempestApexBoostVolleys)&&row.tempestApexBoostVolleys>=0&&row.tempestApexBoostVolleys<=row.volleys);
  assert.ok(Number.isInteger(row.tempestRedlinePenaltyVolleys)&&row.tempestRedlinePenaltyVolleys>=0&&row.tempestRedlinePenaltyVolleys<=row.volleys);
  assert.ok(Number.isFinite(row.minimumHeat)&&Number.isFinite(row.peakHeat));
  assert.ok(row.minimumHeat<=row.peakHeat);
  assert.ok(Number.isFinite(row.heat)&&Number.isFinite(row.fireCd));
  assert.ok(row.firstShots.length>0&&row.lastShots.length>0);
 }
 for(const reload of [0,4,8]){
  const cohort=report.results.filter(row=>row.reload===reload);
  assert.equal(cohort.length,10);
  assert.ok(cohort.find(row=>row.name==='boundaryCross').extraInputBoundaryUpdates>0,
   'the boundary-crossing schedule must exercise sub-frame input splitting');
  assert.equal(cohort.find(row=>row.name==='native60').frames,480);
  assert.equal(cohort.find(row=>row.name==='native30').frames,240);
  assert.equal(cohort.find(row=>row.name==='native120').frames,960);
  assert.ok(cohort.find(row=>row.name==='native60').restHeatWindows.some(w=>w.drop>0.2),
   'a full one-second firing rest must materially cool the gunner');
 }
});
