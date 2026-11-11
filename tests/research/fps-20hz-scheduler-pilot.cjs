'use strict';
/* RESEARCH ONLY. Real 49-overlay Game; never replaces production Game.start.
 * Compares fixed 60Hz simulation at 20Hz presentation with different bounded
 * per-presentation step budgets. Browser/mobile performance remains a gate. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {performance}=require('node:perf_hooks');
const realNow=performance.now.bind(performance);
const {bootGame,withSeed,digest,physical}=require('./audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('./fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('./fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('./fixed-step-raf-owner.cjs');
const DURATION_MS=2000,STEP_MS=1000/60;
function percentile(values,p){
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.ceil(sorted.length*p)-1];
}
function frameTimes(kind){
 if(kind==='60Hz')return Array(120).fill(1000/60);
 if(kind==='20Hz')return Array(40).fill(50);
 if(kind==='30Hz-clustered')return Array.from({length:15},()=>[55,55,1000/15-55,1000/15-55]).flat();
 if(kind==='30Hz-adversarial')return Array.from({length:15},()=>[90,5,5,100/3]).flat();
 // Active (<100ms) schedule that defeats both equal-backlog recovery policies
 // in the six-second real-damage fixture. Keep exact group sum at 133 1/3ms.
 if(kind==='30Hz-adversarial95')return Array.from({length:15},()=>{
  const a=6.9267489,b=95.49032479,c=30.76815672;
  return [a,b,c,1000/7.5-a-b-c];
 }).flat();
 // Counterexample to treating even 4+4 as universal chronology recovery:
 // three consecutive 95ms active frames, followed by nine short frames.
 // Twelve frames still total 400ms (mean 30Hz), with no >100ms stall.
 if(kind==='30Hz-triple-long-falsifier')return Array.from({length:5},()=>[
  95,95,95,...Array(9).fill((400-3*95)/9)
 ]).flat();
 // Two successive long but active frames, then short recovery frames.
 // This 2s mean-30Hz trace distinguishes 4+3 from 3+4 and defeats a
 // tempting 4.5-tick selective-fourth-step arithmetic shortcut.
 if(kind==='30Hz-double-burst'){
  const cycle=[4.49,5.9,1,1,1,1,.805,.805];
  return [...Array.from({length:7},()=>cycle).flat(),2,2,2,2]
   .map(ticks=>ticks*1000/60);
 }
 // Constructed active 30Hz falsifier: even seven-tick capacity cannot
 // guarantee conservation when alternating large and tiny gaps cluster.
 // Two groups each sum to 133 1/3ms, every individual gap stays <100ms.
 // This is a mathematical stress trace, NOT measured Android incidence.
 // Same 60 active intervals as the seven-tick falsifier, circularly shifted
 // by six callbacks. A phase change alone can defeat an apparent 4+4 win.
 // Keep the entire 60-frame sequence: rotation preserves total wall time.
 if(kind==='30Hz-seven-tick-phase-shift'){
  const gaps=frameTimes('30Hz-seven-tick-falsifier');
  return [...gaps.slice(6),...gaps.slice(0,6)];
 }
 if(kind==='30Hz-seven-tick-falsifier'){
  const cycle=[22.792522365760117,8.909842912196837,
   2.6870952012899134,98.94387285408648,
   88.53968203907604,33.072278752933606,
   4.150790813951247,7.5705817273724465];
  return [...Array.from({length:7},()=>cycle).flat(),...cycle.slice(0,4)];
 }
 // Seeded, mean-30Hz active trace that distinguishes equal-capacity 3+3
 // and 4+2. Each four-frame group totals 133 1/3ms; all gaps stay <100ms.
 // Deterministic LCG/negative-log weights, not a claim about natural incidence.
 if(kind==='30Hz-seeded-contrast'){
  let seed=7;
  const uniform=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   return (seed+.5)/4294967296;};
  const gaps=[];
  for(let group=0;group<15;group++){
   let values;
   do{
    const w=Array.from({length:4},()=>-Math.log(uniform()));
    const sum=w.reduce((a,b)=>a+b,0);
    values=w.map(x=>(1000/7.5)*x/sum);
   }while(Math.max(...values)>=100);
   gaps.push(...values);
  }
  return gaps;
 }
 // 60Hz-display-quantized mean-30Hz trace: each group contains eight
 // 16.667ms display slots across four delivered frames (no sub-refresh
 // callbacks). Constructed adversarial control: 3+3 may drop one tick while
 // 4+2 recovers it, so CPU cost and earned benefit can be measured together.
 if(kind==='30Hz-display-quantized'){
  const groups=[[1,2,2,3],[2,2,3,1],[2,2,3,1],[3,1,2,2],
   [1,3,3,1],[1,2,1,4],[2,1,1,4],[1,1,3,3],
   [4,1,2,1],[1,1,2,4],[4,1,2,1],[1,3,3,1],
   [3,1,3,1],[1,1,1,5],[5,1,1,1]];
  return groups.flat().map(ticks=>ticks*1000/60);
 }
 if(kind==='20Hz-jitter')return Array.from({length:40},(_,i)=>i%2?52:48);
 if(kind==='20Hz-bursts')return Array.from({length:40},(_,i)=>[65,35,54,46][i%4]);
 throw Error('unknown presentation cadence');
}
function run({seed=1517800,cls='tempest',cadence='20Hz-jitter',maxSteps=4,backlogExtraTicks=2,render=false,virtualClock=false,profileCpu=false,activeOnlyThree=false,denseHivemind=false}={}){
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(g.player,cls);g.input.autofire=false;
  // Opt-in nine-hunter stress fixture: use the shipping spawnDrone owner,
  // never manufacture drone objects or bypass the Controller update path.
  if(denseHivemind){
   if(cls!=='hivemind')throw Error('denseHivemind requires shipping Hivemind');
   let owned=g.drones.filter(d=>d.ownerId===g.player.id&&!d.temp);
   if(owned.length>9)throw Error('unexpected initial Hivemind swarm size');
   while(owned.length<9){
    const before=g.drones.length;
    g.spawnDrone(g.player,owned.length);
    if(g.drones.length!==before+1)throw Error('shipping spawnDrone did not create hunter');
    owned=g.drones.filter(d=>d.ownerId===g.player.id&&!d.temp);
   }
   if(owned.length!==9||owned.some(d=>d.role!=='hunter'))
    throw Error('dense fixture requires nine real owned hunters');
  }
  const initialPlayerDroneCount=g.drones.filter(d=>d.ownerId===g.player.id&&!d.temp).length;
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>1000,timeOrigin:1793560000000});
  let now=1000,callback=null,volleys=0,simMs=0,renderMs=0,peakSteps=0;
  let peakQueuedMs=0,sumQueuedMs=0,queuedOverTickFrames=0;
  const frameCpu=[],frameUpdateCpu=[],frameRenderCpu=[],frameSteps=[];
  const oldFire=g.tryFire,oldUpdate=g.update;
  g.tryFire=function(t){const n=this.bullets.length;const out=oldFire.apply(this,arguments);
   if(t===g.player&&this.bullets.length>n)volleys++;return out;};
  g.update=function(dt){const t=realNow();try{return oldUpdate.call(this,dt)}
   finally{simMs+=realNow()-t;}};
  const renderFn=render?g.__testWindow.__novaMakeRequire('')('game/render').render:null;
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,request:fn=>{callback=fn;return 1},cancel:()=>{callback=null},maxSteps,backlogExtraTicks,
   render:(game,w,h)=>{if(!renderFn)return;const t=realNow();try{renderFn(game,w,h)}
    finally{renderMs+=realNow()-t;}}
  });
  // Research-only active catch-up policy. Preserve the exact source owner's
  // >100ms stall ceiling; never patch the production RAF or game runtime.
  if(activeOnlyThree){
   if(maxSteps!==2)throw Error('activeOnlyThree requires a two-step baseline');
   const advance=owner.advance;
   owner.advance=function(ts){
    const raw=Math.max(0,ts-this.lastMs);
    this.maxSteps=raw>100+1e-7?2:3;
    return advance.call(this,ts);
   };
  }
  const originalClock=performance.now;
  try{
   owner.start(); // reset chronology before establishing held player input
   if(virtualClock)performance.now=()=>now;
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;g.input.firing=true;
   const durations=frameTimes(cadence);
   for(const d of durations){
    now+=d;const frame=callback;callback=null;
    if(profileCpu){
     const beforeUpdate=simMs,beforeRender=renderMs,start=realNow();
     frame(now);
     frameCpu.push(realNow()-start);
     frameSteps.push(owner.lastSteps);
     frameUpdateCpu.push(simMs-beforeUpdate);
     frameRenderCpu.push(renderMs-beforeRender);
    }else frame(now);
    peakSteps=Math.max(peakSteps,owner.lastSteps);
    // End-of-frame queued simulation is a phase-latency warning even when
    // no ticks were discarded. This is not touch-to-photon latency.
    peakQueuedMs=Math.max(peakQueuedMs,owner.lagMs);
    sumQueuedMs+=owner.lagMs;
    if(owner.lagMs>STEP_MS+1e-7)queuedOverTickFrames++;
   }
   const wallMs=durations.reduce((a,b)=>a+b,0);
   if(Math.abs(wallMs-DURATION_MS)>1e-6)throw Error('invalid experiment duration');
   return {cadence,maxSteps,activeOnlyThree,backlogExtraTicks,seed,cls,wallMs,updates:owner.ticks,
    simAtSec:owner.simAtSec,lagMs:owner.lagMs,droppedMs:owner.droppedMs,
    volleys,peakSteps,simMs,renderMs,peakQueuedMs,
    meanQueuedMs:sumQueuedMs/durations.length,queuedOverTickFrames,
    // Real Node wall-clock measurements of this composed-Game fixture only.
    // These are NOT Chromium/Android frame-time or touch latency claims.
    frameCpuSamples:frameCpu.length,
    // Distinguish costly three-update bursts from one-update frames.
    // These are Node-host wall-clock observations, not device budgets.
    threeStepFrameSamples:frameSteps.filter(n=>n===3).length,
    fourStepFrameSamples:frameSteps.filter(n=>n===4).length,
    oneStepFrameSamples:frameSteps.filter(n=>n===1).length,
    threeStepFrameCpuP95Ms:percentile(frameCpu.filter((_,i)=>frameSteps[i]===3),.95),
    fourStepFrameCpuP95Ms:percentile(frameCpu.filter((_,i)=>frameSteps[i]===4),.95),
    oneStepFrameCpuP95Ms:percentile(frameCpu.filter((_,i)=>frameSteps[i]===1),.95),
    frameCpuP50Ms:percentile(frameCpu,.5),
    frameCpuP95Ms:percentile(frameCpu,.95),
    frameCpuP99Ms:percentile(frameCpu,.99),
    frameCpuPeakMs:frameCpu.length?Math.max(...frameCpu):null,
    frameUpdateCpuP95Ms:percentile(frameUpdateCpu,.95),
    frameRenderCpuP95Ms:percentile(frameRenderCpu,.95),
    denseHivemind,initialPlayerDroneCount,
    playerDroneCount:g.drones.filter(d=>g.player&&d.ownerId===g.player.id).length,
    hostileTankCount:g.tanks.filter(t=>g.player&&t!==g.player&&t.alive).length,
    neutralShapeCount:g.shapes.length,
    hash:digest(physical(g)),draws:draws()};
  }finally{performance.now=originalClock;owner.stop();g.destroy();}
 });
}
module.exports={run,frameTimes};
