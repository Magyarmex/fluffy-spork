'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collate}=require('../../scripts/public-star-interception-report.cjs');
const layouts=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'];
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-star-pairs-'));
 for(let layout=0;layout<3;layout++)for(let seed=0;seed<2;seed++)
 for(const mode of ['control','intercept']){
  const x={protocol:'public-star-intercept-v1',mode,horizon:300,
   initial:{layout:layouts[layout],seed,mode,initialStars:1,initialBots:8},
   result:{time:100,playerScore:10,status:'dead',
    stats:{starAnnouncements:0},
    audit:{announcements:0,pilot:{mode,cues:0,visibleCues:0,reportCues:0,
     near100Frames:0,near250Frames:0,minStarDistanceAfterReport:null}}},
   censored:true};
  fs.writeFileSync(path.join(dir,`layout-${layout}-seed-${seed}-${mode}.json`),
   JSON.stringify(x));
 }
 return dir;
}
function mutate(dir,layout,seed,mode,fn){
 const file=path.join(dir,`layout-${layout}-seed-${seed}-${mode}.json`);
 const x=JSON.parse(fs.readFileSync(file,'utf8'));fn(x);fs.writeFileSync(file,JSON.stringify(x));
}
test('six paired censored zero-exposure trials are retained, not cherry-picked',()=>{
 const dir=fixture();
 try{
  const x=collate(dir);
  assert.equal(x.pairs,6);assert.equal(x.exposedPairs,0);
  assert.equal(x.noExposurePairs,6);assert.equal(x.censoredPairs,6);
  assert.equal(x.interceptPublicCues,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('one exposed arm stays in paired denominator and retains measured physical approach',()=>{
 const dir=fixture();
 try{
  mutate(dir,1,0,'intercept',x=>{
   x.result.stats.starAnnouncements=1;x.result.audit.announcements=1;
   x.result.audit.pilot.cues=12;x.result.audit.pilot.reportCues=10;
   x.result.audit.pilot.visibleCues=2;
   x.result.audit.pilot.near100Frames=4;
   x.result.audit.pilot.minStarDistanceAfterReport=81.5;
  });
  const x=collate(dir);
  assert.equal(x.exposedPairs,1);assert.equal(x.noExposurePairs,5);
  assert.equal(x.interceptPublicCues,10);assert.equal(x.interceptNear100Frames,4);
  assert.equal(x.trials[2].arms.intercept.minDistance,81.5);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('missing, mismatched, forged or unexpected arms fail closed',()=>{
 const dir=fixture();
 try{
  fs.unlinkSync(path.join(dir,'layout-2-seed-1-control.json'));
  assert.throws(()=>collate(dir),/missing predeclared/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 const dir2=fixture();
 try{
  mutate(dir2,0,0,'intercept',x=>{x.result.audit.pilot.cues=1;});
  assert.throws(()=>collate(dir2),/invalid public pilot audit/);
 }finally{fs.rmSync(dir2,{recursive:true,force:true});}
 const dir3=fixture();
 try{
  fs.writeFileSync(path.join(dir3,'layout-9-seed-9-control.json'),'{}');
  assert.throws(()=>collate(dir3),/unexpected or duplicate/);
 }finally{fs.rmSync(dir3,{recursive:true,force:true});}
});

test('naturally absent zero-announcement counters are treated as zero, not lost exposure',()=>{
 const dir=fixture();
 try{
  mutate(dir,0,0,'control',x=>{x.result.stats={};});
  const report=collate(dir);
  assert.equal(report.pairs,6);
  assert.equal(report.controlAnnouncements,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
