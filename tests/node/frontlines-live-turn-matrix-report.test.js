'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collectLiveTurnMatrix}=require('../../scripts/frontlines-live-turn-matrix-report.cjs');
function snap(layout,seed,policy,startedLive,arrivals=1,blooms=2){
 return{metadata:{layout,seed,pilotPolicy:policy,abMode:'live-turn'},
  naturalBlooms:blooms,publicBloomCommandSamples:0,commitmentAudit:{startedLive,startedMemory:0,
   liveSignal:0,liveGate:{samples:0,signalIntent:0,strongWeight:0,outside:0,selected:0,
    healthy:0,threatClear:0,noHeldTarget:0,unspent:0,precombatIntersection:0,
    possibleFreshStarts:0,possibleFreshNoHeldTarget:0,
    firstBlock:{intent:0,weight:0,arrived:0,subset:0,health:0,threat:0,heldTarget:0,spent:0,possible:0}}},
  game:{time:120,status:'dead'},frontline:blooms?{counts:{
   announcements:2,aiPhysicalArrivals:arrivals,aiPhysicalRejectedCrossings:0,
   hostileOutsideBotSeconds:200,hostileBotSeconds:250,pilotAliveSeconds:100,
   pilotDeathCensors:1,observedContests:0,neutralXP:20}}:undefined};
}
function pair(root,layout,policy,seed,liveStarts=1,blooms=2){
 const name='nova-frontlines-natural-ab-live-turn-'+layout.replaceAll(' ','-')+'-'+policy+'-'+seed;
 const dir=path.join(root,name);fs.mkdirSync(dir);
 const on=snap(layout,seed,policy,liveStarts,liveStarts?2:1,blooms),off=snap(layout,seed,policy,0,1,blooms);
 const row={layout,seed,pilotPolicy:policy,abMode:'live-turn',on:'frontlines-natural-on.json',off:'frontlines-natural-off.json'};
 const report={abMode:'live-turn',verifiedLiveStart:liveStarts>0,
  naturalOpportunityObserved:blooms>0,initialWorldIdentical:true,offReplayIdentical:true,
  on,off,offReplay:structuredClone(off)};
 for(const [name,data] of [['frontlines-natural-on.json',on],['frontlines-natural-off.json',off],
  ['frontlines-natural-manifest.json',{pairs:[row]}],['frontlines-natural-match-ab.json',report]])
  fs.writeFileSync(path.join(dir,name),JSON.stringify(data));
 return{dir,report,on,off};
}
function sandbox(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-live-turn-matrix-'));
 try{fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('causal matrix counts real ON starts, requires zero OFF starts and keeps paired rates',()=>sandbox(root=>{
 pair(root,'CROSSFIRE','wander','s0',2);
 pair(root,'SPLIT HORIZON','public-bloom-harvest','s1',1);
 const r=collectLiveTurnMatrix(root,2);
 assert.equal(r.liveTurn.startedOn,3);assert.equal(r.liveTurn.startedOff,0);
 assert.equal(r.liveTurn.activePairs,2);assert.equal(r.liveTurn.informative,true);
 assert.equal(r.batch.pairCount,2);
 assert.equal(r.batch.overall.metrics.arrivalsPer100OutsideBotSeconds.meanPairedDelta,.5);
}));
test('no natural live starts is inconclusive, not fabricated success',()=>sandbox(root=>{
 pair(root,'CROSSFIRE','wander','s0',0);
 const r=collectLiveTurnMatrix(root,1);
 assert.equal(r.liveTurn.informative,false);
 assert.match(r.interpretation,/INCONCLUSIVE/);
}));
test('censored bloom-less pairs remain attempted and cannot count as informative',()=>sandbox(root=>{
 pair(root,'FOUR GATES','wander','s0',0,0);
 const r=collectLiveTurnMatrix(root,1);
 assert.equal(r.observedPairs,1);assert.equal(r.analyzablePairs,0);
 assert.equal(r.censored.length,1);assert.equal(r.liveTurn.informative,false);
}));
test('forbidden OFF live start, incorrect mode and witness mismatch fail closed',()=>sandbox(root=>{
 const p=pair(root,'CROSSFIRE','wander','s0',1);
 p.report.off.commitmentAudit.startedLive=1;
 p.report.offReplay=structuredClone(p.report.off);
 for(const [name,data] of [['frontlines-natural-off.json',p.report.off],
  ['frontlines-natural-match-ab.json',p.report]])
  fs.writeFileSync(path.join(p.dir,name),JSON.stringify(data));
 assert.throws(()=>collectLiveTurnMatrix(root,1),/forbidden live commitment/);
 p.report.off.commitmentAudit.startedLive=0;p.report.offReplay=structuredClone(p.report.off);
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-off.json'),JSON.stringify(p.report.off));
 p.report.abMode='memory';
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-match-ab.json'),JSON.stringify(p.report));
 assert.throws(()=>collectLiveTurnMatrix(root,1),/not a live-turn intervention/);
 p.report.abMode='live-turn';p.report.verifiedLiveStart=false;
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-match-ab.json'),JSON.stringify(p.report));
 assert.throws(()=>collectLiveTurnMatrix(root,1),/witness disagrees/);
}));

test('collector rejects an incomplete or internally impossible live-gate witness',()=>sandbox(root=>{
 const p=pair(root,'CROSSFIRE','wander','s0',1);
 p.report.on.commitmentAudit.liveSignal=1;
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-on.json'),JSON.stringify(p.report.on));
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-match-ab.json'),JSON.stringify(p.report));
 assert.throws(()=>collectLiveTurnMatrix(root,1),/sample totals disagree/);
 p.report.on.commitmentAudit.liveGate.samples=1;
 p.report.on.commitmentAudit.liveGate.firstBlock.possible=1;
 p.report.on.commitmentAudit.liveGate.precombatIntersection=0;
 p.report.on.commitmentAudit.liveGate.possibleFreshStarts=1;
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-on.json'),JSON.stringify(p.report.on));
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-match-ab.json'),JSON.stringify(p.report));
 assert.throws(()=>collectLiveTurnMatrix(root,1),/impossible live gate intersection/);
}));

test('no live turn must imply identical physical game outcomes in both arms',()=>sandbox(root=>{
 const p=pair(root,'CROSSFIRE','wander','s0',0);
 p.report.on.frontline.counts.aiPhysicalArrivals=2;
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-on.json'),JSON.stringify(p.report.on));
 fs.writeFileSync(path.join(p.dir,'frontlines-natural-match-ab.json'),JSON.stringify(p.report));
 assert.throws(()=>collectLiveTurnMatrix(root,1),/no-treatment ON\/OFF gameplay diverged/);
}));

test('no-treatment live-turn pairs must also match visible-defense decisions',()=>sandbox(root=>{
 const p=pair(root,'CROSSFIRE','public-bloom-harvest-defense','s0',0);
 p.report.on.visibleDodgeSamples=1;p.report.off.visibleDodgeSamples=0;
 p.report.offReplay=structuredClone(p.report.off);
 for(const [name,data] of [['frontlines-natural-on.json',p.report.on],
  ['frontlines-natural-off.json',p.report.off],['frontlines-natural-match-ab.json',p.report]])
  fs.writeFileSync(path.join(p.dir,name),JSON.stringify(data));
 assert.throws(()=>collectLiveTurnMatrix(root,1),/no-treatment ON\\/OFF gameplay diverged in visibleDodgeSamples/);
}));
