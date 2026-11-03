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
function run(seed,intervals,maxSteps,events=[],fireTempest=false){
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  if(fireTempest){g.setClass(g.player,'tempest');g.player.stats.reload=8;
   g.player.perk='alacrity';g.useAbility(g.player);}
  let volleys=0;const originalTryFire=g.tryFire;
  g.tryFire=function(t){const before=this.bullets.length;
   const out=originalTryFire.apply(this,arguments);
   if(t===this.player&&this.bullets.length>before)volleys+=this.bullets.length-before;
   return out;};
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
   if(fireTempest){g.input.aim.active=true;g.input.aim.dx=40;
    g.input.firing=true;g.input.autofire=false;}
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
   return {hash:digest(physical(g)),draws:draws(),ticks:owner.ticks,volleys,
    droppedFrames:owner.droppedFrames,droppedMs:owner.droppedMs,
    backlogMs:owner.lagMs};
  }finally{owner.stop();g.destroy()}
 });
}
test('20Hz fixed-step browser owner needs three simulation steps per exact frame',()=>{
 for(const seed of [1517800,1517802]){
  const reference=run(seed,Array(120).fill(1000/60),2);
  const correct=run(seed,Array(40).fill(50),4);
  const exactThree=run(seed,Array(40).fill(50),3);
  const capped=run(seed,Array(40).fill(50),2);
  assert.equal(reference.ticks,120);
  assert.equal(correct.ticks,120);
  assert.equal(correct.droppedFrames,0);
  assert.equal(correct.hash,reference.hash);
  assert.equal(correct.draws,reference.draws);
  assert.equal(exactThree.ticks,120,'three steps suffice for perfectly spaced 20Hz');
  assert.equal(exactThree.hash,reference.hash);
  assert.equal(exactThree.draws,reference.draws);
  assert.ok(capped.ticks<120,'two-step cap must not silently pass as 60Hz parity');
  assert.notEqual(capped.hash,reference.hash);
 }
});
test('20Hz 48/52ms presentation jitter recovers a fourth step without changing world',()=>{
 for(const seed of [1517800,1517802]){
  const reference=run(seed,Array(120).fill(1000/60),2);
  const jitter=run(seed,Array.from({length:20},()=>[48,52]).flat(),4);
  const cappedThree=run(seed,Array.from({length:20},()=>[48,52]).flat(),3);
  assert.ok(cappedThree.ticks<=120,'three-step budget cannot overrun reference');
  if(cappedThree.ticks<120)assert.notEqual(cappedThree.hash,reference.hash);
  else{assert.equal(cappedThree.hash,reference.hash);
   assert.equal(cappedThree.draws,reference.draws);}
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

test('20Hz 30/70ms burst phase exposes bounded but unfinished tick at capture boundary',()=>{
 // Equal elapsed time does not guarantee equal completed simulation ticks
 // when the final 70ms presentation frame needs >4 updates. This is a
 // known latency/backlog limit, not a dropped-tick correctness success.
 for(const seed of [1517800,1517802]){
  const reference=run(seed,Array(120).fill(1000/60),2);
  const endsSlow=run(seed,Array.from({length:20},()=>[30,70]).flat(),4);
  const endsFast=run(seed,Array.from({length:20},()=>[70,30]).flat(),4);
  assert.equal(endsSlow.droppedFrames,0);
  assert.ok(endsSlow.ticks===119||endsSlow.ticks===120);
  if(endsSlow.ticks===119){
   assert.ok(endsSlow.backlogMs>0,'unfinished tick must remain as bounded lag');
   assert.notEqual(endsSlow.hash,reference.hash);
  }else{
   // A future scheduler that safely finishes the fourth/fifth step should
   // improve this test, not be rejected for fixing the known limitation.
   assert.equal(endsSlow.hash,reference.hash);
   assert.equal(endsSlow.draws,reference.draws);
  }
  assert.equal(endsFast.ticks,120);
  assert.equal(endsFast.hash,reference.hash);
  assert.equal(endsFast.draws,reference.draws);
 }
});

test('20Hz presentation preserves legal Tempest Overheat firing chronology',()=>{
 for(const seed of [1517800,1517802]){
  const reference=run(seed,Array(120).fill(1000/60),2,[],true);
  const twenty=run(seed,Array(40).fill(50),4,[],true);
  const jitter=run(seed,Array.from({length:20},()=>[48,52]).flat(),4,[],true);
  assert.ok(reference.volleys>0,'must exercise actual player weapon');
  for(const candidate of [twenty,jitter]){
   assert.equal(candidate.ticks,120);
   assert.equal(candidate.volleys,reference.volleys);
   assert.equal(candidate.hash,reference.hash);
   assert.equal(candidate.draws,reference.draws);
  }
 }
});

test('opt-in browser pilot forwards four-step catch-up without changing default',()=>{
 const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');
 const g=bootGame(),win=g.__testWindow,doc=win.document;
 const emitter=()=>({addEventListener(){},removeEventListener(){}});
 Object.assign(win,emitter());Object.assign(doc,emitter());
 Object.assign(g.canvas,emitter());
 g.input.detach();g.input.attach(g.canvas);
 const opts={window:win,document:doc,
  clock:{now:()=>1000,timeOrigin:1793560000000},
  request:()=>7,cancel:()=>{},render:()=>{}};
 let pilot;
 try{
  pilot=createFixedStepBrowserPilot(g,{...opts,maxSteps:4});
  assert.equal(pilot.owner.maxSteps,4);
  const productionStart=g.start;
  g.sfx.startMusic=()=>{};
  pilot.start();
  assert.throws(()=>g.start(),/fixed-step RAF already owns this game/,
   'composed Game must not run a second production RAF');
  pilot.stop();pilot=null;
  assert.equal(g.start,productionStart,'composed Game startup must be restored');
  const defaultPilot=createFixedStepBrowserPilot(g,opts);
  assert.equal(defaultPilot.owner.maxSteps,2);
  defaultPilot.stop();
 }finally{if(pilot)pilot.stop();g.destroy()}
});

test('20Hz jitter preserves Tempest fire chronology while movement input changes muzzle origin',()=>{
 // A static firing test can pass while moving muzzle positions or keyboard
 // event timing differ. Exercise both systems in the same composed world.
 const events=[
  {at:25,type:'keydown',key:'w'},
  {at:275,type:'keydown',key:'d'},
  {at:525,type:'keyup',key:'w'},
  {at:775,type:'keyup',key:'d'},
  {at:1025,type:'keydown',key:'s'},
  {at:1425,type:'keyup',key:'s'}
 ];
 const baseline=Array(120).fill(1000/60);
 const presentations=[
  Array(40).fill(50),
  Array.from({length:20},()=>[48,52]).flat()
 ];
 for(const seed of [1517800,1517802]){
  const reference=run(seed,baseline,2,events,true);
  assert.ok(reference.volleys>0,'must exercise actual Tempest firing');
  for(const intervals of presentations){
   const candidate=run(seed,intervals,4,events,true);
   assert.equal(candidate.ticks,reference.ticks);
   assert.equal(candidate.droppedFrames,0);
   assert.equal(candidate.volleys,reference.volleys,
    'movement must not alter chronological shot count by presentation rate');
   assert.equal(candidate.hash,reference.hash,
    'moving projectile origins and combat world must match fixed60');
   assert.equal(candidate.draws,reference.draws,
    'moving combat must not consume presentation-dependent gameplay RNG');
  }
 }
});
