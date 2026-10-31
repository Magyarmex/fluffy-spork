'use strict';
/* Collate all predeclared real-game scripted-pilot trials for #147.
 * The result is an upper-bound exposure census, NOT a collision-correction
 * success rate, actual certificate activation count, or human-play estimate. */
const fs=require('node:fs'),path=require('node:path');
const BUCKETS=['zero','one','two','threeToEight','nineToSixteen','seventeenToThirtyTwo','thirtyThreePlus'];
const FIELDS=['bulletUpdateCalls','projectileCountSum','basicEligibleFrames',
 'coverBreaks','coverBreaksAtThreeToEight','coverBreaksAboveEight',
 'coverBreaksBasicEligible','brokenCounterResets'];
function check(a,label){
 if(!a||a.schema!==1)throw Error(label+': missing density schema');
 for(const k of FIELDS)if(!Number.isSafeInteger(a[k])||a[k]<0)
  throw Error(label+': invalid '+k);
 if(!Number.isFinite(a.simulatedBulletSeconds)||a.simulatedBulletSeconds<0)
  throw Error(label+': invalid simulated time');
 if(!Number.isSafeInteger(a.peakProjectiles)||a.peakProjectiles<0)
  throw Error(label+': invalid peak');
 let sum=0;
 for(const k of BUCKETS){
  const v=a.projectileCountBuckets?.[k];
  if(!Number.isSafeInteger(v)||v<0)throw Error(label+': invalid bucket '+k);
  sum+=v;
 }
 if(sum!==a.bulletUpdateCalls||
    a.basicEligibleFrames>a.projectileCountBuckets.threeToEight||
    a.coverBreaksBasicEligible>a.coverBreaksAtThreeToEight||
    a.coverBreaksAtThreeToEight+a.coverBreaksAboveEight>a.coverBreaks)
  throw Error(label+': contradictory necessary-gate counts');
 return a;
}
function empty(){
 return {...Object.fromEntries(FIELDS.map(k=>[k,0])),
  simulatedBulletSeconds:0,peakProjectiles:0,
  projectileCountBuckets:Object.fromEntries(BUCKETS.map(k=>[k,0]))};
}
function add(sum,a){
 for(const k of FIELDS)sum[k]+=a[k];
 sum.simulatedBulletSeconds+=a.simulatedBulletSeconds;
 sum.peakProjectiles=Math.max(sum.peakProjectiles,a.peakProjectiles);
 for(const k of BUCKETS)sum.projectileCountBuckets[k]+=a.projectileCountBuckets[k];
}
function finish(a){
 const calls=a.bulletUpdateCalls,breaks=a.coverBreaks;
 return {...a,
  fractionAboveEight:calls?a.projectileCountBuckets.nineToSixteen/calls+
   (a.projectileCountBuckets.seventeenToThirtyTwo+a.projectileCountBuckets.thirtyThreePlus)/calls:null,
  fractionBasicEligible:calls?a.basicEligibleFrames/calls:null,
  fractionCoverBreaksAtBasicGate:breaks?a.coverBreaksBasicEligible/breaks:null,
  fractionCoverBreaksAboveEight:breaks?a.coverBreaksAboveEight/breaks:null};
}
function collect(root,expected=18){
 if(!Number.isSafeInteger(expected)||expected<1)throw Error('invalid expected pair count');
 const dirs=fs.readdirSync(root,{withFileTypes:true})
  .filter(x=>x.isDirectory()&&x.name.startsWith('nova-frontlines-natural-ab-'))
  .map(x=>x.name).sort();
 if(dirs.length!==expected)throw Error('incomplete density matrix: '+dirs.length+' / '+expected);
 const totals={ON:empty(),OFF:empty()},policies={},observations=[];
 for(const dir of dirs){
  const file=path.join(root,dir,'frontlines-natural-match-ab.json');
  const report=JSON.parse(fs.readFileSync(file,'utf8'));
  if(report.initialWorldIdentical!==true||report.offReplayIdentical!==true||
     JSON.stringify(report.off)!==JSON.stringify(report.offReplay))
   throw Error(dir+': failed paired replay integrity');
  const meta=report.off?.metadata;
  if(!meta||meta.layout!==report.on?.metadata?.layout||
     meta.seed!==report.on?.metadata?.seed||
     meta.pilotPolicy!==report.on?.metadata?.pilotPolicy)
   throw Error(dir+': mismatched arm metadata');
  const policy=meta.pilotPolicy;
  if(!['wander','public-bloom','public-bloom-harvest','public-bloom-harvest-defense'].includes(policy))
   throw Error(dir+': invalid policy');
  if(!policies[policy])policies[policy]={ON:empty(),OFF:empty()};
  const row={layout:meta.layout,seed:meta.seed,pilotPolicy:policy};
  for(const arm of ['OFF','ON']){
   const s=report[arm.toLowerCase()];
   const a=check(s?.projectileDensityAudit,dir+' '+arm);
   add(totals[arm],a);add(policies[policy][arm],a);
   row[arm]={bulletUpdateCalls:a.bulletUpdateCalls,simulatedBulletSeconds:a.simulatedBulletSeconds,
    peakProjectiles:a.peakProjectiles,basicEligibleFrames:a.basicEligibleFrames,
    coverBreaks:a.coverBreaks,coverBreaksBasicEligible:a.coverBreaksBasicEligible,
    coverBreaksAboveEight:a.coverBreaksAboveEight,
    endedEarly:s?.game?.status==='dead'};
  }
  observations.push(row);
 }
 for(const k of Object.keys(totals))totals[k]=finish(totals[k]);
 for(const p of Object.keys(policies))for(const k of Object.keys(policies[p]))
  policies[p][k]=finish(policies[p][k]);
 return {method:'read-only composed Game.updateBullets census in deterministic natural-match Chromium',
  expectedPairs:expected,observedPairs:dirs.length,totals,policies,observations,
  limitations:['Necessary gates only: no direct certificate activation or hit-correction witness',
   'Cover breaks are counted only within updateBullets; no attribution to a specific certificate',
   'ON/OFF arms are matched experiments, not independent random players; OFF replay is not double-counted',
   'Scripted Scout pilots, fixed seeds and 165s maximum runs do not represent human-match frequency',
   'Trials ending in death are retained with their actual sampled time; zero-break rates are null, not zero']};
}
if(require.main===module){
 try{
  const root=process.argv[2]||path.join('artifacts','matrix');
  const expected=process.argv[3]==null?18:Number(process.argv[3]);
  const report=collect(root,expected);
  fs.writeFileSync(path.join(root,'projectile-density-summary.json'),JSON.stringify(report,null,2));
  console.log('NOVA_PROJECTILE_DENSITY '+JSON.stringify({
   pairs:report.observedPairs,
   off:report.totals.OFF,on:report.totals.ON,
   limitations:report.limitations.length}));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={collect,check,finish};
