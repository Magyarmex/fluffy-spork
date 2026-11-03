'use strict';
// #648: verify the actual composed game can reproduce a 60Hz projectile
// chronology when presented at 30Hz, without shipping a new scheduler.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
test('chronological Gunner research reproduces native60 births and state with split60',()=>{
 const script=path.resolve(__dirname,'../research/tempest-chronology-witness.cjs');
 const r=spawnSync(process.execPath,[script],{
  encoding:'utf8',timeout:180000,maxBuffer:1024*1024,
  env:{...process.env,NOVA_OVERLAY_AUDIO_RNG_CAUSAL:'1'}});
 assert.equal(r.error,undefined,r.error&&String(r.error));
 assert.equal(r.status,0,r.stderr||r.stdout);
 const data=JSON.parse(r.stdout);
 assert.equal(data.report.length,6);
 for(const row of data.report){
  assert.equal(row.native60,row.split60);\n  assert.ok(row.referenceIntervalBirths.intervalsWithTwoOrMore>0,\n   'legal Overheat reference must demonstrate multiple births within coarse frames');\n  assert.equal(row.referenceIntervalBirths.maxBirthsInInterval,2);
  assert.equal(row.referenceIntervalBirths.distinctOriginPairs,row.referenceIntervalBirths.intervalsWithTwoOrMore);
  assert.equal(row.referenceIntervalBirths.distinctBirthTimePairs,row.referenceIntervalBirths.intervalsWithTwoOrMore);
  assert.equal(row.referenceRngDraws>=0,true);
  assert.equal(typeof row.referenceBirthHash,'string');
  assert.equal(typeof row.referenceStateHash,'string');
 }
});
