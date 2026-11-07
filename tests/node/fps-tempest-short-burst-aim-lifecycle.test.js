'use strict';
/* Isolated Game aim-state comparison, NOT a DOM pointer lifecycle test.
 * A released stick can stop turret settling and change stability, so
 * chronological firing parity must be observed rather than assumed. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const runner=path.resolve(__dirname,'../research/tempest-irregular-cadence-pilot.cjs');
function run(pattern,aimMode){
 return JSON.parse(execFileSync(process.execPath,[runner],{
  cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:120000,
  maxBuffer:2*1024*1024,
  env:{...process.env,NOVA_JITTER_FIRE_PATTERN:pattern,NOVA_JITTER_AIM_MODE:aimMode,
   NOVA_JITTER_SEEDS:'1517800',NOVA_JITTER_RELOAD:'4',NOVA_JITTER_PHASES:'0',
   NOVA_JITTER_PATTERNS:'native60,boundaryCross'}
 })).results;
}
for(const pattern of ['burst250ms','burst200ms']){
 test('Tempest '+pattern+' compares held aim and touch-style aim release safely',()=>{
  const held=run(pattern,'held'),released=run(pattern,'release');
  assert.equal(held.length,2);assert.equal(released.length,2);
  for(let i=0;i<held.length;i++){
   const a=held[i],b=released[i];
   assert.equal(a.name,b.name);
   assert.equal(a.aimMode,'held');assert.equal(b.aimMode,'release');
   assert.equal(a.simulatedTicks,960);assert.equal(b.simulatedTicks,960);
   assert.equal(a.firingTicks,b.firingTicks);
   assert.equal(a.restTicks,b.restTicks);
   assert.equal(a.restVolleys,0);assert.equal(b.restVolleys,0);
   assert.ok(a.volleys>0&&b.volleys>0);
   assert.equal(a.restHeatWindows.length,b.restHeatWindows.length);
   assert.equal(a.restSpinWindows.length,b.restSpinWindows.length);
   assert.ok(b.restSpinWindows.every(w=>w.drop>=-0.000002));
   assert.ok(Number.isFinite(b.heat)&&Number.isFinite(b.fireCd));
   console.log('TEMPEST_AIM_RELEASE_RESEARCH '+JSON.stringify({
    pattern,schedule:a.name,heldVolleys:a.volleys,releasedVolleys:b.volleys,
    heldApex:a.tempestApexBoostVolleys,releasedApex:b.tempestApexBoostVolleys,
    heldHeat:a.heat,releasedHeat:b.heat,
    heldSpin:a.finalSpin,releasedSpin:b.finalSpin
   }));
  }
 });
}
