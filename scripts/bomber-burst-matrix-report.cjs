'use strict';
/* Research-only: classify real Bomber burst callsites under matched natural
 * scripted cover-pressure trials. Source provenance is NOT physical first
 * contact; no human-play incidence or benefit inference is warranted. */
const fs=require('node:fs'),path=require('node:path');
const KEYS=['calls','firstBursts','suppressedCalls','childrenCreated'];
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
 return a;
}
function empty(){
 return {...Object.fromEntries(KEYS.map(k=>[k,0])),
  byOwner:Object.fromEntries(CATS.byOwner.map(k=>[k,0])),
  bySource:Object.fromEntries(CATS.bySource.map(k=>[k,0])),
  byTTL:Object.fromEntries(CATS.byTTL.map(k=>[k,0])),
  bySite:{},simulatedSeconds:0,earlyDeaths:0,noBurstTrials:0};
}
function add(dst,a,game){
 for(const k of KEYS)dst[k]+=a[k];
 for(const [field,keys] of Object.entries(CATS))
  for(const k of keys)dst[field][k]+=a[field][k];
 for(const [k,v] of Object.entries(a.bySite))dst.bySite[k]=(dst.bySite[k]||0)+v;
 dst.simulatedSeconds+=game.time;
 dst.earlyDeaths+=Number(game.status==='dead');
 dst.noBurstTrials+=Number(a.firstBursts===0);
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
     off.pilotPolicy!=='cover-pressure'||on.pilotPolicy!=='cover-pressure')
   throw Error(dir+': mismatched Bomber worlds');
  const key=off.layout+'|'+off.seed;
  if(seen.has(key))throw Error('duplicate layout/seed '+key);
  seen.add(key);
  const row={layout:off.layout,seed:off.seed};
  for(const mode of ['OFF','ON']){
   const arm=r[mode.toLowerCase()],a=check(arm?.bomberBurstAudit,dir+' '+mode);
   if(!arm.game||!Number.isFinite(arm.game.time)||arm.game.time<0||
      arm.game.time>165.1)throw Error(dir+': invalid simulated time');
   add(totals[mode],a,arm.game);
   row[mode]={status:arm.game.status,time:arm.game.time,
    calls:a.calls,firstBursts:a.firstBursts,childrenCreated:a.childrenCreated,
    byOwner:a.byOwner,bySource:a.bySource,byTTL:a.byTTL,bySite:a.bySite};
  }
  rows.push(row);
 }
 return {schema:1,method:'real composed Bomber weapon, matched scripted cover-seeking vs wander; source-callsite census',
  pairs:rows.length,rows,totals,
  limits:['Only a standard Bomber scripted pilot; no human-play frequency inference',
   'Callsite source and TTL state are diagnostic, not physical-first-event classifications',
   'Other AI classes can also create shells; byOwner distinguishes pilot from other shooters',
   'Death-censored and no-burst trials remain in denominators',
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
