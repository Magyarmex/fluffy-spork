'use strict';
/* NOVA TANKS — descriptive Frontlines A/B comparator.
 * Consumes real COPY ECOLOGY snapshots; never treats AI MEM as a valid
 * ON/OFF arrival comparator or a scripted microtrial as human-fun evidence. */
const fs=require('node:fs');

function parseSnapshot(text){
 const raw=String(text),start=raw.indexOf('{');
 if(start<0)throw Error('missing JSON object in COPY ECOLOGY snapshot');
 let data;
 try{data=JSON.parse(raw.slice(start));}catch(e){throw Error('invalid COPY ECOLOGY JSON: '+e.message);}
 if(!data||typeof data!=='object'||!data.frontline||!data.frontline.counts)
  throw Error('snapshot lacks frontline.counts; record an actual public BLOOM first');
 return data;
}
function count(c,key){
 const v=c[key];
 if(typeof v!=='number'||!Number.isFinite(v)||v<0)
  throw Error('invalid/missing Frontlines counter '+key+' (use current shipping runtime)');
 return v;
}
function divide(n,d,scale){return d>0?+(n/d*scale).toFixed(5):null;}
function extract(s){
 const c=s.frontline.counts;
 const fields=['announcements','aiPhysicalArrivals','hostileOutsideBotSeconds',
  'hostileBotSeconds','pilotAliveSeconds','pilotDeathCensors','observedContests','neutralXP'];
 const counts={};for(const k of fields)counts[k]=count(c,k);
 if(counts.hostileOutsideBotSeconds>counts.hostileBotSeconds+1e-6)
  throw Error('outside exposure exceeds total hostile bot exposure');
 return{layout:s.layout||s.metadata?.layout||null,seed:s.seed??s.metadata?.seed??null,
  counts,rates:{
   arrivalsPer100OutsideBotSeconds:divide(counts.aiPhysicalArrivals,counts.hostileOutsideBotSeconds,100),
   contestsPerPilotMinute:divide(counts.observedContests,counts.pilotAliveSeconds,60),
   neutralXpPerPilotMinute:divide(counts.neutralXP,counts.pilotAliveSeconds,60),
   deathCensorsPerAnnouncement:divide(counts.pilotDeathCensors,counts.announcements,1)
  }};
}
function analyzePair(onSnapshot,offSnapshot){
 const on=extract(onSnapshot),off=extract(offSnapshot);
 if(on.layout!=null&&off.layout!=null&&on.layout!==off.layout)
  throw Error('unmatched Battlefield layouts: '+on.layout+' vs '+off.layout);
 if(on.seed!=null&&off.seed!=null&&on.seed!==off.seed)
  throw Error('unmatched experiment seeds: '+on.seed+' vs '+off.seed);
 const delta={};
 for(const k of Object.keys(on.rates))
  delta[k]=on.rates[k]==null||off.rates[k]==null?null:+(on.rates[k]-off.rates[k]).toFixed(5);
 const warnings=['One paired observation is descriptive only; it does not establish causal match-frequency or fun.'];
 if(on.counts.hostileOutsideBotSeconds===0||off.counts.hostileOutsideBotSeconds===0)
  warnings.push('Zero outside-sector bot exposure: physical arrival rate is undefined.');
 if(on.counts.pilotDeathCensors||off.counts.pilotDeathCensors)
  warnings.push('Pilot death censored opportunity observation; do not compare raw totals.');
 if(on.counts.hostileOutsideBotSeconds<100||off.counts.hostileOutsideBotSeconds<100)
  warnings.push('Less than 100 outside-sector bot-seconds per arm; arrival-rate estimates are fragile.');
 return{method:'paired Frontlines descriptive rates; physical arrivals / outside-sector hostile bot-seconds',
  on,off,delta,warnings};
}
if(require.main===module){
 try{
  if(process.argv.length!==4)throw Error('usage: node scripts/frontlines-ab-report.cjs ON.txt OFF.txt');
  const on=parseSnapshot(fs.readFileSync(process.argv[2],'utf8'));
  const off=parseSnapshot(fs.readFileSync(process.argv[3],'utf8'));
  process.stdout.write(JSON.stringify(analyzePair(on,off),null,2)+'\n');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={parseSnapshot,extract,analyzePair};
