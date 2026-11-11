'use strict';
// #799 research-only: a DOM touch press/release can both be delivered yet
// never reach Game.update when the bounded fixed60 owner skips a tick.
// This tests the exact opt-in owner/input source, not production controls.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function replay(intervals,maxSteps=2,backlogExtraTicks=2,events=[
  {at:40,type:'pointerdown'},{at:52,type:'pointerup'}],expectedMs=6000){
 let now=1000,callback=null,fireUpdates=0;
 const input={
  firing:false,keyboard:{},move:{active:false},aim:{active:false},
  stickId:{move:-1,aim:-1},
  pd(){this.firing=true},pm(){},pu(){this.firing=false},
  kd(){},ku(){}
 };
 const game={input,sfx:{startMusic(){}},paused:false,status:'playing',
  update(){if(input.firing)fireUpdates++},
  start(){},destroy(){},setPaused(){}};
 const timeline=new ChronologicalInput(input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
  render:()=>{},maxSteps,backlogExtraTicks
 });
 let elapsed=0,nextEvent=0;
 try{
  owner.start();
  for(const dt of intervals){
   elapsed+=dt;now=1000+elapsed;
   while(nextEvent<events.length&&events[nextEvent].at<=elapsed+1e-6){
    const e=events[nextEvent++];
    assert.equal(bridge.capture({type:e.type,timeStamp:1000+e.at,
     pointerId:11,pointerType:'touch',clientX:680,clientY:300,
     target:{tagName:'CANVAS',closest:()=>null}}),true);
   }
   const fn=callback;assert.equal(typeof fn,'function');
   callback=null;fn(now);
  }
  assert.ok(Math.abs(elapsed-expectedMs)<1e-6,'expected experiment duration');
  assert.equal(nextEvent,events.length);
  return {fireUpdates,ticks:owner.ticks,applied:timeline.applied,
   droppedMs:+owner.droppedMs.toFixed(4),
   late:bridge.lateClamps,reordered:bridge.reorderedClamps,
   stale:bridge.staleClamps};
 }finally{owner.stop()}
}
const uniform60=()=>Array(360).fill(1000/60);
const clustered30=()=>Array.from({length:45},()=>[
 55,55,1000/15-55,1000/15-55]).flat();
test('clustered mean30 can swallow a real 12ms touch pulse despite both DOM edges being delivered',()=>{
 const baseline=replay(uniform60()),clustered=replay(clustered30());
 assert.equal(baseline.fireUpdates,1,'60Hz control must sample the short press');
 assert.equal(baseline.ticks,360);
 assert.equal(clustered.applied,2,'both touch edges were delivered');
 assert.equal(clustered.late+clustered.reordered+clustered.stale,0);
 if(clustered.droppedMs>0){
  assert.ok(clustered.ticks<baseline.ticks);
  assert.equal(clustered.fireUpdates,0,
   'the skipped simulation tick can swallow an otherwise legal press');
 }else{
  // Future owner fixes should restore the sampled press, not preserve the bug.
  assert.equal(clustered.ticks,baseline.ticks);
  assert.equal(clustered.fireUpdates,baseline.fireUpdates);
 }
 console.log('FIXED60_SHORT_TOUCH_FALSIFIER '+JSON.stringify({baseline,clustered}));
});
test('bounded active-jitter recovery preserves the short pulse in this scene',()=>{
 const baseline=replay(uniform60());
 for(const [maxSteps,backlogExtraTicks] of [[2,3],[3,2]]){
  const candidate=replay(clustered30(),maxSteps,backlogExtraTicks);
  assert.equal(candidate.applied,2);
  assert.equal(candidate.late+candidate.reordered+candidate.stale,0);
  assert.equal(candidate.droppedMs,0);
  assert.equal(candidate.ticks,baseline.ticks);
  assert.equal(candidate.fireUpdates,baseline.fireUpdates);
 }
});

// Four-step/eight-tick capacity is not a universal input-loss cure. Three
// consecutive 95ms *active* callbacks can still skip the chronological tick
// that contains a 12ms press, even though both DOM edges are accepted.
test('eight-tick active 30Hz burst can still swallow a legal short touch pulse',()=>{
 const pulse=[{at:140,type:'pointerdown'},{at:152,type:'pointerup'}];
 const uniform=Array(120).fill(1000/60);
 const triple=Array.from({length:5},()=>[
  95,95,95,...Array(9).fill((400-285)/9)]).flat();
 assert.equal(triple.length,60);
 assert.ok(triple.every(ms=>ms>0&&ms<100));
 const baseline=replay(uniform,4,4,pulse,2000);
 const candidate=replay(triple,4,4,pulse,2000);
 assert.equal(baseline.applied,2);
 assert.equal(baseline.fireUpdates,1,'60Hz must sample the 12ms legal press');
 assert.equal(candidate.applied,2,'both DOM edges must reach the timeline');
 assert.ok(candidate.droppedMs>=0);
 assert.ok(candidate.fireUpdates<=baseline.fireUpdates,
  'bounded recovery must not invent extra firing from a short pulse');
 if(candidate.droppedMs===0)assert.equal(candidate.fireUpdates,baseline.fireUpdates,
  'if future recovery eliminates dropped ticks it must preserve the press');
 console.log('EIGHT_TICK_SHORT_TOUCH_LIMIT '+JSON.stringify({baseline,candidate,
  caveat:'research owner and stub input; not actual Chromium or player damage'}));
});
