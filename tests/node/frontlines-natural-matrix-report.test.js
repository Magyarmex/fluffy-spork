'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collectMatrix}=require('../../scripts/frontlines-natural-matrix-report.cjs');

function snapshot(layout,seed,policy,arrivals){
 return{metadata:{layout,seed,pilotPolicy:policy},
  naturalBlooms:2,publicBloomCommandSamples:policy==='wander'?0:20,
  game:{time:120,status:'dead'},frontline:{counts:{
   announcements:2,aiPhysicalArrivals:arrivals,aiPhysicalRejectedCrossings:0,
   hostileOutsideBotSeconds:200,hostileBotSeconds:250,pilotAliveSeconds:100,
   pilotDeathCensors:1,observedContests:1,neutralXP:20}}};
}
function writePair(root,layout,policy,seed,arrivals=2){
 const name='nova-frontlines-natural-ab-'+layout.replace(/ /g,'-')+'-'+policy+'-'+seed;
 const dir=path.join(root,name);fs.mkdirSync(dir);
 const on=snapshot(layout,seed,policy,arrivals),off=snapshot(layout,seed,policy,1);
 const row={layout,seed,pilotPolicy:policy,on:'frontlines-natural-on.json',off:'frontlines-natural-off.json'};
 const report={initialWorldIdentical:true,offReplayIdentical:true,on,off,offReplay:structuredClone(off)};
 for(const [file,data] of [['frontlines-natural-on.json',on],['frontlines-natural-off.json',off],
  ['frontlines-natural-manifest.json',{pairs:[row]}],['frontlines-natural-match-ab.json',report]])
  fs.writeFileSync(path.join(dir,file),JSON.stringify(data));
 return{dir,on,off,row,report};
}
function sandbox(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-frontlines-matrix-'));
 try{fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('aggregates distinct public and wandering policies without erasing their paired differences',()=>sandbox(root=>{
 writePair(root,'CROSSFIRE','wander','s0',2);
 writePair(root,'CROSSFIRE','public-bloom','s0',5);
 const r=collectMatrix(root,2);
 assert.equal(r.observedPairs,2);
 assert.equal(r.batch.layoutCount,1);
 assert.equal(r.batch.policies.wander.metrics.arrivalsPer100OutsideBotSeconds.meanPairedDelta,.5);
 assert.equal(r.batch.policies['public-bloom'].metrics.arrivalsPer100OutsideBotSeconds.meanPairedDelta,2);
 assert.ok(r.warnings.some(x=>/commands may diverge/.test(x)));
}));
test('missing artifact folders, OFF replay divergence, and mismatched snapshots fail closed',()=>sandbox(root=>{
 const a=writePair(root,'CROSSFIRE','wander','s0');
 assert.throws(()=>collectMatrix(root,2),/incomplete natural-match matrix/);
 a.report.offReplay.game.time=99;
 fs.writeFileSync(path.join(a.dir,'frontlines-natural-match-ab.json'),JSON.stringify(a.report));
 assert.throws(()=>collectMatrix(root,1),/OFF replay failed/);
 a.report.offReplay=a.off;
 fs.writeFileSync(path.join(a.dir,'frontlines-natural-match-ab.json'),JSON.stringify(a.report));
 a.on.metadata.pilotPolicy='public-bloom';
 fs.writeFileSync(path.join(a.dir,'frontlines-natural-on.json'),JSON.stringify(a.on));
 assert.throws(()=>collectMatrix(root,1),/report and persisted snapshots disagree/);
}));
test('duplicate layout/seed/policy combinations are rejected despite distinct artifact folders',()=>sandbox(root=>{
 writePair(root,'CROSSFIRE','wander','s0');
 const b=writePair(root,'SPLIT HORIZON','wander','s1');
 b.row.layout='CROSSFIRE';b.row.seed='s0';
 b.on.metadata.layout='CROSSFIRE';b.on.metadata.seed='s0';
 b.off.metadata.layout='CROSSFIRE';b.off.metadata.seed='s0';
 b.report.on=b.on;b.report.off=b.off;b.report.offReplay=b.off;
 for(const [file,data] of [['frontlines-natural-on.json',b.on],['frontlines-natural-off.json',b.off],
  ['frontlines-natural-manifest.json',{pairs:[b.row]}],['frontlines-natural-match-ab.json',b.report]])
  fs.writeFileSync(path.join(b.dir,file),JSON.stringify(data));
 assert.throws(()=>collectMatrix(root,2),/duplicate layout\/seed\/pilot-policy/);
}));
