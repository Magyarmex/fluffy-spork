'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {check,collect}=require('../../scripts/bomber-burst-matrix-report.cjs');
function audit(n){
 return {schema:1,pilotId:1,calls:n,firstBursts:n,suppressedCalls:0,
  childrenCreated:n*6,byOwner:{pilot:n,other:0,unknown:0},
  bySource:{battlefield:n,core:0,unknown:0},
  byTTL:{positive:n,expired:0,unknown:0},
  bySite:n?{'battlefield-v1.6.0.js:999':n}:{},examples:[]};
}
test('burst matrix validator rejects impossible owner and source counts',()=>{
 const a=audit(3);check(a,'valid');
 a.bySource.core=1;assert.throws(()=>check(a,'bad'),/invalid bySource/);
 a.bySource.core=0;a.firstBursts=4;assert.throws(()=>check(a,'bad'),/inconsistent/);
});
test('paired Bomber matrix preserves zero exposure and censored deaths',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-bomber-matrix-'));
 try{
  for(let i=0;i<2;i++){
   const dir=path.join(root,'nova-bomber-burst-'+i);fs.mkdirSync(dir);
   const meta={layout:i?'FOUR GATES':'CROSSFIRE',seed:'seed-'+i,
    pilotClass:'bomber',pilotPolicy:'cover-pressure'};
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
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
