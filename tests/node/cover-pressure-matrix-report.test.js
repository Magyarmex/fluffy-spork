'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),
 os=require('node:os'),path=require('node:path');
const {collect,arm}=require('../../scripts/cover-pressure-matrix-report.cjs');
function sample(mode,seed){
 return {metadata:{layout:'CROSSFIRE',seed:'natural-20261027-0-'+seed,
   pilotPolicy:'cover-pressure',abMode:'cover-pressure'},
  game:{status:'dead',time:12},
  coverPressure:{coverBroken:mode==='ON'?1:0,coverDamage:mode==='ON'?290:0,
   certifiedActivations:mode==='ON'?1:0,playerShotsFired:mode==='ON'?9:3,
   aimSamples:mode==='ON'?12:0,moveSamples:mode==='ON'?6:0,noTargetSamples:2},
  projectileDensityAudit:{bulletUpdateCalls:360,coverBreaks:mode==='ON'?1:0,
   basicEligibleFrames:50,coverBreaksBasicEligible:0}};
}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-cover-matrix-'));
 const off=sample('OFF',0),on=sample('ON',0);
 const report={abMode:'cover-pressure',initialWorldIdentical:true,
  offReplayIdentical:true,off,on,offReplay:structuredClone(off)};
 const dir=path.join(root,'nova-cover-pressure-0-0');fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir,'frontlines-natural-match-ab.json'),JSON.stringify(report));
 return{root,dir,report};
}
test('collator retains early deaths and separate cover pressure arms',()=>{
 const f=fixture();try{
  const r=collect(f.root,1);
  assert.equal(r.totals.ON.coverDamage,290);
  assert.equal(r.totals.OFF.coverDamage,0);
  assert.equal(r.totals.ON.earlyDeaths,1);
  assert.equal(r.totals.OFF.earlyDeaths,1);
  assert.equal(r.totals.ON.aimSamples,12);
  assert.equal(r.totals.ON.certifiedActivations,1);
  assert.equal(r.totals.ON.playerShotsFired,9);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('collator rejects incomplete matrix and mismatched replay',()=>{
 const f=fixture();try{
  assert.throws(()=>collect(f.root,6),/incomplete/);
  f.report.offReplay.game.time=13;
  fs.writeFileSync(path.join(f.dir,'frontlines-natural-match-ab.json'),JSON.stringify(f.report));
  assert.throws(()=>collect(f.root,1),/replay integrity/);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('collator rejects fabricated negative counts and invalid arm identity',()=>{
 const f=fixture();try{
  const on=sample('ON',0);on.coverPressure.coverDamage=-1;
  assert.throws(()=>arm(on,'ON'),/invalid coverDamage/);
  f.report.on.metadata.pilotPolicy='wander';
  fs.writeFileSync(path.join(f.dir,'frontlines-natural-match-ab.json'),JSON.stringify(f.report));
  assert.throws(()=>collect(f.root,1),/mismatched research arms/);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
