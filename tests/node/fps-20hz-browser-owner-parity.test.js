'use strict';
// #648: 20Hz presentation is a legitimate overloaded-device boundary.
// Exercise the actual composed Game through the opt-in browser RAF owner.
// This is research coverage, NOT permission to ship fixed60 without device gates.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function run(seed,intervals,maxSteps,events=[]){
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  let now=1000,id=0;
  const active=new Map();
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,maxSteps,request:fn=>{active.set(++id,fn);return id;},
   cancel:key=>active.delete(key),render:()=>{}
  });
  try{
   owner.start();
   let elapsed=0, nextEvent=0;
   for(const ms of intervals){
    elapsed+=ms;now=1000+elapsed;
    while(nextEvent<events.length && events[nextEvent].at<=elapsed+1e-7){
     const e=events[nextEvent++];
     assert.equal(bridge.capture({type:e.type,timeStamp:1000+e.at,
      key:e.key,target:{tagName:'CANVAS',closest:()=>null}}),true);
    }
    const [key,fn]=[...active].at(-1);
    assert.equal(typeof fn,'function','RAF must remain scheduled');
    active.delete(key);fn(now);
   }
   return {hash:digest(physical(g)),draws:draws(),ticks:owner.ticks,
    droppedFrames:owner.droppedFrames,droppedMs:owner.droppedMs,
    backlogMs:owner.lagMs};
  }finally{owner.stop();g.destroy()}
 });
}
test('20Hz fixed-step browser owner needs three simulation steps per exact frame',()=>{
 for(const seed of [1517800,1517802]){
  const reference=run(seed,Array(120).fill(1000/60),2);
  const correct=run(seed,Array(40).fill(50),4);
  const capped=run(seed,Array(40).fill(50),2);
  assert.equal(reference.ticks,120);
  assert.equal(correct.ticks,120);
  assert.equal(correct.droppedFrames,0);
  assert.equal(correct.hash,reference.hash);
  assert.equal(correct.draws,reference.draws);
  assert.ok(capped.ticks<120,'two-step cap must not silently pass as 60Hz parity');
  assert.notEqual(capped.hash,reference.hash);
 }
});
test('20Hz 48/52ms presentation jitter recovers a fourth step without changing world',()=>{
 for(const seed of [1517800,1517802]){
  const reference=run(seed,Array(120).fill(1000/60),2);
  const jitter=run(seed,Array.from({length:20},()=>[48,52]).flat(),4);
  assert.equal(jitter.ticks,120);
  assert.equal(jitter.droppedFrames,0);
  assert.equal(jitter.hash,reference.hash);
  assert.equal(jitter.draws,reference.draws);
 }
});

test('20Hz input delivery preserves chronological keyboard edges against 60Hz',()=>{
 const events=[
  {at:25,type:'keydown',key:'w'},
  {at:175,type:'keyup',key:'w'},
  {at:425,type:'keydown',key:'d'},
  {at:675,type:'keyup',key:'d'},
  {at:925,type:'keydown',key:'s'},
  {at:1125,type:'keyup',key:'s'}
 ];
 for(const seed of [1517800,1517802]){
  const reference=run(seed,Array(120).fill(1000/60),2,events);
  const exact20=run(seed,Array(40).fill(50),4,events);
  const jitter20=run(seed,Array.from({length:20},()=>[48,52]).flat(),4,events);
  for(const candidate of [exact20,jitter20]){
   assert.equal(candidate.ticks,120);
   assert.equal(candidate.droppedFrames,0);
   assert.equal(candidate.hash,reference.hash,
    'presentation frequency must not change input-driven physical state');
   assert.equal(candidate.draws,reference.draws);
  }
 }
});
