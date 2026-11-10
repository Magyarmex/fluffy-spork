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
const DURATION_MS=2000;
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
 if(kind==='20Hz-jitter')return Array.from({length:40},(_,i)=>i%2?52:48);
 if(kind==='20Hz-bursts')return Array.from({length:40},(_,i)=>[65,35,54,46][i%4]);
 throw Error('unknown presentation cadence');
}
function run({seed=1517800,cls='tempest',cadence='20Hz-jitter',maxSteps=4,backlogExtraTicks=2,render=false,virtualClock=false,profileCpu=false,activeOnlyThree=false}={}){
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(g.player,cls);g.input.autofire=false;
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>1000,timeOrigin:1793560000000});
  let now=1000,callback=null,volleys=0,simMs=0,renderMs=0,peakSteps=0;
  const frameCpu=[],frameUpdateCpu=[],frameRenderCpu=[];
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
     frameUpdateCpu.push(simMs-beforeUpdate);
     frameRenderCpu.push(renderMs-beforeRender);
    }else frame(now);
    peakSteps=Math.max(peakSteps,owner.lastSteps);
   }
   const wallMs=durations.reduce((a,b)=>a+b,0);
   if(Math.abs(wallMs-DURATION_MS)>1e-6)throw Error('invalid experiment duration');
   return {cadence,maxSteps,activeOnlyThree,backlogExtraTicks,seed,cls,wallMs,updates:owner.ticks,
    simAtSec:owner.simAtSec,lagMs:owner.lagMs,droppedMs:owner.droppedMs,
    volleys,peakSteps,simMs,renderMs,
    // Real Node wall-clock measurements of this composed-Game fixture only.
    // These are NOT Chromium/Android frame-time or touch latency claims.
    frameCpuSamples:frameCpu.length,
    frameCpuP50Ms:percentile(frameCpu,.5),
    frameCpuP95Ms:percentile(frameCpu,.95),
    frameCpuP99Ms:percentile(frameCpu,.99),
    frameCpuPeakMs:frameCpu.length?Math.max(...frameCpu):null,
    frameUpdateCpuP95Ms:percentile(frameUpdateCpu,.95),
    frameRenderCpuP95Ms:percentile(frameRenderCpu,.95),
    hash:digest(physical(g)),draws:draws()};
  }finally{performance.now=originalClock;owner.stop();g.destroy();}
 });
}
module.exports={run,frameTimes};
