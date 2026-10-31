'use strict';
/* Six predeclared real-game cover-pressure versus wander pairs for #572.
 * Never turn censored/dead trials into successes or assume pilot attribution
 * for cover damaged by bots. No natural-match baseline is overwritten. */
const fs=require('node:fs'),path=require('node:path');
const KEYS=['coverBroken','coverDamage','certifiedActivations','playerShotsFired','aimSamples','moveSamples','noTargetSamples'];
function arm(a,label){
 if(!a||!a.game||!a.projectileDensityAudit||!a.coverPressure)
  throw Error(label+': missing real-game evidence');
 const c=a.coverPressure,d=a.projectileDensityAudit;
 for(const k of KEYS)if(!Number.isFinite(c[k])||c[k]<0||
    (k!=='coverDamage'&&!Number.isSafeInteger(c[k])))
  throw Error(label+': invalid '+k);
 if(!Number.isSafeInteger(d.bulletUpdateCalls)||d.bulletUpdateCalls<1||
    !Number.isSafeInteger(d.coverBreaks)||d.coverBreaks<0||
    !Number.isSafeInteger(d.basicEligibleFrames)||d.basicEligibleFrames<0||
    d.basicEligibleFrames>d.bulletUpdateCalls)
  throw Error(label+': invalid projectile census');
 if(!Number.isFinite(a.game.time)||a.game.time<0||a.game.time>165.1)
  throw Error(label+': invalid simulated time');
 return {status:a.game.status,simulatedSeconds:a.game.time,
  earlyDeath:a.game.status==='dead',...Object.fromEntries(KEYS.map(k=>[k,c[k]])),
  bulletUpdateCalls:d.bulletUpdateCalls,basicEligibleFrames:d.basicEligibleFrames,
  coverBreaksAtBasicGate:d.coverBreaksBasicEligible};
}
function collect(root,expected=6){
 if(!Number.isSafeInteger(expected)||expected<1)throw Error('invalid expected pair count');
 const dirs=fs.readdirSync(root,{withFileTypes:true})
  .filter(x=>x.isDirectory()&&x.name.startsWith('nova-cover-pressure-')).map(x=>x.name).sort();
 if(dirs.length!==expected)throw Error('incomplete cover-pressure matrix '+dirs.length+'/'+expected);
 const seen=new Set(),rows=[],totals={OFF:{},ON:{}};
 for(const mode of ['OFF','ON'])totals[mode]={
  simulatedSeconds:0,earlyDeaths:0,coverBroken:0,coverDamage:0,certifiedActivations:0,playerShotsFired:0,
  aimSamples:0,moveSamples:0,noTargetSamples:0,bulletUpdateCalls:0,
  basicEligibleFrames:0,coverBreaksAtBasicGate:0};
 for(const dir of dirs){
  const report=JSON.parse(fs.readFileSync(path.join(root,dir,'frontlines-natural-match-ab.json'),'utf8'));
  if(report.abMode!=='cover-pressure'||report.initialWorldIdentical!==true||
     report.offReplayIdentical!==true||
     JSON.stringify(report.off)!==JSON.stringify(report.offReplay))
   throw Error(dir+': failed paired initial-world/replay integrity');
  const off=report.off?.metadata,on=report.on?.metadata;
  if(!off||!on||off.abMode!=='cover-pressure'||on.abMode!=='cover-pressure'||
     off.pilotPolicy!=='cover-pressure'||on.pilotPolicy!=='cover-pressure'||
     off.layout!==on.layout||off.seed!==on.seed)
   throw Error(dir+': mismatched research arms');
  const key=off.layout+'|'+off.seed;
  if(seen.has(key))throw Error('duplicate layout/seed '+key);
  seen.add(key);
  const row={layout:off.layout,seed:off.seed};
  for(const mode of ['OFF','ON']){
   const a=arm(report[mode.toLowerCase()],dir+' '+mode);
   if(mode==='OFF'&&(a.aimSamples!==0||a.moveSamples!==0))
    throw Error(dir+': wander arm received cover-pressure commands');
   row[mode]=a;
   for(const k of Object.keys(totals[mode]))
    totals[mode][k]+=k==='earlyDeaths'?Number(a.earlyDeath):a[k];
  }
  rows.push(row);
 }
 return {method:'real 48-overlay deterministic Scout cover-pressure versus wander, three layouts x two seeds',
  pairs:rows.length,rows,totals,
  limits:['Scripted Scout policies are not representative human players',
   'Deaths censor exposure and are included in denominators',
   'Cover damage/breaks include other tanks and are not exclusively pilot-caused',
   'Certified activations are measured, but downstream player-relevant hits are not attributed',
   'Actual player projectile emissions are counted; they are not guaranteed hits or damage attribution']};
}
if(require.main===module){
 try{
  const root=process.argv[2]||'artifacts/cover-pressure';
  const report=collect(root,process.argv[3]==null?6:Number(process.argv[3]));
  fs.writeFileSync(path.join(root,'cover-pressure-summary.json'),JSON.stringify(report,null,2));
  console.log('NOVA_COVER_PRESSURE '+JSON.stringify({pairs:report.pairs,totals:report.totals}));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={collect,arm};
