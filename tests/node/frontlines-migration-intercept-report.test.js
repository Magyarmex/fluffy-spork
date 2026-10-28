'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collect}=require('../../scripts/frontlines-migration-intercept-report.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-migration-matrix-')),
  dir=path.join(root,'nova-frontlines-migration-intercept-0-0');
 fs.mkdirSync(dir);
 const meta={layout:'CROSSFIRE',seed:'natural-20261027-0-0',
  pilotPolicy:'public-bloom-harvest-defense',abMode:'migration-intercept'};
 const arm=()=>({metadata:meta,naturalMigrations:0,migrationAIBiasSamples:0,
  naturalBlooms:0,game:{score:10,pilotAlive:true,time:100},
  stats:{aiRotations:2},frontline:{counts:{}},events:[],
  contestGateAudit:{},visibleNeutralAimSamples:0,
  visibleDodgeSamples:0,visibleHostileAimSamples:0});
 const on=arm(),off=arm();
 function write(){
  const save=(name,data)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data));
  save('frontlines-natural-on.json',on);save('frontlines-natural-off.json',off);
  save('frontlines-natural-match-ab.json',{abMode:'migration-intercept',
   initialWorldIdentical:true,offReplayIdentical:true,offReplay:off,on,off});
  save('frontlines-natural-manifest.json',{pairs:[{...meta,
   on:'frontlines-natural-on.json',off:'frontlines-natural-off.json'}]});
 }
 write();
 return{root,dir,on,off,write,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('migration matrix retains natural no-exposure trials as censored',()=>{
 const f=fixture();try{
  const result=collect(f.root,1);
  assert.equal(result.observedPairs,1);assert.equal(result.exposedPairs,0);
  assert.equal(result.censored.length,1);
  assert.throws(()=>collect(f.root,2),/predeclared/);
 }finally{f.cleanup();}
});
test('migration matrix accepts genuinely exposed paired trial without claiming fun',()=>{
 const f=fixture();try{
  f.on.naturalMigrations=f.off.naturalMigrations=1;
  f.on.migrationAIBiasSamples=2;f.off.migrationAIBiasSamples=3;
  f.write();const result=collect(f.root,1);
  assert.equal(result.exposedPairs,1);assert.equal(result.censored.length,0);
  assert.match(result.limits.join(' '),/not physical interceptions/i);
 }finally{f.cleanup();}
});
test('migration matrix rejects corrupted OFF replay',()=>{
 const f=fixture();try{
  const p=path.join(f.dir,'frontlines-natural-match-ab.json');
  const data=JSON.parse(fs.readFileSync(p,'utf8'));
  data.offReplay.game.score=11;fs.writeFileSync(p,JSON.stringify(data));
  assert.throws(()=>collect(f.root,1),/OFF replay must be identical/);
 }finally{f.cleanup();}
});
