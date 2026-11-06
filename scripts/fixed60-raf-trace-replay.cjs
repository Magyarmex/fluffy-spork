'use strict';
// Research-only: replay recorded RAF frame intervals through the actual
// FixedStepRafOwner, not an independent approximation of its catch-up logic.
// Usage: node scripts/fixed60-raf-trace-replay.cjs path/to/intervals.json
// JSON: [33.3, 34.1, ...] or {"frameIntervalsMs":[...]}.
// No game, input, renderer, or production file is modified.
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
  const lag=[],wallDelay=[];
  let total=0,catchupFrames=0,peakSteps=0;
  try{
    owner.start();
    for(const interval of intervals){
      total+=interval;now=1000+total;
      const next=callback;callback=null;
      if(typeof next!=='function')throw Error('RAF owner lost scheduled callback');
      next(now);
      lag.push(owner.lagMs);
      wallDelay.push(Math.max(0,now-bridge.startMs-owner.simAtSec*1000));
      if(owner.lastSteps>2)catchupFrames++;
      peakSteps=Math.max(peakSteps,owner.lastSteps);
    }
    const round=x=>Math.round(x*1000)/1000;
    return {frames:intervals.length,wallMs:round(total),maxSteps,
      simulatedTicks:owner.ticks,simulatedMs:round(owner.ticks*STEP_MS),
      droppedMs:round(owner.droppedMs),droppedFrames:owner.droppedFrames,
      remainingBacklogMs:round(owner.lagMs),
      peakBacklogMs:round(Math.max(...lag)),
      p95BacklogMs:round(percentile(lag,.95)),
      p95WallToSimulationMs:round(percentile(wallDelay,.95)),
      p99WallToSimulationMs:round(percentile(wallDelay,.99)),
      catchupFrames,peakSteps};
  }finally{owner.stop();}
}
function analyze(data){
  const intervals=Array.isArray(data)?data:data&&data.frameIntervalsMs;
  return {researchOnly:true,source:'actual FixedStepRafOwner',
    results:[2,3,4].map(cap=>replay(intervals,cap))};
}
if(require.main===module){
  try{
    if(process.argv.length!==3)throw Error('usage: node scripts/fixed60-raf-trace-replay.cjs trace.json');
    console.log(JSON.stringify(analyze(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={replay,analyze};
