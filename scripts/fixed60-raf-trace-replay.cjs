'use strict';
// Research-only: replay recorded RAF frame intervals through the actual
// FixedStepRafOwner, not an independent approximation of its catch-up logic.
// Usage: node scripts/fixed60-raf-trace-replay.cjs path/to/intervals.json
// JSON: [33.3, 34.1, ...] or {"frameIntervalsMs":[...]}.
// Phase lag is NOT input latency: skipped simulation time can make it zero.\n// Always read droppedMs and remainingBacklogMs alongside it.\n// Input traces must cover an active, unpaused, foreground match; raw RAF gaps\n// cannot identify hidden-tab, pause, or player-input transitions.\n// No game, input, renderer, or production file is modified.
const fs=require('node:fs');
const {FixedStepRafOwner}=require('../tests/research/fixed-step-raf-owner.cjs');
const STEP_MS=1000/60;
function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.ceil(p*sorted.length)-1];
}
function replay(intervals,maxSteps=2){
  if(!Array.isArray(intervals)||!intervals.length||intervals.length>200000||
     intervals.some(v=>!Number.isFinite(v)||v<=0||v>10000))
    throw Error('expected 1..200000 finite positive RAF intervals <=10000ms');
  if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>4)
    throw Error('maxSteps must be 1..4');
  const input={firing:false,keyboard:{},move:{active:false},aim:{active:false},
    stickId:{move:-1,aim:-1}};
  const game={input,paused:false,status:'playing',sfx:{startMusic(){}},
    update(){},destroy(){},start(){},setPaused(v){this.paused=v}};
  const timeline={input,reset(){},consumeThrough(){},events:[],index:0,tickOrigin:0};
  const bridge={timeline,startMs:1000};
  let now=1000,callback=null;
  const owner=new FixedStepRafOwner(game,timeline,bridge,{
    now:()=>now,request:fn=>{callback=fn;return 1},
    cancel:()=>{callback=null},render(){},maxSteps
  });
  const lag=[],phaseLag=[];
  let total=0,catchupFrames=0,peakSteps=0;
  try{
    owner.start();
    for(const interval of intervals){
      total+=interval;now=1000+total;
      const next=callback;callback=null;
      if(typeof next!=='function')throw Error('RAF owner lost scheduled callback');
      next(now);
      lag.push(owner.lagMs);
      phaseLag.push(Math.max(0,now-bridge.startMs-owner.simAtSec*1000));
      if(owner.lastSteps>2)catchupFrames++;
      peakSteps=Math.max(peakSteps,owner.lastSteps);
    }
    const round=x=>Math.round(x*1000)/1000;
    return {frames:intervals.length,wallMs:round(total),maxSteps,
      maxFrameGapMs:round(intervals.reduce((peak,v)=>Math.max(peak,v),0)),
      p95FrameGapMs:round(percentile(intervals,.95)),
      foregroundStallFrames:intervals.filter(v=>v>100+1e-7).length,
      simulatedTicks:owner.ticks,simulatedMs:round(owner.ticks*STEP_MS),
      droppedMs:round(owner.droppedMs),droppedFrames:owner.droppedFrames,
      remainingBacklogMs:round(owner.lagMs),
      peakBacklogMs:round(lag.reduce((peak,v)=>Math.max(peak,v),0)),
      p95BacklogMs:round(percentile(lag,.95)),
      p95SimulationPhaseLagMs:round(percentile(phaseLag,.95)),
      p99SimulationPhaseLagMs:round(percentile(phaseLag,.99)),
      catchupFrames,peakSteps};
  }finally{owner.stop();}
}
function analyze(data){
  const intervals=Array.isArray(data)?data:data&&data.frameIntervalsMs;
  return {researchOnly:true,source:'actual FixedStepRafOwner',
    capture:Array.isArray(data)?null:(data&&data.capture||null),
    results:[2,3,4].map(cap=>replay(intervals,cap))};
}
if(require.main===module){
  try{
    if(process.argv.length!==3)throw Error('usage: node scripts/fixed60-raf-trace-replay.cjs trace.json');
    console.log(JSON.stringify(analyze(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={replay,analyze};
