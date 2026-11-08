'use strict';
// Research only. Measures browser-event timestamp -> actual Input handler
// invocation in the real fixed-step RAF owner. This is NOT input-to-photon
// latency: there is no browser event dispatch, GPU, or physical device here.
const {FixedStepRafOwner}=require('../tests/research/fixed-step-raf-owner.cjs');
const {ChronologicalInput}=require('../tests/research/fixed-step-dom-input.cjs');
function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.ceil(p*sorted.length)-1];
}
function replayInputDelivery(intervals,events,{maxSteps=2,backlogExtraTicks=2}={}){
  if(!Array.isArray(intervals)||!intervals.length||intervals.length>200000||
     intervals.some(x=>!Number.isFinite(x)||x<=0||x>10000))
    throw Error('invalid RAF intervals');
  if(!Array.isArray(events)||events.length>10000||
     events.some((e,i)=>!e||!Number.isFinite(e.atMs)||e.atMs<0||
       (i>0&&e.atMs<events[i-1].atMs)||
       !['keydown','keyup'].includes(e.kind)||
       typeof e.key!=='string'||!e.key))
    throw Error('invalid chronological keyboard events');
  const wallMs=intervals.reduce((a,b)=>a+b,0);
  if(events.some(e=>e.atMs>wallMs+1e-7))
    throw Error('input event outside RAF trace');
  let now=1000,callback=null,elapsed=0,nextEvent=0;
  const delivered=[];
  const indexedEvents=new Map();
  const input={firing:false,keyboard:{},move:{active:false},aim:{active:false},
    stickId:{move:-1,aim:-1}};
  const apply=(kind,e)=>{
    input.keyboard[e.key]=kind==='keydown';
    // The handler is called by ChronologicalInput.consumeThrough during
    // an actual RAF update or skip. It may run without a simulation tick
    // if the scheduler discards chronology; disclose that separately.
    delivered.push({kind,key:e.originalKey,atMs:e.atMs,
      appliedWallMs:now-1000,delayMs:now-1000-e.atMs});
  };
  // The synthetic input records event time via an ID, not by consulting
  // current keyboard state, which would lose repeated presses/releases.
  input.kd=e=>apply('keydown',indexedEvents.get(e.key));
  input.ku=e=>apply('keyup',indexedEvents.get(e.key));
  const timeline=new ChronologicalInput(input);
  const bridge={timeline,startMs:1000};
  const game={input,status:'playing',paused:false,sfx:{startMusic(){}},
    update(){},destroy(){},start(){},setPaused(v){this.paused=v}};
  const owner=new FixedStepRafOwner(game,timeline,bridge,{
    now:()=>now,request:fn=>{callback=fn;return 1;},
    cancel:()=>{callback=null;},render(){},maxSteps,backlogExtraTicks
  });
  try{
    owner.start();
    for(const interval of intervals){
      elapsed+=interval;now=1000+elapsed;
      while(nextEvent<events.length&&events[nextEvent].atMs<=elapsed+1e-7){
        const e=events[nextEvent++];
        // Encode event timestamp in the synthetic key so the real Input
        // handlers can report it without changing the owner or timeline.
        const key='event'+nextEvent;
        indexedEvents.set(key,{atMs:e.atMs,originalKey:e.key});
        timeline.push(e.atMs/1000,e.kind,{key});
      }
      const frame=callback;callback=null;
      if(typeof frame!=='function')throw Error('RAF callback missing');
      frame(now);
    }
    const delays=delivered.map(e=>e.delayMs);
    return {frames:intervals.length,wallMs,simulatedTicks:owner.ticks,
      droppedMs:owner.droppedMs,remainingBacklogMs:owner.lagMs,
      deliveredCount:delivered.length,pendingCount:events.length-delivered.length,
      p50ApplyDelayMs:percentile(delays,.5),p95ApplyDelayMs:percentile(delays,.95),
      p99ApplyDelayMs:percentile(delays,.99),
      maxApplyDelayMs:delays.length?Math.max(...delays):null,
      events:delivered};
  }finally{owner.stop();}
}
module.exports={replayInputDelivery};
