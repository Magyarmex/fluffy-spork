'use strict';
/* Research-only #648: measure actual composed-game Tempest cadence under
 * irregular frame intervals, not merely constant 30/60Hz.
 * This deliberately does NOT assert parity: native variable-step combat is
 * known to underfire, and its existing 60Hz behavior is the reference.
 * Run: node tests/research/tempest-irregular-cadence-pilot.cjs
 * Optional: NOVA_JITTER_SEEDS=1517800,1517802 NOVA_JITTER_RELOAD=0,4,8
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const parse=(name,fallback,min,max)=>{
 const values=(process.env[name]||fallback).split(',').map(s=>Number(s.trim()));
 if(!values.length||values.some(n=>!Number.isInteger(n)||n<min||n>max))
  throw new Error(name+' must contain integers in ['+min+','+max+']');
 return [...new Set(values)];
};
const seeds=parse('NOVA_JITTER_SEEDS','1517800,1517802,1517810',0,2147483647);
const reloads=parse('NOVA_JITTER_RELOAD','0,4,5,8',0,8);
// Phase rotations preserve each six-step schedule's interval multiset and total time.
const phases=parse('NOVA_JITTER_PHASES','0',0,5);
const TICKS=960; // exactly 8 simulated seconds at a 120Hz integer timebase
// Optional exact-tick burst experiments. Transitions use integer simulated
// ticks, never floating-point wall time or browser presentation FPS.
const firePattern=process.env.NOVA_JITTER_FIRE_PATTERN||'continuous';
// Durations are exact 120Hz ticks. The 0.2s/0.5s rhythm has a
// 0.7s period, so its last rest is intentionally incomplete at 8s.
const burstDurations={burst1s:[120,120],burst250ms:[30,90],burst200ms:[24,60]};
if(firePattern!=='continuous'&&!Object.hasOwn(burstDurations,firePattern))
 throw new Error('NOVA_JITTER_FIRE_PATTERN must be continuous, burst1s, burst250ms or burst200ms');
const burst=burstDurations[firePattern]||null;
// Held aim models desktop fire release; release clears aim during rests and
// instantly restores a full 40px aim vector at the next firing boundary.
// Real touch pointerdown begins at dx=0 and needs pointermove beyond deadzone;
// this is an optimistic input-state control, not a DOM gesture simulation.
const aimMode=process.env.NOVA_JITTER_AIM_MODE||'held';
if(!['held','release'].includes(aimMode))throw new Error('NOVA_JITTER_AIM_MODE must be held or release');
const patterns={
 native30:[4],native60:[2],native120:[1],
 mixedSlow:[2,4,1,1,2,2],mixedFast:[1,3,2,1,3,2],
 bursty:[4,1,1,2,2,2],alternating:[1,4,1,2,2,2],
 // Adversarial equal-mean sequences selected from a simple cooldown-only
 // enumeration; these are stress controls, not natural-device measurements.
 aliasFast:[1,1,2,3,2,3],aliasSlow:[1,1,1,3,3,3],
 // Eight-step/16-tick period still averages 60Hz, but 1s fire boundaries
 // land inside a frame for some rotations; exercises the event-split path.
 boundaryCross:[1,3,2,1,3,2,1,3]
};
const selectedPatterns=(process.env.NOVA_JITTER_PATTERNS||Object.keys(patterns).join(','))
 .split(',').map(s=>s.trim());
if(!selectedPatterns.length||selectedPatterns.some(name=>!Object.hasOwn(patterns,name))||!selectedPatterns.includes('native60'))
 throw new Error('NOVA_JITTER_PATTERNS must name known patterns and include native60');
function schedule(pattern,phase=0){
 const out=[];let elapsed=0,i=phase;
 while(elapsed<TICKS){
  const ticks=Math.min(pattern[i++%pattern.length],TICKS-elapsed);
  out.push(ticks);elapsed+=ticks;
 }
 if(elapsed!==TICKS)throw new Error('bad schedule');
 return out;
}
function run(seed,reload,name,steps){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];
  g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;g.input.autofire=false;
  p.stats.reload=reload;
  let volleys=0,restVolleys=0,peakHeat=0,peakCooldown=0,minHeat=Infinity,elapsedTicks=0,firingTicks=0,restTicks=0,updateCalls=0,restStartHeat=null,restStartSpin=null,restHeatWindows=[],restSpinWindows=[];
  const shotTimes=[],shotAngles=[],shotHeats=[],shotStabilities=[],shotSpins=[];const original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before){volleys++;if(!g.input.firing)restVolleys++;shotTimes.push(this.time);shotAngles.push(p.angle);shotHeats.push(p.__v17Heat??0);shotStabilities.push(p.__v17Stability??1);shotSpins.push(p.fireSpin??0);}
   return result;
  };
  try{
   for(const ticks of steps){
    // Split any frame crossing a burst boundary so the intended input
    // chronology is independent of frame partitioning. This is an explicit
    // input-event test, not a claim that native browser input does this.
    let remaining=ticks;
    while(remaining>0){
     const period=burst?burst[0]+burst[1]:0;
     const position=burst?elapsedTicks%period:0;
     const active=!burst||position<burst[0];
     const untilBoundary=!burst?remaining:
      (active?burst[0]-position:period-position);
     const slice=Math.min(remaining,untilBoundary);
     if(!active&&restStartHeat===null){restStartHeat=p.__v17Heat??0;restStartSpin=p.fireSpin??0;}
     g.input.firing=active;
     if(aimMode==='release'){g.input.aim.active=active;g.input.aim.dx=active?40:0;}
     g.update(slice/120);updateCalls++;
     peakHeat=Math.max(peakHeat,p.__v17Heat??0);
     minHeat=Math.min(minHeat,p.__v17Heat??0);
     peakCooldown=Math.max(peakCooldown,p.fireCd??0);
     if(active)firingTicks+=slice;else restTicks+=slice;
     elapsedTicks+=slice;remaining-=slice;
     if(!active&&elapsedTicks%(burst[0]+burst[1])===0){
      const end=p.__v17Heat??0;
      restHeatWindows.push({start:+restStartHeat.toFixed(6),end:+end.toFixed(6),
       drop:+(restStartHeat-end).toFixed(6)});
      const endSpin=p.fireSpin??0;
      restSpinWindows.push({start:+restStartSpin.toFixed(6),end:+endSpin.toFixed(6),
       drop:+(restStartSpin-endSpin).toFixed(6)});
      restStartHeat=null;restStartSpin=null;
     }
    }
   }
   return {seed,reload,name,firePattern,aimMode,burstTicks:burst?{on:burst[0],off:burst[1]}:null,frames:steps.length,updateCalls,extraInputBoundaryUpdates:updateCalls-steps.length,simulatedTicks:elapsedTicks,
    firingTicks,restTicks,restHeatWindows,restSpinWindows,volleys,restVolleys,
    baseCadenceEligibleVolleys:shotHeats.filter((h,i)=>Math.max(0,1-Math.abs(h-.56)/.30)>.62&&shotStabilities[i]>.56).length,
    tempestApexBoostVolleys:shotHeats.filter((h,i)=>Math.max(0,1-Math.abs(h-.56)/.36)>.58&&shotStabilities[i]>.52).length,
    tempestRedlinePenaltyVolleys:shotHeats.filter(h=>h>.90).length,minimumHeat:+minHeat.toFixed(6),
    heat:+(p.__v17Heat??0).toFixed(6),peakHeat:+peakHeat.toFixed(6),
    fireCd:+(p.fireCd??0).toFixed(6),peakCooldown:+peakCooldown.toFixed(6),
    firstShots:shotTimes.slice(0,8).map(n=>+n.toFixed(6)),
    lastShots:shotTimes.slice(-8).map(n=>+n.toFixed(6)),
    firstShotAngles:shotAngles.slice(0,8).map(n=>+n.toFixed(6)),
    firstShotHeats:shotHeats.slice(0,8).map(n=>+n.toFixed(6)),
    firstShotSpins:shotSpins.slice(0,8).map(n=>+n.toFixed(6)),
    lastShotSpins:shotSpins.slice(-8).map(n=>+n.toFixed(6)),
    finalSpin:+(p.fireSpin??0).toFixed(6)};
  }finally{g.destroy();}
 });
}
const all=[];
for(const seed of seeds)for(const reload of reloads){
 const cohort=Object.entries(patterns).filter(([name])=>selectedPatterns.includes(name)).flatMap(([name,pattern])=>
  (pattern.length===1?[0]:phases).map(phase=>{
   const steps=schedule(pattern,phase);
   const row=run(seed,reload,phase===0?name:name+'@'+phase,steps);
   row.pattern=name;row.phase=phase;
   // Counterfactual only: how much fire time a once-per-frame input sampler
   // would assign when it observes the state at each frame's START.
   // This does not emulate DOM event delivery or a production RAF run.
   let frameCursor=0,frameSampledFiringTicks=0;
   for(const ticks of steps){
    if(!burst||frameCursor%(burst[0]+burst[1])<burst[0])frameSampledFiringTicks+=ticks;
    frameCursor+=ticks;
   }
   row.frameSampledFiringTicks=frameSampledFiringTicks;
   row.frameSampledDutyDeltaTicks=frameSampledFiringTicks-row.firingTicks;
   row.intervalHistogram=steps.reduce((counts,ticks)=>{
    counts[ticks]=(counts[ticks]||0)+1;return counts;
   },{});
   row.simulatedTicks=steps.reduce((sum,ticks)=>sum+ticks,0);
   return row;
  }));
 const reference=cohort.find(r=>r.name==='native60');
 for(const r of cohort){
  r.deltaVs60=r.volleys-reference.volleys;
  r.pctVs60=+((r.volleys/reference.volleys-1)*100).toFixed(2);
  all.push(r);
 }
}
console.log(JSON.stringify({method:'actual materialized 49-overlay Game; held aim/fire; no targets',
 phases,firePattern,aimMode,selectedPatterns,caveats:['research-only: release mode instantly restores aim, unlike real touch pointerdown deadzone','exact input-boundary splitting can add Game.update calls beyond presentation frames','all schedules cover exactly 8 simulated seconds','0.7s burst rhythm ends in a partial rest excluded from completed rest windows','variable dt changes world update chronology, not merely presentation FPS','no player-facing patch'],patterns,seeds,reloads,results:all},null,2));
