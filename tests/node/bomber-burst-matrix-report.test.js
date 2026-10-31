'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {check,collect}=require('../../scripts/bomber-burst-matrix-report.cjs');
function audit(n){
 return {schema:1,pilotId:1,calls:n,firstBursts:n,suppressedCalls:0,
  childrenCreated:n*6,byOwner:{pilot:n,other:0,unknown:0},
  bySource:{battlefield:n,core:0,disciplines:0,other:0,unknown:0},
  byTTL:{positive:n,expired:0,unknown:0},
  bySite:n?{'battlefield-v1.6.0.js:999':n}:{},examples:[],
  airburst:{calls:0,sole:0,advanced:0,stationary:0,mixed:0,noChildren:0,
   children:0,advancedChildren:0,advancedDistance:0,
   byOwner:{pilot:0,other:0,unknown:0},examples:[],observerErrors:0,
   gates:{soleWithoutRewound:0,soleRewoundNotClean:0,soleCleanNearAny:0,
    soleCleanNoNearby:0,soleCleanNearShape:0,soleCleanNearTank:0,
    soleCleanNearDrone:0},veto:{eligible:0,counts:Object.fromEntries(
    ['missingShapeVelocity','missingTankVelocity','missingDroneVelocity',
     'excessEntitySpeed','parentShapeProximity','parentTankProximity',
     'parentDroneProximity','fragmentShapeProximity','fragmentTankProximity',
     'fragmentDroneProximity','fragmentTerrainProximity','fragmentInvalid',
     'fragmentBounds','noWitnessedSufficientVeto'].map(k=>[k,0]))}}};
}
test('burst matrix validator rejects impossible owner and source counts',()=>{
 const a=audit(3);check(a,'valid');
 a.bySource.core=1;assert.throws(()=>check(a,'bad'),/invalid bySource/);
 a.bySource.core=0;a.firstBursts=4;assert.throws(()=>check(a,'bad'),/inconsistent/);
 a.firstBursts=3;a.airburst.calls=1;
 assert.throws(()=>check(a,'bad'),/invalid airburst/);
});
test('paired Bomber matrix preserves zero exposure and censored deaths',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-bomber-matrix-'));
 try{
  for(let i=0;i<2;i++){
   const dir=path.join(root,'nova-bomber-burst-'+i);fs.mkdirSync(dir);
   const meta={layout:i?'FOUR GATES':'CROSSFIRE',seed:'seed-'+i,
    pilotClass:'bomber',pilotClassFinal:'bomber',pilotPolicy:'cover-pressure'};
   const off={metadata:meta,game:{time:25,status:i?'dead':'playing'},
    bomberBurstAudit:audit(i),coverPressure:{playerShellsFired:i}};
   const on={metadata:meta,game:{time:35,status:'playing'},
    bomberBurstAudit:audit(i+1),coverPressure:{playerShellsFired:i+1}};
   fs.writeFileSync(path.join(dir,'frontlines-natural-match-ab.json'),
    JSON.stringify({bomberResearch:true,abMode:'cover-pressure',
     initialWorldIdentical:true,offReplayIdentical:true,
     off,on,offReplay:off}));
  }
  const report=collect(root,2);
  assert.equal(report.pairs,2);
  assert.equal(report.totals.OFF.noBurstTrials,1);
  assert.equal(report.totals.OFF.earlyDeaths,1);
  assert.equal(report.totals.ON.firstBursts,3);
  assert.equal(report.totals.ON.childrenCreated,18);
  assert.equal(report.totals.OFF.noShellTrials,1);
  assert.equal(report.totals.ON.shellsFired,3);
  assert.equal(report.totals.ON.bySource.battlefield,3);
  assert.equal(report.totals.ON.simulatedSeconds,70);
  assert.equal(report.rates.OFF.correctedBurstsPerMinute,0);
  assert.equal(report.rates.ON.correctedFraction,null,
   'no actual airburst exposure must not be reported as zero effectiveness');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('matrix validates genuine witnessed airburst movement and rejects inconsistent fragments',()=>{
 const a=audit(3);
 a.bySource.battlefield=2;a.bySource.disciplines=1;
 a.bySite={'battlefield-v1.6.0.js:999':2,'disciplines-v1.7.0.js:500':1};
 Object.assign(a.airburst,{calls:1,sole:1,advanced:1,children:6,
  advancedChildren:6,advancedDistance:16.5});
 a.airburst.byOwner.pilot=1;a.airburst.gates.soleCleanNoNearby=1;
 a.airburst.veto.eligible=1;
 a.airburst.veto.counts.noWitnessedSufficientVeto=1;
 check(a,'valid movement');
 a.airburst.advancedChildren=7;
 assert.throws(()=>check(a,'bad movement'),/invalid airburst/);
 a.airburst.advancedChildren=6;a.airburst.observerErrors=1;
 assert.throws(()=>check(a,'observer failed'),/invalid airburst/);
});

test('veto matrix rejects counts beyond the eligible witnessed cohort',()=>{
 const a=audit(1);
 a.bySource.battlefield=0;a.bySource.disciplines=1;
 a.bySite={'disciplines-v1.7.0.js:500':1};
 Object.assign(a.airburst,{calls:1,sole:1,stationary:1,children:6});
 a.airburst.byOwner.pilot=1;a.airburst.gates.soleCleanNoNearby=1;
 a.airburst.veto.eligible=1;
 a.airburst.veto.counts.missingDroneVelocity=1;
 check(a,'valid sufficient veto');
 a.airburst.veto.counts.missingDroneVelocity=2;
 assert.throws(()=>check(a,'invalid overcount'),/invalid airburst/);
});
