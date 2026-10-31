'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {check,collect}=require('../../scripts/bomber-airburst-causal-report.cjs');
function arm(seed='seed-0',advanced=0,hash='a:b'){
 return {metadata:{abMode:'bomber-physics',pilotPolicy:'cover-pressure',
   pilotClass:'bomber',layout:'CROSSFIRE',seed},
  game:{time:60,status:'playing',score:100,kills:2,level:3},
  bomberBurstAudit:{schema:1,airburst:{advanced,calls:20,observerErrors:0}},
  bomberPhysicsTrace:{firstAdvanceTime:advanced?1.5:null,
   samples:[{time:1,hash:'a:b',hp:100,score:0,kills:0,alive:true},
    {time:2,hash,hp:100,score:0,kills:0,alive:true}]}};
}
function report(exposed=true){
 const off=arm(),on=arm('seed-0',exposed?2:0,exposed?'c:d':'a:b');
 return {abMode:'bomber-physics',bomberResearch:true,
  initialWorldIdentical:true,offReplayIdentical:true,
  off,on,offReplay:structuredClone(off),
  bomberPhysicsCausal:{sourcePatchVerified:true,offAdvanced:0,
   onAdvanced:exposed?2:0,firstAdvanceTime:exposed?1.5:null,
   firstPhysicalDifferenceTime:exposed?2:null,sharedPhysicalSamples:2,
   physicalDifferenceObserved:exposed,
   noAdvanceNoDifference:exposed?null:true}};
}
test('actual intervention with later physical divergence is accepted',()=>{
 const row=check(report(),'fixture');
 assert.equal(row.onAdvanced,2);
 assert.equal(row.firstPhysicalDifferenceTime,2);
});
test('no exposure and no physical difference are accepted without inventing benefit',()=>{
 const row=check(report(false),'fixture');
 assert.equal(row.onAdvanced,0);
 assert.equal(row.physicalDifferenceObserved,false);
});
test('OFF replay mismatch invalidates causal comparison',()=>{
 const r=report();r.offReplay.game.score++;
 assert.throws(()=>check(r,'fixture'),/OFF replay/);
});
test('unverified source patch invalidates comparison',()=>{
 const r=report();r.bomberPhysicsCausal.sourcePatchVerified=false;
 assert.throws(()=>check(r,'fixture'),/single-call intervention/);
});
test('an OFF fragment advance invalidates treatment isolation',()=>{
 const r=report();r.off.bomberBurstAudit.airburst.advanced=1;
 r.offReplay.bomberBurstAudit.airburst.advanced=1;
 assert.throws(()=>check(r,'fixture'),/inconsistent treatment exposure/);
});
test('physical divergence before the first fragment advance is rejected',()=>{
 const r=report();r.on.bomberPhysicsTrace.firstAdvanceTime=2.5;
 r.bomberPhysicsCausal.firstAdvanceTime=2.5;
 assert.throws(()=>check(r,'fixture'),/before treatment/);
});
test('unexposed world cannot claim a different physical trace',()=>{
 const r=report(false);r.on.bomberPhysicsTrace.samples[1].hash='f:9';
 r.bomberPhysicsCausal.firstPhysicalDifferenceTime=2;
 r.bomberPhysicsCausal.physicalDifferenceObserved=true;
 assert.throws(()=>check(r,'fixture'),/unexposed worlds/);
});
test('matched initial world must have identical seed and layout',()=>{
 const r=report();r.on.metadata.seed='different';
 assert.throws(()=>check(r,'fixture'),/unmatched physical worlds/);
});
test('invalid or unordered physical timestamps are rejected',()=>{
 const r=report();r.on.bomberPhysicsTrace.samples[1].time=.5;
 assert.throws(()=>check(r,'fixture'),/invalid physical sample/);
});
test('six-pair collector preserves zero-exposure and death-censored trials',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-bomber-causal-'));
 try{
  for(let i=0;i<6;i++){
   const dir=path.join(root,'nova-bomber-physics-'+i);
   fs.mkdirSync(dir);
   const r=report(i%2===0);
   for(const armName of ['off','on','offReplay']){
    r[armName].metadata.seed='seed-'+i;
    r[armName].metadata.layout=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'][i%3];
   }
   if(i===5){r.on.game.status='dead';r.on.game.time=42;}
   fs.writeFileSync(path.join(dir,'frontlines-natural-match-ab.json'),JSON.stringify(r));
  }
  const result=collect(root,6);
  assert.equal(result.pairs,6);
  assert.deepEqual(result.totals,{onAdvanced:6,exposedPairs:3,
   unexposedPairs:3,physicallyDivergedPairs:3,
   exposedWithoutSampledDivergence:0});
  assert.equal(result.rows[5].on.status,'dead');
  assert.throws(()=>collect(root,7),/incomplete causal matrix/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
