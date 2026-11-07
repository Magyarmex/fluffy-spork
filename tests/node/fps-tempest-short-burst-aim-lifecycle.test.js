'use strict';
/* Isolated Game input comparison, NOT a browser pointer lifecycle test. */
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
 test('Tempest '+pattern+' held aim vs touch-style aim release preserves isolated shot chronology',()=>{
  const held=run(pattern,'held'),released=run(pattern,'release');
  assert.equal(held.length,2);assert.equal(released.length,2);
  for(let i=0;i<held.length;i++){
   assert.equal(held[i].name,released[i].name);
   assert.equal(released[i].aimMode,'release');
   for(const key of ['volleys','restVolleys','firingTicks','restTicks',
    'baseCadenceEligibleVolleys','tempestApexBoostVolleys',
    'tempestRedlinePenaltyVolleys','heat','peakHeat','minimumHeat',
    'fireCd','finalSpin','firstShots','lastShots','restHeatWindows','restSpinWindows']){
    assert.deepEqual(released[i][key],held[i][key],key+' should match');
   }
  }
 });
}
