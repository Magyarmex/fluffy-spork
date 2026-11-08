'use strict';
// Research only. Measures synthetic event timestamp -> stub Input handler
// invocation through the real browser bridge, timeline and RAF owner. NOT input-to-photon
// latency: there is no browser event dispatch, GPU, or physical device here.
const {FixedStepRafOwner}=require('../tests/research/fixed-step-raf-owner.cjs');
const {ChronologicalInput}=require('../tests/research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../tests/research/fixed-step-browser-events.cjs');
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
  let owner,applyingSkippedBoundary=false,skippedAppliedCount=0;
  const input={firing:false,keyboard:{},move:{active:false},aim:{active:false},
    stickId:{move:-1,aim:-1}};
  const apply=(kind,e)=>{
    input.keyboard[e.originalKey]=kind==='keydown';
    // The handler is called by ChronologicalInput.consumeThrough during
    // an actual RAF update or skip. It may run without a simulation tick
    // if the scheduler discards chronology; disclose that separately.
    if(applyingSkippedBoundary)skippedAppliedCount++;
    delivered.push({kind,key:e.originalKey,atMs:e.atMs,
      appliedDuringSkip:applyingSkippedBoundary,
      appliedWallMs:now-1000,delayMs:now-1000-e.atMs});
  };
  // The synthetic input records event time via an ID, not by consulting
  // current keyboard state, which would lose repeated presses/releases.
  input.kd=e=>apply('keydown',indexedEvents.get(e.key));
  input.ku=e=>apply('keyup',indexedEvents.get(e.key));
  const timeline=new ChronologicalInput(input);
  const consume=timeline.consumeThrough.bind(timeline);
  timeline.consumeThrough=function(end){
    // Normal update samples the NEXT tick; skipped-time reconciliation
    // samples the ALREADY advanced simAtSec without a corresponding update.
    applyingSkippedBoundary=!!(owner&&owner.started&&end>0&&
      end<=owner.simAtSec+1e-8);
    try{return consume(end)}finally{applyingSkippedBoundary=false}
  };
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,
    timeOrigin:1793560000000});
  const game={input,status:'playing',paused:false,sfx:{startMusic(){}},
    update(){},destroy(){},start(){},setPaused(v){this.paused=v}};
  owner=new FixedStepRafOwner(game,timeline,bridge,{
    now:()=>now,request:fn=>{callback=fn;return 1;},
    cancel:()=>{callback=null;},render(){},maxSteps,backlogExtraTicks
  });
  try{
    owner.start();
    for(const interval of intervals){
      elapsed+=interval;now=1000+elapsed;
      while(nextEvent<events.length&&events[nextEvent].atMs<=elapsed+1e-7){
        const e=events[nextEvent++];
        // Preserve a unique event identity even when timestamps coincide,
        // without changing the real owner or chronological timeline.
        const key='event'+nextEvent;
        indexedEvents.set(key,{atMs:e.atMs,originalKey:e.key});
        if(!bridge.capture({type:e.kind,timeStamp:1000+e.atMs,key,
          target:{tagName:'CANVAS',closest:()=>null}}))
          throw Error('synthetic keyboard event rejected by browser bridge');
      }
      const frame=callback;callback=null;
      if(typeof frame!=='function')throw Error('RAF callback missing');
      frame(now);
    }
    const delays=delivered.map(e=>e.delayMs);
    return {frames:intervals.length,wallMs,simulatedTicks:owner.ticks,
      droppedMs:owner.droppedMs,remainingBacklogMs:owner.lagMs,
      lateTimestampClamps:bridge.lateClamps,
      staleTimestampClamps:bridge.staleClamps,
      deliveredCount:delivered.length,
      unappliedCount:events.length-delivered.length,
      queuedCount:timeline.events.length-timeline.index,
      discardedCount:events.length-delivered.length-(timeline.events.length-timeline.index),
      appliedDuringSkippedTime:skippedAppliedCount,
      p50ApplyDelayMs:percentile(delays,.5),p95ApplyDelayMs:percentile(delays,.95),
      p99ApplyDelayMs:percentile(delays,.99),
      maxApplyDelayMs:delays.length?Math.max(...delays):null,
      events:delivered};
  }finally{owner.stop();}
}
module.exports={replayInputDelivery};
