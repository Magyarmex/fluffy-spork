'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {analyzeManifest,readManifest}=require('../../scripts/frontlines-ab-batch.cjs');
function snap(layout,seed,counts={}){
 return{metadata:{layout,seed},frontline:{counts:{announcements:2,aiPhysicalArrivals:4,hostileOutsideBotSeconds:200,
  hostileBotSeconds:300,pilotAliveSeconds:120,pilotDeathCensors:0,observedContests:3,neutralXP:600,aiArrivals:999,...counts}}};
}
function make(n=4){const m={pairs:[]},data={};for(let i=0;i<n;i++){
  const layout=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'][i%3],seed='seed-'+i,on='on-'+i,off='off-'+i;
  m.pairs.push({layout,seed,on,off});data[on]=snap(layout,seed);data[off]=snap(layout,seed,{aiPhysicalArrivals:2,neutralXP:400});
 }return{m,data,load:p=>data[p]};}
test('paired rates are calculated from physical arrivals and matched outside exposure, never AI MEM',()=>{
 const {m,load}=make(9),r=analyzeManifest(m,load);
 assert.equal(r.pairCount,9);assert.equal(r.layoutCount,3);
 assert.equal(r.overall.metrics.arrivalsPer100OutsideBotSeconds.meanPairedDelta,1);
 assert.equal(r.overall.metrics.arrivalsPer100OutsideBotSeconds.pooledOn,2);
 assert.equal(r.overall.metrics.arrivalsPer100OutsideBotSeconds.pooledOff,1);
 assert.equal(r.overall.metrics.neutralXpPerPilotMinute.meanPairedDelta,100);
 assert.deepEqual(r.overall.metrics.arrivalsPer100OutsideBotSeconds.pairedBootstrap95,[1,1]);
 assert.ok(!JSON.stringify(r).includes('aiArrivals'));
});
test('seed and layout are mandatory, duplicates forbidden, and snapshots must match manifest',()=>{
 const {m,data,load}=make(2);
 assert.throws(()=>analyzeManifest({pairs:[{...m.pairs[0],seed:null}]},load),/missing seed/);
 assert.throws(()=>analyzeManifest({pairs:[m.pairs[0],m.pairs[0]]},load),/duplicate/);
 data['on-0']=snap('FOUR GATES','seed-0');
 assert.throws(()=>analyzeManifest(m,load),/snapshot layout differs/);
 data['on-0']=snap('CROSSFIRE','other');
 assert.throws(()=>analyzeManifest(m,load),/snapshot seed differs/);
});
test('missing/invalid denominators and impossible exposure fail closed',()=>{
 const {m,data,load}=make(1);
 data['on-0']=snap('CROSSFIRE','seed-0',{hostileOutsideBotSeconds:500});
 assert.throws(()=>analyzeManifest(m,load),/outside exposure exceeds/);
 data['on-0']=snap('CROSSFIRE','seed-0',{hostileOutsideBotSeconds:-1});
 assert.throws(()=>analyzeManifest(m,load),/invalid\/missing/);
});
test('zero exposure excludes pair for that metric, rather than manufacturing a rate',()=>{
 const {m,data,load}=make(4);data['on-0']=snap('CROSSFIRE','seed-0',{hostileOutsideBotSeconds:0});
 const r=analyzeManifest(m,load),x=r.overall.metrics.arrivalsPer100OutsideBotSeconds;
 assert.equal(x.pairedN,3);assert.equal(x.excludedZeroExposure,1);assert.equal(x.pairedBootstrap95,null);
 assert.ok(r.warnings.some(x=>/under 100 outside-sector/.test(x)));
});
test('unequal exposure is pooled by denominator, but paired effect remains within seed',()=>{
 const {m,data,load}=make(2);
 data['on-0']=snap('CROSSFIRE','seed-0',{aiPhysicalArrivals:9,hostileOutsideBotSeconds:100});
 data['off-0']=snap('CROSSFIRE','seed-0',{aiPhysicalArrivals:1,hostileOutsideBotSeconds:100});
 data['on-1']=snap('SPLIT HORIZON','seed-1',{aiPhysicalArrivals:1,hostileOutsideBotSeconds:1000,hostileBotSeconds:1200});
 data['off-1']=snap('SPLIT HORIZON','seed-1',{aiPhysicalArrivals:1,hostileOutsideBotSeconds:1000,hostileBotSeconds:1200});
 const r=analyzeManifest(m,load),x=r.overall.metrics.arrivalsPer100OutsideBotSeconds;
 assert.equal(x.meanPairedDelta,4);
 assert.equal(x.pooledOn,.90909);assert.equal(x.pooledOff,.18182);
 assert.equal(r.equalLayoutMeanPairedDelta.arrivalsPer100OutsideBotSeconds,4);
});
test('death censor and missing layouts are explicit limitations',()=>{
 const {m,data,load}=make(2);data['on-0']=snap('CROSSFIRE','seed-0',{pilotDeathCensors:1});
 const r=analyzeManifest(m,load);
 assert.ok(r.warnings.some(x=>/pilot death censored/.test(x)));
 assert.ok(r.warnings.some(x=>/Not all three/.test(x)));
 assert.ok(r.warnings.some(x=>/Matching seed labels do not prove/.test(x)));
});
test('CLI reads relative COPY ECOLOGY snapshots with a human-readable header',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-ab-'));
 try{const {m,data}=make(1);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m));
  for(const [p,s] of Object.entries(data))fs.writeFileSync(path.join(dir,p),'NOVA TANKS · LIVING FRONT 1.12.0\n'+JSON.stringify(s));
  const r=readManifest(path.join(dir,'manifest.json'));assert.equal(r.pairCount,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('batch preserves policy as a pairing dimension rather than mixing scripted pilots',()=>{
 const {m,data,load}=make(1),base=m.pairs[0];
 const bloom={...base,pilotPolicy:'public-bloom',on:'bloom-on',off:'bloom-off'};
 const wander={...base,pilotPolicy:'wander'};
 m.pairs=[bloom,wander];
 data['bloom-on']=snap('CROSSFIRE','seed-0',{aiPhysicalArrivals:8});
 data['bloom-off']=snap('CROSSFIRE','seed-0',{aiPhysicalArrivals:2});
 data['bloom-on'].metadata.pilotPolicy='public-bloom';
 data['bloom-off'].metadata.pilotPolicy='public-bloom';
 data[base.on].metadata.pilotPolicy='wander';
 data[base.off].metadata.pilotPolicy='wander';
 const r=analyzeManifest(m,load);
 assert.equal(r.pairCount,2);
 assert.equal(r.policies['public-bloom'].metrics.arrivalsPer100OutsideBotSeconds.meanPairedDelta,3);
 assert.equal(r.policies.wander.metrics.arrivalsPer100OutsideBotSeconds.meanPairedDelta,1);
 assert.ok(r.warnings.some(w=>/Multiple pilot policies mixed/.test(w)));
 assert.throws(()=>analyzeManifest({pairs:[{...bloom,pilotPolicy:'wander'}]},load),/snapshot pilot policy differs/);
 assert.throws(()=>analyzeManifest({pairs:[{...bloom,pilotPolicy:null}]},load),/pilot policy missing from manifest/);
});
test('missing snapshot provenance and rejected movement witnesses cannot disappear silently',()=>{
 const {m,data,load}=make(1);
 delete data['on-0'].metadata.seed;
 assert.throws(()=>analyzeManifest(m,load),/snapshot seed differs/);
 data['on-0'].metadata.seed='seed-0';
 data['on-0'].frontline.counts.aiPhysicalRejectedCrossings=2;
 data['off-0'].frontline.counts.aiPhysicalRejectedCrossings=0;
 const r=analyzeManifest(m,load);
 assert.ok(r.warnings.some(w=>/uncertified crossing candidates present/.test(w)));
 delete data['off-0'].frontline.counts.aiPhysicalRejectedCrossings;
 assert.ok(analyzeManifest(m,load).warnings.some(w=>/rejection counters missing/.test(w)));
});
