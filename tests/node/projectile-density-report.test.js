'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collect,check}=require('../../scripts/projectile-density-report.cjs');
function density(){
 return {schema:1,bulletUpdateCalls:3,simulatedBulletSeconds:.1,
  projectileCountSum:12,peakProjectiles:9,
  projectileCountBuckets:{zero:1,one:0,two:0,threeToEight:1,
   nineToSixteen:1,seventeenToThirtyTwo:0,thirtyThreePlus:0},
  basicEligibleFrames:1,coverBreaks:2,coverBreaksAtThreeToEight:1,
  coverBreaksAboveEight:1,coverBreaksBasicEligible:1,brokenCounterResets:0};
}
function arm(seed,policy){
 return {metadata:{layout:'CROSSFIRE',seed,pilotPolicy:policy},
  game:{status:'dead'},projectileDensityAudit:density()};
}
test('natural projectile matrix keeps all predeclared pairs, censors and weighted exposure',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-density-'));
 try{
  for(let i=0;i<2;i++){
   const dir=path.join(root,'nova-frontlines-natural-ab-'+i);
   fs.mkdirSync(dir);
   const off=arm('seed'+i,'wander'),on=arm('seed'+i,'wander');
   const report={initialWorldIdentical:true,offReplayIdentical:true,
    off,on,offReplay:JSON.parse(JSON.stringify(off))};
   fs.writeFileSync(path.join(dir,'frontlines-natural-match-ab.json'),JSON.stringify(report));
  }
  const out=collect(root,2);
  assert.equal(out.observedPairs,2);
  assert.equal(out.totals.OFF.bulletUpdateCalls,6);
  assert.equal(out.totals.ON.coverBreaks,4);
  assert.equal(out.totals.ON.basicEligibleFrames,2);
  assert.equal(out.totals.OFF.fractionAboveEight,1/3);
  assert.equal(out.totals.ON.fractionCoverBreaksAtBasicGate,.5);
  assert.equal(out.observations.filter(x=>x.ON.endedEarly).length,2);
  assert.throws(()=>collect(root,3),/incomplete density matrix/);
  const file=path.join(root,'nova-frontlines-natural-ab-1','frontlines-natural-match-ab.json');
  const broken=JSON.parse(fs.readFileSync(file,'utf8'));
  broken.offReplay.game.status='playing';
  fs.writeFileSync(file,JSON.stringify(broken));
  assert.throws(()=>collect(root,2),/paired replay integrity/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('density report refuses invented, inconsistent or absent denominators',()=>{
 const d=density();
 d.projectileCountBuckets.threeToEight=3;
 assert.throws(()=>check(d,'mutant'),/contradictory/);
 const empty=density();empty.bulletUpdateCalls=0;
 assert.throws(()=>check(empty,'mutant'),/contradictory/);
 const invalid=density();invalid.coverBreaksBasicEligible=2;
 assert.throws(()=>check(invalid,'mutant'),/contradictory/);
});

test('pen-one matrix preserves unknown historical fields and rejects partial data',()=>{
 const old=density();
 assert.equal(check(old,'historical'),old);
 const d=density();
 Object.assign(d,{penOneShotInputs:2,penOneExpiringInputs:1,
  penOneFramesWithInputs:2,penOneRawInputs:3,penOneRawExpiringInputs:1,
  penOneMissingDeadInputs:1,
  penOneUnknownKindInputs:0,penOneMissingOrdinaryFlagsInputs:0,penOneWithoutEpochInputs:1,
  penOneScanCensoredFrames:0});
 assert.equal(check(d,'current'),d);
 d.penOneExpiringInputs=3;
 assert.throws(()=>check(d,'invalid'),/contradictory pen-one/);
 d.penOneExpiringInputs=1;
 d.penOneRawInputs=13;
 assert.throws(()=>check(d,'impossible'),/contradictory pen-one/);
 d.penOneRawInputs=3;
 delete d.penOneUnknownKindInputs;
 assert.throws(()=>check(d,'partial'),/partial pen-one/);
});

test('pen-one report rejects impossible cross-cohort combinations',()=>{
 const valid=density();
 Object.assign(valid,{penOneShotInputs:2,penOneExpiringInputs:1,
  penOneFramesWithInputs:1,penOneRawInputs:3,penOneRawExpiringInputs:1,
  penOneMissingDeadInputs:0,penOneUnknownKindInputs:0,
  penOneMissingOrdinaryFlagsInputs:0,penOneWithoutEpochInputs:0,
  penOneScanCensoredFrames:0});
 assert.equal(check(valid,'valid'),valid);
 for(const patch of [
  {penOneFramesWithInputs:3}, // one shot-update cannot occupy three frames
  {penOneScanCensoredFrames:3}, // observed and censored frames are disjoint
  {penOneMissingDeadInputs:2}, // strict shots and unknown-death shots are disjoint
  {penOneUnknownKindInputs:2},
  {penOneMissingOrdinaryFlagsInputs:2},
  {penOneWithoutEpochInputs:2}
 ]){
  assert.throws(()=>check({...valid,...patch},'corrupt'),/contradictory pen-one/,
   JSON.stringify(patch));
 }
});

test('pen-one natural matrix aggregates measured cohorts and censors mixed historical fields',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-pen-one-'));
 const metrics={penOneShotInputs:2,penOneExpiringInputs:1,
  penOneFramesWithInputs:1,penOneRawInputs:3,penOneRawExpiringInputs:1,
  penOneMissingDeadInputs:0,penOneUnknownKindInputs:0,
  penOneMissingOrdinaryFlagsInputs:0,
  penOneWithoutEpochInputs:1,penOneScanCensoredFrames:0};
 try{
  for(let i=0;i<2;i++){
   const dir=path.join(root,'nova-frontlines-natural-ab-'+i);
   fs.mkdirSync(dir);
   const off=arm('seed'+i,'wander'),on=arm('seed'+i,'wander');
   Object.assign(off.projectileDensityAudit,metrics);
   Object.assign(on.projectileDensityAudit,metrics);
   fs.writeFileSync(path.join(dir,'frontlines-natural-match-ab.json'),
    JSON.stringify({initialWorldIdentical:true,offReplayIdentical:true,
     off,on,offReplay:JSON.parse(JSON.stringify(off))}));
  }
  const measured=collect(root,2);
  assert.equal(measured.totals.ON.penOneMetrics.penOneShotInputs,4);
  assert.equal(measured.totals.ON.fractionPenOneStrictShotUpdates,4/24);
  assert.equal(measured.totals.ON.fractionPenOneRawExpiringShotUpdates,2/24);
  const censored={...measured.totals.ON,penOneComplete:true,
   penOneMetrics:{...measured.totals.ON.penOneMetrics,penOneScanCensoredFrames:1}};
  assert.equal(require('../../scripts/projectile-density-report.cjs').finish(censored).fractionPenOneStrictShotUpdates,null);
  assert.equal(measured.totals.OFF.penOneMetrics.penOneRawInputs,6);
  assert.equal(measured.observations[0].ON.penOneMetrics.penOneExpiringInputs,1);
  const file=path.join(root,'nova-frontlines-natural-ab-1','frontlines-natural-match-ab.json');
  const historical=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const key of Object.keys(metrics)){
   delete historical.off.projectileDensityAudit[key];
   delete historical.on.projectileDensityAudit[key];
   delete historical.offReplay.projectileDensityAudit[key];
  }
  fs.writeFileSync(file,JSON.stringify(historical));
  const mixed=collect(root,2);
  assert.equal(mixed.totals.ON.penOneMetrics,null,'missing data must not become zero');
  assert.equal(mixed.totals.ON.fractionPenOneStrictShotUpdates,null);
  assert.equal(mixed.totals.OFF.penOneMetrics,null);
  assert.equal(mixed.observations[1].ON.penOneMetrics,null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
