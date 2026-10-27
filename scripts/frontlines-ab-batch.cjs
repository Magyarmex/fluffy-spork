'use strict';
/* NOVA TANKS — paired multi-match Frontlines analysis.
 * Every comparison needs an explicit layout/seed pairing. This tool does NOT
 * generate matches, prove equal inputs, or turn descriptive rates into fun. */
const fs=require('node:fs'),path=require('node:path');
const {parseSnapshot,extract}=require('./frontlines-ab-report.cjs');
const METRICS={
 arrivalsPer100OutsideBotSeconds:['aiPhysicalArrivals','hostileOutsideBotSeconds',100],
 contestsPerPilotMinute:['observedContests','pilotAliveSeconds',60],
 neutralXpPerPilotMinute:['neutralXP','pilotAliveSeconds',60],
 deathCensorsPerAnnouncement:['pilotDeathCensors','announcements',1]
};
function finiteNonnegative(v,label){if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('invalid '+label);return v;}
function validKey(v,label){if((typeof v!=='string'&&typeof v!=='number')||String(v).trim()==='')throw Error('missing '+label);return String(v);}
function ratio(n,d,scale){return d>0?n/d*scale:null;}
function rounded(v){return v==null?null:+v.toFixed(5);}
function percentile(sorted,p){const k=(sorted.length-1)*p,a=Math.floor(k),b=Math.ceil(k);return sorted[a]+(sorted[b]-sorted[a])*(k-a);}
function bootstrap(values,repetitions=2000){
 if(values.length<4)return null;
 let seed=0x9e3779b9;
 const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const samples=[];
 for(let i=0;i<repetitions;i++){
  let total=0;for(let j=0;j<values.length;j++)total+=values[Math.floor(next()*values.length)];
  samples.push(total/values.length);
 }
 samples.sort((a,b)=>a-b);
 return [rounded(percentile(samples,.025)),rounded(percentile(samples,.975))];
}
function metadata(s){return{layout:s.layout??s.metadata?.layout??null,seed:s.seed??s.metadata?.seed??null,
 pilotPolicy:s.pilotPolicy??s.metadata?.pilotPolicy??null};}
function checkSnapshot(s,layout,seed,policy,arm){
 const m=metadata(s);
 if(m.layout==null||String(m.layout)!==layout)throw Error(arm+' snapshot layout differs from manifest: '+m.layout+' vs '+layout);
 if(m.seed==null||String(m.seed)!==seed)throw Error(arm+' snapshot seed differs from manifest: '+m.seed+' vs '+seed);
 if(policy!=null&&m.pilotPolicy!==policy)throw Error(arm+' snapshot pilot policy differs from manifest: '+m.pilotPolicy+' vs '+policy);
 if(policy==null&&m.pilotPolicy!=null)throw Error(arm+' snapshot pilot policy missing from manifest: '+m.pilotPolicy);
 return extract(s);
}
function groupSummary(pairs){
 const metrics={};
 for(const [name,[num,den,scale]] of Object.entries(METRICS)){
  const usable=pairs.filter(p=>p.on.counts[den]>0&&p.off.counts[den]>0);
  const differences=usable.map(p=>ratio(p.on.counts[num],p.on.counts[den],scale)-ratio(p.off.counts[num],p.off.counts[den],scale));
  const totals={on:{numerator:0,denominator:0},off:{numerator:0,denominator:0}};
  for(const p of usable)for(const arm of ['on','off']){
   totals[arm].numerator+=p[arm].counts[num];totals[arm].denominator+=p[arm].counts[den];
  }
  metrics[name]={pairedN:usable.length,excludedZeroExposure:pairs.length-usable.length,
   meanPairedDelta:rounded(differences.length?differences.reduce((a,b)=>a+b,0)/differences.length:null),
   pairedBootstrap95:bootstrap(differences),
   pooledOn:rounded(ratio(totals.on.numerator,totals.on.denominator,scale)),
   pooledOff:rounded(ratio(totals.off.numerator,totals.off.denominator,scale)),
   pooledDelta:rounded(ratio(totals.on.numerator,totals.on.denominator,scale)==null||ratio(totals.off.numerator,totals.off.denominator,scale)==null?null:ratio(totals.on.numerator,totals.on.denominator,scale)-ratio(totals.off.numerator,totals.off.denominator,scale)),
   denominators:{on:rounded(totals.on.denominator),off:rounded(totals.off.denominator)}
  };
 }
 return{pairs:pairs.length,metrics};
}
function analyzeManifest(manifest,load){
 if(!manifest||!Array.isArray(manifest.pairs)||!manifest.pairs.length)throw Error('manifest requires a nonempty pairs array');
 if(typeof load!=='function')throw Error('snapshot loader required');
 const seen=new Set(),pairs=[],warnings=[];
 for(let i=0;i<manifest.pairs.length;i++){
  const row=manifest.pairs[i],layout=validKey(row?.layout,'layout at pair '+i),seed=validKey(row?.seed,'seed at pair '+i);
  const policy=row.pilotPolicy==null?null:validKey(row.pilotPolicy,'pilot policy at pair '+i);
  const key=JSON.stringify([layout,seed,policy]);if(seen.has(key))throw Error('duplicate layout/seed/pilot-policy pair '+key);seen.add(key);
  const onPath=validKey(row.on,'ON snapshot path at pair '+i),offPath=validKey(row.off,'OFF snapshot path at pair '+i);
  if(onPath===offPath)throw Error('ON/OFF cannot point to the same snapshot: '+key);
  const on=checkSnapshot(load(onPath),layout,seed,policy,'ON'),off=checkSnapshot(load(offPath),layout,seed,policy,'OFF');
  for(const arm of [on,off])for(const [metric,[num,den]] of Object.entries(METRICS)){
   finiteNonnegative(arm.counts[num],metric+' numerator');finiteNonnegative(arm.counts[den],metric+' denominator');
  }
  pairs.push({layout,seed,pilotPolicy:policy,on,off});
  if(on.counts.aiPhysicalRejectedCrossings==null||off.counts.aiPhysicalRejectedCrossings==null)
   warnings.push(key+': movement-witness rejection counters missing');
  else if(on.counts.aiPhysicalRejectedCrossings||off.counts.aiPhysicalRejectedCrossings)
   warnings.push(key+': uncertified crossing candidates present (not confirmed missed arrivals)');
  if(on.counts.pilotDeathCensors||off.counts.pilotDeathCensors)warnings.push(key+': pilot death censored opportunity observation');
  if(on.counts.hostileOutsideBotSeconds<100||off.counts.hostileOutsideBotSeconds<100)warnings.push(key+': under 100 outside-sector hostile bot-seconds in at least one arm');
 }
 const layouts={};for(const layout of [...new Set(pairs.map(p=>p.layout))].sort())layouts[layout]=groupSummary(pairs.filter(p=>p.layout===layout));
 const overall=groupSummary(pairs);
 const policies={};for(const policy of [...new Set(pairs.map(p=>p.pilotPolicy??'unspecified'))].sort())
  policies[policy]=groupSummary(pairs.filter(p=>(p.pilotPolicy??'unspecified')===policy));
 const byLayout={};for(const metric of Object.keys(METRICS)){
  const vals=Object.values(layouts).map(x=>x.metrics[metric].meanPairedDelta).filter(v=>v!=null);
  byLayout[metric]=rounded(vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null);
 }
 if(pairs.length<8)warnings.push('Fewer than eight paired matches: descriptive evidence is weak.');
 if(Object.keys(policies).length>1)warnings.push('Multiple pilot policies mixed: use per-policy paired results, not the pooled overall effect.');
 if(Object.keys(layouts).length<3)warnings.push('Not all three Battlefield layouts represented.');
 if(pairs.some(p=>p.on.counts.announcements===0||p.off.counts.announcements===0))warnings.push('At least one arm observed no public BLOOM announcements.');
 warnings.push('Matching seed labels do not prove identical initial state, scripted pilot inputs, or causal effects.');
 warnings.push('Pooled rates can be distorted by different exposure mixes; prioritize per-layout paired deltas.');
 return{method:'paired descriptive natural-match Frontlines analysis; provenance supplied by manifest, not independently verified',
  pairCount:pairs.length,layoutCount:Object.keys(layouts).length,layouts,policies,overall,
  equalLayoutMeanPairedDelta:byLayout,warnings};
}
function readManifest(file){
 const dir=path.dirname(path.resolve(file)),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 return analyzeManifest(manifest,p=>parseSnapshot(fs.readFileSync(path.resolve(dir,p),'utf8')));
}
if(require.main===module){
 try{if(process.argv.length!==3)throw Error('usage: node scripts/frontlines-ab-batch.cjs MANIFEST.json');
  process.stdout.write(JSON.stringify(readManifest(process.argv[2]),null,2)+'\n');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={analyzeManifest,readManifest,groupSummary};
