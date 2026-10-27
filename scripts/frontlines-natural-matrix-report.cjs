'use strict';
/* Collate *actual* materialized Chromium natural-match A/B artifacts.
 * A valid pair needs matching starting worlds and an identical OFF replay.
 * A closed-loop public pilot may receive different inputs after divergence.
 * This is descriptive scripted-pilot evidence, never a human-fun score. */
const fs=require('node:fs'),path=require('node:path');
const {analyzeManifest}=require('./frontlines-ab-batch.cjs');
const {parseSnapshot}=require('./frontlines-ab-report.cjs');

function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function nonnegative(v,label){
 if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('invalid '+label);
 return v;
}
function collectMatrix(root,expected=12){
 if(!Number.isInteger(expected)||expected<1)throw Error('expected pair count must be positive');
 const dirs=fs.readdirSync(root,{withFileTypes:true})
  .filter(d=>d.isDirectory()&&d.name.startsWith('nova-frontlines-natural-ab-'))
  .map(d=>d.name).sort();
 if(dirs.length!==expected)throw Error('incomplete natural-match matrix: expected '+expected+' artifact folders, got '+dirs.length);
 const pairs=[],observations=[];
 for(const dir of dirs){
  const base=path.join(root,dir),report=readJson(path.join(base,'frontlines-natural-match-ab.json'));
  const manifest=readJson(path.join(base,'frontlines-natural-manifest.json'));
  if(!Array.isArray(manifest.pairs)||manifest.pairs.length!==1)
   throw Error(dir+': expected exactly one paired manifest entry');
  if(report.initialWorldIdentical!==true||report.offReplayIdentical!==true||
     JSON.stringify(report.off)!==JSON.stringify(report.offReplay))
   throw Error(dir+': initial-world equality or independent OFF replay failed');
  const row=manifest.pairs[0];
  if(!['CROSSFIRE','SPLIT HORIZON','FOUR GATES'].includes(row.layout)||
     !['wander','public-bloom'].includes(row.pilotPolicy)||
     typeof row.seed!=='string'||!row.seed)
   throw Error(dir+': missing declared layout, seed or pilot policy');
  if(row.on!=='frontlines-natural-on.json'||row.off!=='frontlines-natural-off.json')
   throw Error(dir+': unexpected or unsafe snapshot paths');
  const on=readJson(path.join(base,row.on)),off=readJson(path.join(base,row.off));
  if(JSON.stringify(report.on)!==JSON.stringify(on)||JSON.stringify(report.off)!==JSON.stringify(off))
   throw Error(dir+': report and persisted snapshots disagree');
  const key={layout:row.layout,seed:row.seed,pilotPolicy:row.pilotPolicy};
  for(const [arm,s] of [['ON',on],['OFF',off]]){
   if(s.metadata?.layout!==key.layout||s.metadata?.seed!==key.seed||
      s.metadata?.pilotPolicy!==key.pilotPolicy)
    throw Error(dir+': '+arm+' metadata disagrees with declared pairing');
   nonnegative(s.naturalBlooms,arm+' natural BLOOM count');
   nonnegative(s.publicBloomCommandSamples,arm+' public pilot command samples');
  }
  pairs.push({...key,on:path.join(dir,row.on),off:path.join(dir,row.off)});
  observations.push({...key,off:{time:off.game?.time,status:off.game?.status,
    blooms:off.naturalBlooms,publicBloomCommandSamples:off.publicBloomCommandSamples,
    physicalArrivals:off.frontline?.counts?.aiPhysicalArrivals,
    observedContests:off.frontline?.counts?.observedContests,
    pilotDeathCensors:off.frontline?.counts?.pilotDeathCensors},
   on:{time:on.game?.time,status:on.game?.status,
    blooms:on.naturalBlooms,publicBloomCommandSamples:on.publicBloomCommandSamples,
    physicalArrivals:on.frontline?.counts?.aiPhysicalArrivals,
    observedContests:on.frontline?.counts?.observedContests,
    pilotDeathCensors:on.frontline?.counts?.pilotDeathCensors}});
 }
 const batch=analyzeManifest({pairs},p=>parseSnapshot(fs.readFileSync(path.join(root,p),'utf8')));
 const warnings=[...batch.warnings,
  'A public-bloom scripted pilot reacts to changing public announcements; ON/OFF commands may diverge after the worlds diverge.',
  'No policy here models a human player, real-device controls, strategic fun or statistically representative matchmaking.'];
 return{method:'reproducible natural full-match matrix, actual materialized NOVA TANKS',
  expectedPairs:expected,observedPairs:pairs.length,observations,batch,warnings};
}
if(require.main===module){
 try{
  const root=process.argv[2]||path.join('artifacts','matrix');
  const expected=process.argv[3]==null?12:Number(process.argv[3]);
  const report=collectMatrix(root,expected);
  fs.writeFileSync(path.join(root,'frontlines-natural-matrix-summary.json'),JSON.stringify(report,null,2));
  console.log('NOVA_FRONTLINES_NATURAL_MATRIX '+JSON.stringify({
   pairs:report.observedPairs,layouts:report.batch.layoutCount,
   policies:Object.keys(report.batch.policies),
   arrivalRateDelta:report.batch.overall.metrics.arrivalsPer100OutsideBotSeconds.meanPairedDelta,
   warnings:report.warnings.length}));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={collectMatrix};
