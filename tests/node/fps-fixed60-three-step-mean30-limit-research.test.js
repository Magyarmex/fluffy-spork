'use strict';
// Research-only counterexample: recovering one mean-30Hz presentation pattern
// with a three-step budget does not establish general mean-30Hz fairness.
// All frames are <=100ms, so this is NOT a foreground-stall case.
// Do not freeze lost ticks as a desired golden: future schedulers may improve.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const STALL_EPS=1e-7;
function replay(gaps,{steps=3,extra=2}={}){
 let now=1000,cb=null,updates=0,elapsed=0,peakLag=0,peakSteps=0;
 const input={firing:false,keyboard:{},move:{active:false},aim:{active:false},
  stickId:{move:-1,aim:-1},pd(){},pm(){},pu(){},kd(){},ku(){}};
 const game={input,sfx:{startMusic(){}},paused:false,status:'playing',
  update(){updates++},start(){},destroy(){},setPaused(){}};
 const timeline=new ChronologicalInput(input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(cb=fn,1),cancel:()=>{cb=null},
  render(){},maxSteps:2,backlogExtraTicks:extra
 });
 const advance=owner.advance;
 owner.advance=function(ts){
  const raw=Math.max(0,ts-this.lastMs);
  this.maxSteps=raw>100+STALL_EPS?2:steps;
  return advance.call(this,ts);
 };
 try{
  owner.start();
  for(const gap of gaps){
   elapsed+=gap;now=1000+elapsed;
   const run=cb;cb=null;assert.equal(typeof run,'function');run(now);
   peakLag=Math.max(peakLag,owner.lagMs);
   peakSteps=Math.max(peakSteps,owner.lastSteps);
  }
  return {elapsed,ticks:owner.ticks,updates,droppedMs:owner.droppedMs,
   peakLag,peakSteps};
 }finally{owner.stop()}
}
test('active-only three-step is not a universal mean-30Hz fairness guarantee',()=>{
 const uniform=Array(360).fill(1000/60);
 const clustered=Array.from({length:45},()=>[90,5,5,100/3]).flat();
 assert.ok(clustered.every(g=>g<=100));
 assert.ok(Math.abs(clustered.reduce((a,b)=>a+b,0)-6000)<1e-6);
 const baseline=replay(uniform);
 const pilot=replay(clustered);
 const extraBacklog=replay(clustered,{steps:3,extra:3});
 const extraCpu=replay(clustered,{steps:4,extra:2});
 assert.equal(baseline.ticks,360);
 assert.equal(baseline.droppedMs,0);
 assert.equal(pilot.updates,pilot.ticks);
 assert.ok(pilot.ticks<=baseline.ticks);
 assert.ok(pilot.peakSteps<=3);
 if(pilot.droppedMs>0)assert.ok(pilot.ticks<baseline.ticks);
 // These two bounded research alternatives can recover this specific trace,
 // but neither has passed real Game CPU/Canvas/Android responsiveness gates.
 assert.equal(extraBacklog.ticks,baseline.ticks);
 assert.equal(extraBacklog.droppedMs,0);
 assert.equal(extraCpu.ticks,baseline.ticks);
 assert.equal(extraCpu.droppedMs,0);
 assert.ok(extraBacklog.peakLag>=pilot.peakLag);
 assert.ok(extraCpu.peakSteps>=pilot.peakSteps);
 console.log('FIXED60_ACTIVE_THREE_LIMIT '+JSON.stringify({
  uniform:baseline,clusteredPilot:pilot,extraBacklog,extraCpu
 }));
});
