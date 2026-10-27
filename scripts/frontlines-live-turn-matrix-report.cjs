'use strict';
/* Research-only causal-intervention collector. The existing natural matrix
 * validates paired initial worlds, OFF replay, censoring and exposure rates.
 * This layer verifies that the *live* turn was actually isolated. */
const fs=require('node:fs'),path=require('node:path');
const {collectMatrix}=require('./frontlines-natural-matrix-report.cjs');
function count(v,label){
 if(!Number.isInteger(v)||v<0)throw Error('invalid '+label);
 return v;
}
const GATE_FIELDS=['samples','signalIntent','strongWeight','outside','selected','healthy',
 'threatClear','noHeldTarget','unspent','precombatIntersection',
 'possibleFreshStarts','possibleFreshNoHeldTarget'];
function addGate(total,audit,label){
 const gate=audit?.liveGate;
 if(!gate)throw Error(label+': missing live eligibility witness');
 const samples=count(gate.samples,label+' live gate samples');
 if(samples!==count(audit.liveSignal,label+' live signal samples'))
  throw Error(label+': live signal and gate sample totals disagree');
 let blocks=0;
 for(const [key,value] of Object.entries(gate.firstBlock||{}))
  blocks+=count(value,label+' first block '+key);
 if(blocks!==samples)throw Error(label+': live first-block partition is incomplete');
 for(const field of GATE_FIELDS)total[field]=(total[field]||0)+count(gate[field],label+' '+field);
 const first=total.firstBlock||(total.firstBlock={});
 for(const [key,value] of Object.entries(gate.firstBlock||{}))
  first[key]=(first[key]||0)+value;
 if(gate.possibleFreshNoHeldTarget>gate.possibleFreshStarts||
    gate.possibleFreshStarts>gate.precombatIntersection||
    gate.precombatIntersection>samples)
  throw Error(label+': impossible live gate intersection');
}
function collectLiveTurnMatrix(root,expected=18){
 const base=collectMatrix(root,expected);
 const dirs=fs.readdirSync(root,{withFileTypes:true})
  .filter(d=>d.isDirectory()&&d.name.startsWith('nova-frontlines-natural-ab-'))
  .map(d=>d.name).sort();
 let startedOn=0,startedOff=0,activePairs=0,exposedActivePairs=0;
 const liveGateTotals={on:{},off:{}};
 const groups={},trials=[];
 for(const dir of dirs){
  const r=JSON.parse(fs.readFileSync(path.join(root,dir,'frontlines-natural-match-ab.json'),'utf8'));
  if(r.abMode!=='live-turn')throw Error(dir+': not a live-turn intervention');
  if(r.off?.metadata?.abMode!=='live-turn'||r.on?.metadata?.abMode!=='live-turn'||
     r.offReplay?.metadata?.abMode!=='live-turn')
   throw Error(dir+': inconsistent arm intervention metadata');
  const off=count(r.off?.commitmentAudit?.startedLive,'OFF live starts'),
   on=count(r.on?.commitmentAudit?.startedLive,'ON live starts'),
   replay=count(r.offReplay?.commitmentAudit?.startedLive,'OFF replay live starts');
  if(off!==0||replay!==0)throw Error(dir+': OFF arm initiated a forbidden live commitment');
  if(r.verifiedLiveStart!==(on>0))throw Error(dir+': live-start witness disagrees with report');
  addGate(liveGateTotals.on,r.on.commitmentAudit,dir+' ON');
  addGate(liveGateTotals.off,r.off.commitmentAudit,dir+' OFF');
  const m=r.on.metadata,group=m.layout+' / '+m.pilotPolicy;
  const entry=groups[group]||(groups[group]={pairs:0,startedOn:0,startedOff:0,activePairs:0});
  entry.pairs++;entry.startedOn+=on;entry.startedOff+=off;
  if(on>0){entry.activePairs++;activePairs++;if(r.naturalOpportunityObserved)exposedActivePairs++;}
  startedOn+=on;startedOff+=off;
  trials.push({layout:m.layout,seed:m.seed,pilotPolicy:m.pilotPolicy,
   liveStartsOn:on,liveStartsOff:off,naturalOpportunityObserved:!!r.naturalOpportunityObserved,
   pilotDeathOff:r.off.frontline?.counts?.pilotDeathCensors??null,
   pilotDeathOn:r.on.frontline?.counts?.pilotDeathCensors??null});
 }
 const informative=startedOn>0&&exposedActivePairs>0;
 return{...base,method:'matched-initial-state natural-match live public BLOOM turn intervention',
  intervention:'OFF masks only matching live spent-key during each composed AI call; both arms retain public signals and stale memory',
  liveTurn:{startedOn,startedOff,activePairs,exposedActivePairs,informative,groups,trials,liveGateTotals},
  interpretation:informative?'Live intervention verified. Compare paired, exposure-normalized outcomes; later naturally generated public signals may diverge as treatment effects.':'INCONCLUSIVE: no verified ON live commitment in an exposed pair; do not interpret outcome deltas.',
  warnings:[...base.warnings,
   'Matching initial seeds do not guarantee identical later Director announcements after gameplay trajectories diverge.',
   'Observed live starts are rare and correlated; count trials, not AI frame samples, as independent evidence.']};
}
if(require.main===module){
 try{
  const root=process.argv[2]||path.join('artifacts','matrix'),expected=process.argv[3]==null?18:Number(process.argv[3]);
  const r=collectLiveTurnMatrix(root,expected);
  fs.writeFileSync(path.join(root,'frontlines-live-turn-matrix-summary.json'),JSON.stringify(r,null,2));
  console.log('NOVA_FRONTLINES_LIVE_TURN_MATRIX '+JSON.stringify({
   attempted:r.observedPairs,analyzable:r.analyzablePairs,censored:r.censored.length,
   liveStartsOn:r.liveTurn.startedOn,liveStartsOff:r.liveTurn.startedOff,
   activePairs:r.liveTurn.activePairs,informative:r.liveTurn.informative,
   liveGateOn:r.liveTurn.liveGateTotals.on,liveGateOff:r.liveTurn.liveGateTotals.off,
   pairedArrivalRateDelta:r.batch?.overall?.metrics?.arrivalsPer100OutsideBotSeconds?.meanPairedDelta??null}));
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
}
module.exports={collectLiveTurnMatrix};
