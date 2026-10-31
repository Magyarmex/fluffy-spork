'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {check,collect}=require('../../scripts/bomber-airburst-causal-report.cjs');
function combatSample(time=1){
 return {time,bodyHash:'a:b',healthHash:'c:d',
  categories:{pilot:'1:1',tanks:'2:2',shapes:'3:3',drones:'4:4',cover:'5:5'}};
}
function arm(seed='seed-0',advanced=0,hash='a:b'){
 return {metadata:{abMode:'bomber-physics',pilotPolicy:'cover-pressure',
   pilotClass:'bomber',layout:'CROSSFIRE',seed},
  game:{time:60,status:'playing',score:100,kills:2,level:3},
  bomberBurstAudit:{schema:1,airburst:{advanced,calls:20,observerErrors:0}},
  bomberPhysicsTrace:{firstAdvanceTime:advanced?1.5:null,
   samples:[{time:1,hash:'a:b',hp:100,score:0,kills:0,alive:true},
    {time:2,hash,hp:100,score:0,kills:0,alive:true}],
   combatSamples:[combatSample(1),combatSample(2)]}};
}
function report(exposed=true){
 const off=arm(),on=arm('seed-0',exposed?2:0,exposed?'c:d':'a:b');
 return {abMode:'bomber-physics',bomberResearch:true,
  initialWorldIdentical:true,offReplayIdentical:true,
  off,on,offReplay:structuredClone(off),
  bomberPhysicsCausal:{sourcePatchVerified:true,offAdvanced:0,
   onAdvanced:exposed?2:0,firstAdvanceTime:exposed?1.5:null,
   firstPhysicalDifferenceTime:exposed?2:null,sharedPhysicalSamples:2,
   physicalDifferenceObserved:exposed,sharedCombatSamples:2,
   firstNonProjectileDifferenceTime:null,firstHealthDifferenceTime:null,
   firstHealthDifferenceCategories:null,
   noAdvanceNoDifference:exposed?null:true}};
}
test('actual intervention with later physical divergence is accepted',()=>{
 const row=check(report(),'fixture');
 assert.equal(row.onAdvanced,2);
 assert.equal(row.firstPhysicalDifferenceTime,2);
 assert.equal(row.firstNonProjectileDifferenceTime,null,
  'projectile-only motion must not be misreported as combat change');
 assert.equal(row.firstHealthDifferenceTime,null);
});
test('no exposure and no physical difference are accepted without inventing benefit',()=>{
 const row=check(report(false),'fixture');
 assert.equal(row.onAdvanced,0);
 assert.equal(row.physicalDifferenceObserved,false);
});
test('body movement divergence is recorded separately from health',()=>{
 const r=report();
 r.on.bomberPhysicsTrace.combatSamples[1].bodyHash='e:f';
 r.bomberPhysicsCausal.firstNonProjectileDifferenceTime=2;
 const row=check(r,'fixture');
 assert.equal(row.firstNonProjectileDifferenceTime,2);
 assert.equal(row.firstHealthDifferenceTime,null);
});
test('health/progression change names the affected entity category',()=>{
 const r=report();
 const sample=r.on.bomberPhysicsTrace.combatSamples[1];
 sample.bodyHash='e:f';sample.healthHash='a:1';
 sample.categories.shapes='7:8';
 Object.assign(r.bomberPhysicsCausal,{
  firstNonProjectileDifferenceTime:2,firstHealthDifferenceTime:2,
  firstHealthDifferenceCategories:['shapes']
 });
 const row=check(r,'fixture');
 assert.equal(row.firstHealthDifferenceTime,2);
 assert.deepEqual(row.firstHealthDifferenceCategories,['shapes']);
});
test('false health difference without changed category is rejected',()=>{
 const r=report();
 const sample=r.on.bomberPhysicsTrace.combatSamples[1];
 sample.bodyHash='e:f';sample.healthHash='a:1';
 Object.assign(r.bomberPhysicsCausal,{
  firstNonProjectileDifferenceTime:2,firstHealthDifferenceTime:2,
  firstHealthDifferenceCategories:['shapes']
 });
 assert.throws(()=>check(r,'fixture'),/health divergence lacks category/);
});
test('health change before any body change is rejected',()=>{
 const r=report();
 const sample=r.on.bomberPhysicsTrace.combatSamples[1];
 sample.healthHash='a:1';sample.categories.shapes='7:8';
 Object.assign(r.bomberPhysicsCausal,{
  firstHealthDifferenceTime:2,firstHealthDifferenceCategories:['shapes']
 });
 assert.throws(()=>check(r,'fixture'),/health change cannot precede/);
});
test('unexposed world cannot claim changed non-projectile state',()=>{
 const r=report(false);
 r.on.bomberPhysicsTrace.combatSamples[1].bodyHash='e:f';
 r.bomberPhysicsCausal.firstNonProjectileDifferenceTime=2;
 assert.throws(()=>check(r,'fixture'),/non-projectile state changed before treatment|unexposed worlds/);
});
test('non-projectile samples must be strictly ordered',()=>{
 const r=report();
 r.on.bomberPhysicsTrace.combatSamples[1].time=1;
 assert.throws(()=>check(r,'fixture'),/invalid non-projectile sample/);
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
   exposedWithoutSampledDivergence:0,
   nonProjectileDivergedPairs:0,healthDivergedPairs:0});
  assert.equal(result.rows[5].on.status,'dead');
  assert.throws(()=>collect(root,7),/incomplete causal matrix/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('causal OFF changes exactly one callsite in the real shipping Disciplines source',()=>{
 const vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,
  '../../nova-updates/disciplines-v1.7.0.js'),'utf8');
 const needle='advanceClearFuseChildren(this,b,childStart,dt,physicalCross,sole);';
 assert.equal(source.split(needle).length,2,
  'the browser experiment must not silently patch a different version');
 const off=source.replace(needle,
  '/* research-only causal OFF: leave newborn fragments at birth */');
 assert.equal(off.length,source.length-needle.length+
  '/* research-only causal OFF: leave newborn fragments at birth */'.length);
 assert.ok(off.includes('function advanceClearFuseChildren('),
  'the OFF arm must preserve the helper definition and all other gameplay');
 assert.ok(!off.includes(needle));
 assert.doesNotThrow(()=>new vm.Script(off),
  'delivered OFF script must remain syntactically valid');
});
