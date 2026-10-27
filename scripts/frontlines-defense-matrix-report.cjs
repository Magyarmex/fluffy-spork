'use strict';
/* Research-only comparison of a defensive visible-information Scout against
 * the pre-existing harvest Scout. Six declared seeds, same materialized game.
 * Neither policy is a human or a direct measure of gameplay fun. */
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const LAYOUTS=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'];
const POLICIES={baseline:'public-bloom-harvest',defense:'public-bloom-harvest-defense'};
function read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function nonnegative(x,label){
 if(typeof x!=='number'||!Number.isFinite(x)||x<0)throw Error(label+' must be finite and nonnegative');
 return x;
}
function loadPair(root,folder,layout,seed,policy){
 const base=path.join(root,folder),report=read(path.join(base,'frontlines-natural-match-ab.json'));
 const manifest=read(path.join(base,'frontlines-natural-manifest.json'));
 const expectedSeed='natural-20261027-'+layout+'-'+seed;
 assert.equal(report.abMode,'memory',folder+': wrong experiment mode');
 assert.equal(report.initialWorldIdentical,true,folder+': ON/OFF initial worlds differ');
 assert.equal(report.offReplayIdentical,true,folder+': OFF replay diverged');
 assert.equal(JSON.stringify(report.off),JSON.stringify(report.offReplay),folder+': OFF replay payload diverged');
 assert.equal(typeof report.initialFingerprint,'string',folder+': initial fingerprint missing');
 assert.ok(report.initialFingerprint.length>20,folder+': initial fingerprint too short');
 assert.equal(manifest.pairs?.length,1,folder+': one declared pair required');
 const m=manifest.pairs[0];
 assert.equal(m.layout,LAYOUTS[layout],folder+': layout mismatch');
 assert.equal(m.seed,expectedSeed,folder+': seed mismatch');
 assert.equal(m.pilotPolicy,policy,folder+': policy mismatch');
 assert.equal(m.abMode,'memory',folder+': manifest mode mismatch');
 assert.equal(m.off,'frontlines-natural-off.json');
 assert.equal(m.on,'frontlines-natural-on.json');
 const arms={};
 for(const name of ['off','on']){
  const snapshot=read(path.join(base,m[name]));
  assert.equal(JSON.stringify(report[name]),JSON.stringify(snapshot),folder+': report/snapshot mismatch');
  assert.equal(snapshot.metadata?.layout,m.layout);
  assert.equal(snapshot.metadata?.seed,m.seed);
  assert.equal(snapshot.metadata?.pilotPolicy,policy);
  assert.equal(snapshot.metadata?.abMode,'memory');
  const g=snapshot.game||{};
  assert.ok(g.status==='playing'||g.status==='dead',folder+': unexpected game status');
  nonnegative(g.time,folder+': game time');
  nonnegative(g.score,folder+': score');
  nonnegative(snapshot.naturalBlooms,folder+': natural BLOOMs');
  nonnegative(snapshot.visibleDodgeSamples,folder+': dodge samples');
  nonnegative(snapshot.visibleHostileAimSamples,folder+': hostile aim samples');
  if(policy===POLICIES.baseline){
   assert.equal(snapshot.visibleDodgeSamples,0,folder+': baseline used defensive dodges');
   assert.equal(snapshot.visibleHostileAimSamples,0,folder+': baseline used hostile aim');
  }
  arms[name]={
   time:g.time,score:g.score,survived:g.status==='playing',
   blooms:snapshot.naturalBlooms,
   contests:snapshot.frontline?.counts?.observedContests||0,
   physicalArrivals:snapshot.frontline?.counts?.aiPhysicalArrivals||0,
   dodgeSamples:snapshot.visibleDodgeSamples,
   hostileAimSamples:snapshot.visibleHostileAimSamples
  };
 }
 return{fingerprint:report.initialFingerprint,arms};
}
function collect(defenseRoot,baselineRoot,expected=6){
 if(!Number.isInteger(expected)||expected<1||expected>6)throw Error('expected must be 1..6');
 const rows=[];
 const defenseDirs=fs.readdirSync(defenseRoot).filter(n=>/^nova-frontlines-visible-defense-probe-[012]-[01]$/.test(n));
 const baselineDirs=fs.readdirSync(baselineRoot).filter(n=>/^nova-frontlines-natural-ab-[012]-public-bloom-harvest-[01]$/.test(n));
 assert.equal(defenseDirs.length,expected,'missing/duplicate defensive probe artifacts');
 assert.equal(baselineDirs.length,expected,'missing/duplicate matching baseline artifacts');
 let exercised=0;
 for(let layout=0;layout<3;layout++)for(let seed=0;seed<2;seed++){
  const d='nova-frontlines-visible-defense-probe-'+layout+'-'+seed;
  const b='nova-frontlines-natural-ab-'+layout+'-public-bloom-harvest-'+seed;
  if(!defenseDirs.includes(d)||!baselineDirs.includes(b)){
   if(expected===6)throw Error('missing predeclared pair '+layout+'-'+seed);
   continue;
  }
  const defense=loadPair(defenseRoot,d,layout,seed,POLICIES.defense);
  const baseline=loadPair(baselineRoot,b,layout,seed,POLICIES.baseline);
  assert.equal(defense.fingerprint,baseline.fingerprint,'cross-policy initial-world mismatch '+layout+'-'+seed);
  for(const arm of ['off','on'])exercised+=defense.arms[arm].dodgeSamples+defense.arms[arm].hostileAimSamples;
  rows.push({layout:LAYOUTS[layout],seed,baseline:baseline.arms,defense:defense.arms});
 }
 assert.equal(rows.length,expected,'matrix incomplete');
 assert.ok(exercised>0,'defensive policy never exercised in any predeclared trial');
 const summary={};
 for(const arm of ['off','on']){
  const fold=policy=>{
   const a=rows.map(r=>r[policy][arm]);
   return{survivors:a.filter(x=>x.survived).length,
    meanTime:a.reduce((s,x)=>s+x.time,0)/a.length,
    meanScore:a.reduce((s,x)=>s+x.score,0)/a.length,
    naturalBlooms:a.reduce((s,x)=>s+x.blooms,0),
    observedContests:a.reduce((s,x)=>s+x.contests,0),
    physicalArrivals:a.reduce((s,x)=>s+x.physicalArrivals,0),
    dodgeSamples:a.reduce((s,x)=>s+x.dodgeSamples,0),
    hostileAimSamples:a.reduce((s,x)=>s+x.hostileAimSamples,0)};
  };
  const baseline=fold('baseline'),defense=fold('defense');
  summary[arm]={baseline,defense,meanTimeDelta:defense.meanTime-baseline.meanTime,
   meanScoreDelta:defense.meanScore-baseline.meanScore};
 }
 return{method:'six matched-seed actual-game scripted-pilot policy comparison',
  expected,observed:rows.length,rows,summary,
  limitations:['Not human play or a fun score','Policy changes player actions and downstream world state; it is not a randomized human trial',
   'ON/OFF memory arms share a seed but are not independent samples',
   'Dodge/aim samples count input polls, not distinct threats or shots',
   'No claim that surviving longer proves Tactical Frontlines improves enemy encounters']};
}
if(require.main===module){
 try{
  const [d,b,n]=process.argv.slice(2);
  if(!d||!b)throw Error('usage: node frontlines-defense-matrix-report.cjs DEFENSE_ROOT BASELINE_ROOT [EXPECTED]');
  const report=collect(d,b,n==null?6:Number(n));
  fs.writeFileSync(path.join(d,'frontlines-defense-matrix-summary.json'),JSON.stringify(report,null,2));
  console.log('NOVA_FRONTLINES_DEFENSE_MATRIX '+JSON.stringify({pairs:report.observed,summary:report.summary}));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={collect,loadPair};
