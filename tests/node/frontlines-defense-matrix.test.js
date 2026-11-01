'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collect}=require('../../scripts/frontlines-defense-matrix-report.cjs');
const layouts=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'];
function write(p,v){fs.writeFileSync(p,JSON.stringify(v));}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-defense-matrix-'));
 const defense=path.join(root,'defense'),baseline=path.join(root,'baseline');
 fs.mkdirSync(defense);fs.mkdirSync(baseline);
 for(let l=0;l<3;l++)for(let s=0;s<2;s++){
  const seed='natural-20261027-'+l+'-'+s,fp='same-physical-initial-world-'+l+'-'+s+'-long-witness';
  for(const policy of ['baseline','defense']){
   const defensive=policy==='defense';
   const name=defensive?'nova-frontlines-visible-defense-probe-'+l+'-'+s:
     'nova-frontlines-natural-ab-'+l+'-public-bloom-harvest-'+s;
   const dir=path.join(defensive?defense:baseline,name);fs.mkdirSync(dir);
   const pilotPolicy=defensive?'public-bloom-harvest-defense':'public-bloom-harvest';
   const snap=arm=>({metadata:{layout:layouts[l],seed,pilotPolicy,abMode:'memory'},
    game:{time:defensive?165:70,score:defensive?1000:200,status:defensive?'playing':'dead'},
    naturalBlooms:defensive?3:1,visibleDodgeSamples:defensive?10:0,
    visibleHostileAimSamples:defensive?5:0,
    frontline:{counts:{observedContests:0,aiPhysicalArrivals:1}}});
   const off=snap('off'),on=snap('on');
   write(path.join(dir,'frontlines-natural-off.json'),off);
   write(path.join(dir,'frontlines-natural-on.json'),on);
   write(path.join(dir,'frontlines-natural-match-ab.json'),{
    abMode:'memory',initialWorldIdentical:true,initialFingerprint:fp,
    offReplayIdentical:true,off,on,offReplay:off});
   write(path.join(dir,'frontlines-natural-manifest.json'),{
    pairs:[{layout:layouts[l],seed,pilotPolicy,abMode:'memory',
     off:'frontlines-natural-off.json',on:'frontlines-natural-on.json'}]});
  }
 }
 return{root,defense,baseline};
}
test('six predeclared matched-world pairs produce separate ON/OFF summaries',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const r=collect(f.defense,f.baseline,6);
 assert.equal(r.observed,6);
 assert.equal(r.summary.off.baseline.survivors,0);
 assert.equal(r.summary.off.defense.survivors,6);
 assert.equal(r.summary.on.defense.dodgeSamples,60);
 assert.equal(r.summary.off.defense.hostileAimSamples,30);
 assert.equal(r.summary.off.meanTimeDelta,95);
});
test('missing predeclared seed is a failure, never silently excluded',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 fs.rmSync(path.join(f.defense,'nova-frontlines-visible-defense-probe-2-1'),{recursive:true});
 assert.throws(()=>collect(f.defense,f.baseline,6),/missing\/duplicate/);
});
test('cross-policy starting worlds must match, not just within-policy replays',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const p=path.join(f.defense,'nova-frontlines-visible-defense-probe-0-0','frontlines-natural-match-ab.json');
 const r=JSON.parse(fs.readFileSync(p));r.initialFingerprint='different-starting-world-long-witness';write(p,r);
 assert.throws(()=>collect(f.defense,f.baseline,6),/cross-policy initial-world mismatch/);
});
test('policy must actually execute at least one defensive action',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 for(let l=0;l<3;l++)for(let s=0;s<2;s++){
  const dir=path.join(f.defense,'nova-frontlines-visible-defense-probe-'+l+'-'+s);
  const p=path.join(dir,'frontlines-natural-match-ab.json'),r=JSON.parse(fs.readFileSync(p));
  for(const a of ['off','on','offReplay']){
   r[a].visibleDodgeSamples=0;r[a].visibleHostileAimSamples=0;
   if(a!=='offReplay')write(path.join(dir,'frontlines-natural-'+a+'.json'),r[a]);
  }
  write(p,r);
 }
 assert.throws(()=>collect(f.defense,f.baseline,6),/never exercised/);
});
test('baseline cannot secretly use defensive actions',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const dir=path.join(f.baseline,'nova-frontlines-natural-ab-0-public-bloom-harvest-0');
 const p=path.join(dir,'frontlines-natural-match-ab.json'),r=JSON.parse(fs.readFileSync(p));
 for(const a of ['off','on','offReplay'])r[a].visibleDodgeSamples=1;
 write(path.join(dir,'frontlines-natural-off.json'),r.off);
 write(path.join(dir,'frontlines-natural-on.json'),r.on);write(p,r);
 assert.throws(()=>collect(f.defense,f.baseline,6),/baseline used defensive dodges/);
});
test('defensive survival comparison rejects a censored offer instead of counting it as survival',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const dir=path.join(f.defense,'nova-frontlines-visible-defense-probe-0-0');
 const mpath=path.join(dir,'frontlines-natural-manifest.json');
 const rpath=path.join(dir,'frontlines-natural-match-ab.json');
 const m=JSON.parse(fs.readFileSync(mpath)),r=JSON.parse(fs.readFileSync(rpath));
 m.pairs[0].offerPolicy='defer';r.offerPolicy='defer';
 for(const arm of ['on','off','offReplay']){
  r[arm].metadata.offerPolicy='defer';
  r[arm].offerResearch={actions:[],frames:200,pausedWithOffer:false,censor:null};
  if(arm!=='offReplay')write(path.join(dir,'frontlines-natural-'+arm+'.json'),r[arm]);
 }
 write(mpath,m);write(rpath,r);
 assert.throws(()=>collect(f.defense,f.baseline,6),/cross-policy offer-resolution mismatch/);
 // A comparable baseline policy is necessary, but still insufficient if censored.
 const bdir=path.join(f.baseline,'nova-frontlines-natural-ab-0-public-bloom-harvest-0');
 const bmpath=path.join(bdir,'frontlines-natural-manifest.json');
 const brpath=path.join(bdir,'frontlines-natural-match-ab.json');
 const bm=JSON.parse(fs.readFileSync(bmpath)),br=JSON.parse(fs.readFileSync(brpath));
 bm.pairs[0].offerPolicy='defer';br.offerPolicy='defer';
 for(const arm of ['on','off','offReplay']){
  br[arm].metadata.offerPolicy='defer';
  br[arm].offerResearch={actions:[],frames:200,pausedWithOffer:false,censor:null};
  if(arm!=='offReplay')write(path.join(bdir,'frontlines-natural-'+arm+'.json'),br[arm]);
 }
 write(bmpath,bm);write(brpath,br);
 assert.equal(collect(f.defense,f.baseline,6).observed,6);
 r.off.offerResearch.censor={time:71,tier:1,choice:'censor'};
 r.offReplay.offerResearch.censor={time:71,tier:1,choice:'censor'};
 write(path.join(dir,'frontlines-natural-off.json'),r.off);write(rpath,r);
 assert.throws(()=>collect(f.defense,f.baseline,6),/offer-censored trial is not a survivor/);
});
test('defense matrix rejects new-schema offer metadata disguised as legacy',t=>{
 const f=fixture();t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
 const dir=path.join(f.defense,'nova-frontlines-visible-defense-probe-0-0');
 const p=path.join(dir,'frontlines-natural-match-ab.json'),r=JSON.parse(fs.readFileSync(p));
 r.offerPolicy='defer';write(p,r);
 assert.throws(()=>collect(f.defense,f.baseline,6),/manifest\/report offer policy schema mismatch/);
 delete r.offerPolicy;r.off.metadata.offerPolicy='defer';r.offReplay.metadata.offerPolicy='defer';
 write(p,r);write(path.join(dir,'frontlines-natural-off.json'),r.off);
 assert.throws(()=>collect(f.defense,f.baseline,6),/undeclared offer policy metadata/);
});
