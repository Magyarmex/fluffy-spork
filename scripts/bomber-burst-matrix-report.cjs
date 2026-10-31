'use strict';
/* Research-only: classify real Bomber burst callsites under matched natural
 * scripted cover-pressure trials. Source provenance is NOT physical first
 * contact; no human-play incidence or benefit inference is warranted. */
const fs=require('node:fs'),path=require('node:path');
const KEYS=['calls','firstBursts','suppressedCalls','childrenCreated'];
const GATES=['soleWithoutRewound','soleRewoundNotClean','soleCleanNearAny',
 'soleCleanNoNearby','soleCleanNearShape','soleCleanNearTank','soleCleanNearDrone'];
const VETO=['missingShapeVelocity','missingTankVelocity','missingDroneVelocity',
 'excessEntitySpeed','parentShapeProximity','parentTankProximity',
 'parentDroneProximity','fragmentShapeProximity','fragmentTankProximity',
 'fragmentDroneProximity','fragmentTerrainProximity','fragmentInvalid',
 'fragmentBounds','noWitnessedSufficientVeto'];
const CATS={byOwner:['pilot','other','unknown'],
 bySource:['battlefield','core','disciplines','other','unknown'],
 byTTL:['positive','expired','unknown']};
function check(a,label){
 if(!a||a.schema!==1||!Number.isSafeInteger(a.pilotId))
  throw Error(label+': missing actual Bomber burst witness');
 for(const k of KEYS)if(!Number.isSafeInteger(a[k])||a[k]<0)
  throw Error(label+': invalid '+k);
 if(a.firstBursts+a.suppressedCalls!==a.calls)
  throw Error(label+': inconsistent burst calls');
 for(const [field,keys] of Object.entries(CATS)){
  if(!a[field]||keys.some(k=>!Number.isSafeInteger(a[field][k])||a[field][k]<0)||
    keys.reduce((n,k)=>n+a[field][k],0)!==a.firstBursts)
   throw Error(label+': invalid '+field);
 }
 if(!a.bySite||Object.values(a.bySite).some(v=>!Number.isSafeInteger(v)||v<0)||
    Object.values(a.bySite).reduce((n,v)=>n+v,0)!==a.firstBursts)
  throw Error(label+': invalid source sites');
 if(!Array.isArray(a.examples)||a.examples.length>20)
  throw Error(label+': invalid bounded examples');
 const b=a.airburst;
 if(!b||!['calls','sole','advanced','stationary','mixed','noChildren',
  'children','advancedChildren','observerErrors'].every(k=>Number.isSafeInteger(b[k])&&b[k]>=0)||
  !Number.isFinite(b.advancedDistance)||b.advancedDistance<0||
  b.advanced+b.stationary+b.mixed+b.noChildren!==b.calls||
  b.sole>b.calls||b.calls!==a.bySource.disciplines||b.advancedChildren>b.children||
  b.children>a.childrenCreated||
  !b.byOwner||CATS.byOwner.some(k=>!Number.isSafeInteger(b.byOwner[k])||b.byOwner[k]<0)||
  CATS.byOwner.reduce((n,k)=>n+b.byOwner[k],0)!==b.calls||
  !Array.isArray(b.examples)||b.examples.length>20||b.observerErrors!==0||
  !b.gates||GATES.some(k=>!Number.isSafeInteger(b.gates[k])||b.gates[k]<0)||
  b.gates.soleWithoutRewound+b.gates.soleRewoundNotClean+
   b.gates.soleCleanNearAny+b.gates.soleCleanNoNearby!==b.sole||
  ['soleCleanNearShape','soleCleanNearTank','soleCleanNearDrone'].some(k=>
   b.gates[k]>b.gates.soleCleanNearAny)||
  !b.veto||!Number.isSafeInteger(b.veto.eligible)||
  b.veto.eligible!==b.gates.soleCleanNoNearby||
  !b.veto.counts||VETO.some(k=>!Number.isSafeInteger(b.veto.counts[k])||
   b.veto.counts[k]<0||b.veto.counts[k]>b.veto.eligible))
  throw Error(label+': invalid airburst activation witness');
 return a;
}
function empty(){
 return {...Object.fromEntries(KEYS.map(k=>[k,0])),
  byOwner:Object.fromEntries(CATS.byOwner.map(k=>[k,0])),
  bySource:Object.fromEntries(CATS.bySource.map(k=>[k,0])),
  byTTL:Object.fromEntries(CATS.byTTL.map(k=>[k,0])),
  bySite:{},airburst:{calls:0,sole:0,advanced:0,stationary:0,mixed:0,
   noChildren:0,children:0,advancedChildren:0,advancedDistance:0,
   byOwner:{pilot:0,other:0,unknown:0},observerErrors:0,
   gates:Object.fromEntries(GATES.map(k=>[k,0])),
   veto:{eligible:0,counts:Object.fromEntries(VETO.map(k=>[k,0]))}},
  simulatedSeconds:0,earlyDeaths:0,noBurstTrials:0,
  shellsFired:0,noShellTrials:0,evolvedTrials:0};
}
function add(dst,a,game,shellsFired,finalClass){
 for(const k of KEYS)dst[k]+=a[k];
 for(const [field,keys] of Object.entries(CATS))
  for(const k of keys)dst[field][k]+=a[field][k];
 for(const [k,v] of Object.entries(a.bySite))dst.bySite[k]=(dst.bySite[k]||0)+v;
 for(const k of ['calls','sole','advanced','stationary','mixed','noChildren',
  'children','advancedChildren','advancedDistance','observerErrors'])
  dst.airburst[k]+=a.airburst[k];
 for(const k of CATS.byOwner)dst.airburst.byOwner[k]+=a.airburst.byOwner[k];
 for(const k of GATES)dst.airburst.gates[k]+=a.airburst.gates[k];
 dst.airburst.veto.eligible+=a.airburst.veto.eligible;
 for(const k of VETO)dst.airburst.veto.counts[k]+=a.airburst.veto.counts[k];
 dst.simulatedSeconds+=game.time;
 dst.earlyDeaths+=Number(game.status==='dead');
 dst.noBurstTrials+=Number(a.firstBursts===0);
 dst.shellsFired+=shellsFired;
 dst.noShellTrials+=Number(shellsFired===0);
 dst.evolvedTrials+=Number(finalClass!=='bomber');
}
function collect(root,expected=6){
 if(!Number.isSafeInteger(expected)||expected<1)throw Error('invalid pair count');
 const dirs=fs.readdirSync(root,{withFileTypes:true})
  .filter(x=>x.isDirectory()&&x.name.startsWith('nova-bomber-burst-'))
  .map(x=>x.name).sort();
 if(dirs.length!==expected)throw Error('incomplete Bomber matrix '+dirs.length+'/'+expected);
 const rows=[],seen=new Set(),totals={OFF:empty(),ON:empty()};
 for(const dir of dirs){
  const r=JSON.parse(fs.readFileSync(path.join(root,dir,'frontlines-natural-match-ab.json'),'utf8'));
  if(r.bomberResearch!==true||r.abMode!=='cover-pressure'||
     r.initialWorldIdentical!==true||r.offReplayIdentical!==true||
     JSON.stringify(r.off)!==JSON.stringify(r.offReplay))
   throw Error(dir+': paired replay integrity failed');
  const off=r.off?.metadata,on=r.on?.metadata;
  if(!off||!on||off.pilotClass!=='bomber'||on.pilotClass!=='bomber'||
     off.layout!==on.layout||off.seed!==on.seed||
     off.pilotPolicy!=='cover-pressure'||on.pilotPolicy!=='cover-pressure'||
     typeof off.pilotClassFinal!=='string'||typeof on.pilotClassFinal!=='string')
   throw Error(dir+': mismatched Bomber worlds');
  const key=off.layout+'|'+off.seed;
  if(seen.has(key))throw Error('duplicate layout/seed '+key);
  seen.add(key);
  const row={layout:off.layout,seed:off.seed};
  for(const mode of ['OFF','ON']){
   const arm=r[mode.toLowerCase()],a=check(arm?.bomberBurstAudit,dir+' '+mode);
   if(!arm.game||!Number.isFinite(arm.game.time)||arm.game.time<0||
      arm.game.time>165.1)throw Error(dir+': invalid simulated time');
   const shells=arm.coverPressure?.playerShellsFired;
   if(!Number.isSafeInteger(shells)||shells<0)
    throw Error(dir+': missing actual Bomber shell emissions');
   add(totals[mode],a,arm.game,shells,arm.metadata.pilotClassFinal);
   row[mode]={status:arm.game.status,time:arm.game.time,
    calls:a.calls,firstBursts:a.firstBursts,childrenCreated:a.childrenCreated,
    shellsFired:arm.coverPressure.playerShellsFired,
    finalClass:arm.metadata.pilotClassFinal,
    byOwner:a.byOwner,bySource:a.bySource,byTTL:a.byTTL,bySite:a.bySite,
    airburst:a.airburst};
  }
  rows.push(row);
 }
 const rates={};
 for(const mode of ['OFF','ON']){
  const t=totals[mode],b=t.airburst;
  rates[mode]={
   airburstsPerMinute:t.simulatedSeconds>0?b.calls*60/t.simulatedSeconds:null,
   correctedBurstsPerMinute:t.simulatedSeconds>0?b.advanced*60/t.simulatedSeconds:null,
   correctedFraction:b.calls>0?b.advanced/b.calls:null,
   soleProjectileFraction:b.calls>0?b.sole/b.calls:null,
   correctedChildrenFraction:b.children>0?b.advancedChildren/b.children:null};
 }
 return {schema:1,method:'real composed Bomber weapon, matched scripted cover-seeking vs wander; source-callsite and birth-frame activation census',
  pairs:rows.length,rows,totals,rates,
  limits:['Only a standard Bomber scripted pilot; no human-play frequency inference',
   'Airburst activation counts use actual post-update fragment displacement and TTL; stationary does not prove a defect',
   'Parent rewind is inferred from witnessed fuse geometry; near-body flags are sufficient lower-bound vetoes, not a complete first-blocker oracle',
   'Veto counts overlap; every true flag is a sufficient conservative abstention under the shipping helper, but a zero flag does not prove safety',
   'Only Disciplines callsites inside a witnessed update frame count toward activation; any others remain source-only',
   'No collision, damage or player-value causality can be inferred from read-only displacement alone',
   'Callsite source and TTL state are diagnostic, not physical-first-event classifications',
   'Other AI classes can also create shells; byOwner distinguishes pilot from other shooters',
   'The initial scripted class is Bomber; final class and evolution are reported, not silently assumed',
   'Death-censored, no-shell and no-burst trials remain in denominators',
   'Each pair shares the same initial world, but policies change later world states',
   'Zero burst count does not imply zero player skill opportunity or zero physical defect']};
}
if(require.main===module){
 try{
  const root=process.argv[2]||'artifacts/bomber-burst';
  const report=collect(root,process.argv[3]==null?6:Number(process.argv[3]));
  fs.writeFileSync(path.join(root,'bomber-burst-summary.json'),JSON.stringify(report,null,2));
  console.log('NOVA_BOMBER_BURST '+JSON.stringify({pairs:report.pairs,totals:report.totals}));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={check,collect,empty,add};
