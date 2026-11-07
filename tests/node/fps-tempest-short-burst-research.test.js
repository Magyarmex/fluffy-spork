'use strict';
/* Research-only: short Tempest firing rhythms in the actual composed game.
 * These are not balance golden values or touch-input latency claims. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const runner=path.resolve(__dirname,'../research/tempest-irregular-cadence-pilot.cjs');
for(const [pattern,on,off,expectedFireTicks,completeRests] of [
 ['burst250ms',30,90,240,8],
 ['burst200ms',24,60,288,11]
]){
 test('Tempest '+pattern+' maintains exact input duty and cools during rests',()=>{
  const report=JSON.parse(execFileSync(process.execPath,[runner],{
   cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:120000,
   maxBuffer:2*1024*1024,
   env:{...process.env,NOVA_JITTER_FIRE_PATTERN:pattern,
    NOVA_JITTER_SEEDS:'1517800',NOVA_JITTER_RELOAD:'0,4,8',
    NOVA_JITTER_PHASES:'0',
    NOVA_JITTER_PATTERNS:'native30,native60,native120,boundaryCross'}
  }));
  assert.equal(report.firePattern,pattern);
  assert.equal(report.results.length,12);
  for(const row of report.results){
   assert.deepEqual(row.burstTicks,{on,off});
   assert.equal(row.simulatedTicks,960);
   assert.equal(row.firingTicks,expectedFireTicks);
   assert.equal(row.restTicks,960-expectedFireTicks);
   assert.equal(row.restVolleys,0,'released firing input cannot emit volleys');
   assert.equal(row.restHeatWindows.length,completeRests);
   assert.ok(row.updateCalls>=row.frames);
   assert.equal(row.extraInputBoundaryUpdates,row.updateCalls-row.frames);
   assert.ok(row.volleys>0);
   assert.ok(row.minimumHeat<=row.peakHeat);
   assert.ok(row.restHeatWindows.every(w=>Number.isFinite(w.drop)&&w.drop>=-0.000002));
   assert.ok(row.baseCadenceEligibleVolleys<=row.volleys);
   assert.ok(row.tempestApexBoostVolleys<=row.volleys);
   assert.ok(row.tempestRedlinePenaltyVolleys<=row.volleys);
  }
  for(const reload of [0,4,8]){
   const rows=report.results.filter(r=>r.reload===reload);
   assert.equal(rows.length,4);
   assert.ok(rows.find(r=>r.name==='boundaryCross').extraInputBoundaryUpdates>0,
    'adversarial schedule must cross an input boundary');
   assert.ok(rows.find(r=>r.name==='native60').restHeatWindows.some(w=>w.drop>0),
    'at least one rest must actually dissipate heat');
  }
  console.log('TEMPEST_SHORT_BURST_RESEARCH '+JSON.stringify(report.results.map(r=>({
   pattern,reload:r.reload,schedule:r.name,volleys:r.volleys,
   heat:r.heat,peakHeat:r.peakHeat,apexBoost:r.tempestApexBoostVolleys,
   redline:r.tempestRedlinePenaltyVolleys,restHeatDrops:r.restHeatWindows.map(w=>w.drop)
  }))));
 });
}
