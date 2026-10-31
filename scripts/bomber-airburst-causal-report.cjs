'use strict';
/* Research-only paired physics intervention. Both arms run the same actual
 * Bomber cover-seeking pilot, with exactly one delivered Disciplines call
 * disabled in OFF. These are deterministic scripted matches, not human trials.
 * Never interpret a score/death delta as a measured benefit or balance result. */
const fs=require('node:fs'),path=require('node:path');
function assert(ok,message){if(!ok)throw Error(message);}
function validTrace(trace,label){
 assert(trace&&Array.isArray(trace.samples)&&trace.samples.length<=165,
  label+': invalid bounded physical trace');
 let previous=-Infinity;
 for(const s of trace.samples){
  assert(Number.isFinite(s.time)&&s.time>previous&&
   typeof s.hash==='string'&&/^[0-9a-f]+:[0-9a-f]+$/.test(s.hash),
   label+': invalid physical sample');
  previous=s.time;
 }
 assert(trace.firstAdvanceTime===null||
  Number.isFinite(trace.firstAdvanceTime)&&trace.firstAdvanceTime>=0,
  label+': invalid first-advance time');
}
function check(report,label){
 assert(report&&report.abMode==='bomber-physics'&&report.bomberResearch===true&&
  report.initialWorldIdentical===true&&report.offReplayIdentical===true,
  label+': invalid matched/replayed causal experiment');
 assert(JSON.stringify(report.off)===JSON.stringify(report.offReplay),
  label+': OFF replay must match completely');
 const c=report.bomberPhysicsCausal;
 assert(c&&c.sourcePatchVerified===true&&c.offAdvanced===0&&
  Number.isSafeInteger(c.onAdvanced)&&c.onAdvanced>=0&&
  Number.isSafeInteger(c.sharedPhysicalSamples)&&c.sharedPhysicalSamples>=0,
  label+': missing verified single-call intervention');
 for(const [name,arm] of [['OFF',report.off],['ON',report.on]]){
  assert(arm?.metadata?.abMode==='bomber-physics'&&
   arm.metadata.pilotPolicy==='cover-pressure'&&
   arm.metadata.pilotClass==='bomber'&&
   arm.bomberBurstAudit?.schema===1&&
   arm.bomberBurstAudit.airburst?.observerErrors===0&&
   arm.game&&Number.isFinite(arm.game.time)&&arm.game.time>=0&&
   arm.game.time<=165.1,
   label+': invalid '+name+' actual-game arm');
  validTrace(arm.bomberPhysicsTrace,label+' '+name);
 }
 assert(report.off.metadata.layout===report.on.metadata.layout&&
  report.off.metadata.seed===report.on.metadata.seed,
  label+': unmatched physical worlds');
 assert(report.off.bomberBurstAudit.airburst.advanced===0&&
  report.on.bomberBurstAudit.airburst.advanced===c.onAdvanced,
  label+': inconsistent treatment exposure');
 const a=report.off.bomberPhysicsTrace.samples,b=report.on.bomberPhysicsTrace.samples;
 const shared=Math.min(a.length,b.length);
 assert(shared===c.sharedPhysicalSamples,label+': shared sample mismatch');
 let first=null;
 for(let i=0;i<shared;i++){
  assert(a[i].time===b[i].time,label+': unmatched physical sample time');
  if(first===null&&a[i].hash!==b[i].hash)first=b[i].time;
 }
 assert(first===c.firstPhysicalDifferenceTime&&
  (first!==null)===c.physicalDifferenceObserved,
  label+': physical divergence claim is not supported by samples');
 const t=report.on.bomberPhysicsTrace.firstAdvanceTime;
 assert(t===c.firstAdvanceTime,label+': inconsistent first advance');
 assert((c.onAdvanced>0)===(t!==null),
  label+': exposure count and first advance disagree');
 assert(first===null||first+1e-6>=t,
  label+': physical state changed before treatment');
 if(c.onAdvanced===0){
  assert(JSON.stringify(a)===JSON.stringify(b)&&c.noAdvanceNoDifference===true,
   label+': unexposed worlds cannot diverge');
 }
 return {layout:report.off.metadata.layout,seed:report.off.metadata.seed,
  onAdvanced:c.onAdvanced,firstAdvanceTime:t,firstPhysicalDifferenceTime:first,
  physicalDifferenceObserved:first!==null,sharedSamples:shared,
  off:{status:report.off.game.status,time:report.off.game.time,
   score:report.off.game.score,kills:report.off.game.kills,
   level:report.off.game.level,airbursts:report.off.bomberBurstAudit.airburst.calls},
  on:{status:report.on.game.status,time:report.on.game.time,
   score:report.on.game.score,kills:report.on.game.kills,
   level:report.on.game.level,airbursts:report.on.bomberBurstAudit.airburst.calls}};
}
function collect(root,expected=6){
 assert(Number.isSafeInteger(expected)&&expected>=1,'invalid expected trial count');
 const dirs=fs.readdirSync(root,{withFileTypes:true}).filter(x=>
  x.isDirectory()&&x.name.startsWith('nova-bomber-physics-')).map(x=>x.name).sort();
 assert(dirs.length===expected,'incomplete causal matrix '+dirs.length+'/'+expected);
 const seen=new Set(),rows=[];
 for(const d of dirs){
  const file=path.join(root,d,'frontlines-natural-match-ab.json');
  const row=check(JSON.parse(fs.readFileSync(file,'utf8')),d);
  const key=row.layout+'|'+row.seed;
  assert(!seen.has(key),'duplicate layout/seed '+key);
  seen.add(key);rows.push(row);
 }
 const exposure=rows.filter(x=>x.onAdvanced>0);
 const divergence=rows.filter(x=>x.physicalDifferenceObserved);
 return {schema:1,method:'matched 48-overlay Bomber, same cover-seeking inputs, deterministic OFF replay, single delivered-script fragment-advance intervention',
  pairs:rows.length,rows,
  totals:{onAdvanced:rows.reduce((n,x)=>n+x.onAdvanced,0),
   exposedPairs:exposure.length,unexposedPairs:rows.length-exposure.length,
   physicallyDivergedPairs:divergence.length,
   exposedWithoutSampledDivergence:exposure.length-divergence.length},
  limits:['Scripted Bomber pilot; not human-play frequency, fun or balance',
   'Physical state sampled every simulated second; first divergence is interval-censored',
   'After first treatment, later AI/world/RNG differences are downstream and cannot be treated as independent events',
   'Deaths censor exposure; compare actual simulated seconds rather than equal sample counts',
   'No physical-device FPS or battery measurement',
   'No production gameplay source changed by this experiment']};
}
if(require.main===module){
 try{
  const root=process.argv[2]||'artifacts/bomber-physics';
  const report=collect(root,process.argv[3]===undefined?6:Number(process.argv[3]));
  fs.writeFileSync(path.join(root,'bomber-airburst-causal-summary.json'),JSON.stringify(report,null,2));
  console.log('NOVA_BOMBER_AIRBURST_CAUSAL '+JSON.stringify(report.totals));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={check,collect,validTrace};
