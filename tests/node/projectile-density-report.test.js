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
