'use strict';
// Research-only: replay adversarial Tempest presentation jitter through the
// actual composed Game and the opt-in fixed60 RAF owner. Never ships the owner.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const TICKS=960;
const patterns={
 mixedSlow:[2,4,1,1,2,2],mixedFast:[1,3,2,1,3,2],
 alternating:[1,4,1,2,2,2],aliasSlow:[1,1,1,3,3,3]
};
function schedule(pattern,phase){
 const result=[];let elapsed=0,i=phase;
 while(elapsed<TICKS){
  const ticks=Math.min(pattern[i++%pattern.length],TICKS-elapsed);
  result.push(ticks);elapsed+=ticks;
 }
 return result;
}
function run(seed,reload,intervals){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];p.stats.reload=reload;
  let now=1000,callback=null;
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  g.sfx.startMusic=()=>{};
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,request:fn=>{callback=fn;return 1;},
   cancel:()=>{callback=null},render:()=>{},maxSteps:2
  });
  let volleys=0;const shotTimes=[],original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length,result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before){volleys++;shotTimes.push(+this.time.toFixed(8));}
   return result;
  };
  try{
   owner.start();
   g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;g.input.autofire=false;
   let elapsed=0;
   for(const ticks of intervals){
    elapsed+=ticks;now=1000+elapsed*1000/120;
    const next=callback;assert.equal(typeof next,'function');
    callback=null;next(now);
   }
   return {volleys,shotTimes,hash:digest(physical(g)),draws:draws(),
    ticks:owner.ticks,dropped:owner.droppedFrames,droppedMs:owner.droppedMs,
    weapon:{fireCd:p.fireCd,heat:p.__v17Heat,stability:p.__v17Stability,
     shotIndex:p.__v17ShotIndex,overheatT:p.overheatT}};
  }finally{owner.stop();g.destroy();}
 });
}
test('opt-in fixed60 preserves Tempest chronology under equal-mean adversarial RAF jitter',()=>{
 const native=Array(480).fill(2);
 for(const reload of [0,4,8]){
  const baseline=run(1517800,reload,native);
  assert.equal(baseline.ticks,480);assert.equal(baseline.dropped,0);
  assert.ok(baseline.volleys>0,'held manual fire must actually emit shots');
  for(const [name,pattern] of Object.entries(patterns)){
   for(const phase of [0,1,2]){
    const steps=schedule(pattern,phase);
    assert.equal(steps.reduce((a,b)=>a+b,0),TICKS);
    assert.equal(steps.length,480);
    const observed=run(1517800,reload,steps);
    assert.deepEqual(observed,baseline,
     'fixed60 parity failed for reload='+reload+' '+name+' phase='+phase);
   }
  }
 }
});

function runTouch(seed,intervals){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];p.stats.reload=8;
  g.input.autofire=false;
  let now=1000,callback=null;
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  g.sfx.startMusic=()=>{};
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,request:fn=>{callback=fn;return 1;},
   cancel:()=>{callback=null},render:()=>{},maxSteps:2
  });
  const edges=[[250,'pointerdown'],[260,'pointermove'],[1750,'pointerup'],
   [2250,'pointerdown'],[2260,'pointermove'],[4250,'pointerup'],
   [5000,'pointerdown'],[5010,'pointermove'],[7750,'pointerup']];
  let index=0,volleys=0;const shotTimes=[],original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length,result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before){volleys++;shotTimes.push(+this.time.toFixed(8));}
   return result;
  };
  try{
   owner.start();
   let elapsed=0;
   for(const ticks of intervals){
    elapsed+=ticks;const at=elapsed*1000/120;now=1000+at;
    while(index<edges.length&&edges[index][0]<=at+1e-7){
     const [eventMs,kind]=edges[index++];
     const event={type:kind,timeStamp:1000+eventMs,
      pointerId:11,pointerType:'touch',clientX:kind==='pointerdown'?640:680,clientY:200,
      button:0,buttons:kind==='pointerdown'?1:0,
      target:{tagName:'CANVAS',closest:()=>null}};
     assert.equal(bridge.capture(event),true,'event must remain chronological');
    }
    const next=callback;assert.equal(typeof next,'function');
    callback=null;next(now);
   }
   return {volleys,shotTimes,hash:digest(physical(g)),draws:draws(),
    ticks:owner.ticks,dropped:owner.droppedFrames,applied:timeline.applied,
    weapon:{fireCd:p.fireCd,heat:p.__v17Heat,stability:p.__v17Stability,
     shotIndex:p.__v17ShotIndex,overheatT:p.overheatT},
    lateClamps:bridge.lateClamps};
  }finally{owner.stop();g.destroy();}
 });
}
test('fixed60 preserves touch press/release shot chronology across adversarial RAF schedules',()=>{
 const native=Array(480).fill(2);
 const baseline=runTouch(1517800,native);
 assert.equal(baseline.applied,9);
 assert.ok(baseline.volleys>0,'touch input must actually fire');
 assert.equal(baseline.ticks,480);assert.equal(baseline.dropped,0);
 for(const [name,pattern] of Object.entries(patterns))
  for(const phase of [0,1,2]){
   const observed=runTouch(1517800,schedule(pattern,phase));
   assert.deepEqual(observed,baseline,
    'touch chronology changed for '+name+' phase='+phase);
  }
});
