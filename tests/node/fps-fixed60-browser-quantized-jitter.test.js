'use strict';
// Research only: real browser RAF timestamps are quantized/jittered.
// A mathematically exact 83 1/3ms gate can hide a dropped-tick cliff
// that appears when Chromium delivers an 83.4ms callback instead.
// Execute the real FixedStepRafOwner source, not a duplicate formula.
// No shipping scheduler, weapon balance or gameplay module changes.
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const STEP_MS=1000/60;
const IDEAL=[5*STEP_MS,STEP_MS,STEP_MS,STEP_MS];
// Browser-feasible mean-30Hz gate. The 0.0667ms displacement of the
// long callback is compensated by the final short callback.
const QUANTIZED=[83.4,16.6,16.7,400/3-83.4-16.6-16.7];
const FRAME_COUNT=180,EXPECTED_TICKS=360;
function run(gaps,{maxSteps=3,backlogExtraTicks=2}={}){
 let now=1000,callback=null;
 const input={};
 const game={
  input,paused:false,status:'playing',
  sfx:{startMusic(){}},
  update(){},drawMinimap(){},destroy(){},setPaused(){}
 };
 const timeline={input,reset(){},consumeThrough(){},tickOrigin:0};
 const bridge={timeline,startMs:1000};
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callback=fn,1),
  cancel:()=>{callback=null},render(){},maxSteps,backlogExtraTicks
 });
 const originalAdvance=owner.advance;
 owner.advance=function(ts){
  // Same active-only research policy as the Chromium pilot: a genuine
  // >100ms foreground stall must still have a two-update ceiling.
  this.maxSteps=ts-this.lastMs>100+1e-7?2:maxSteps;
  return originalAdvance.call(this,ts);
 };
 try{
  owner.start();
  let maxLagMs=0,burstFrames=0;
  for(let frame=0;frame<FRAME_COUNT;frame++){
   now+=gaps[frame%gaps.length];
   const next=callback;callback=null;
   assert.equal(typeof next,'function','lost exclusive RAF ownership');
   next(now);
   if(owner.lastSteps>=3)burstFrames++;
   maxLagMs=Math.max(maxLagMs,owner.lagMs);
  }
  assert.ok(Math.abs(now-7000)<1e-6,'all arms need six seconds of presentation');
  return {ticks:owner.ticks,droppedMs:owner.droppedMs,
   lagMs:owner.lagMs,maxLagMs,burstFrames};
 }finally{owner.stop();}
}
test('browser-quantized active 30Hz gaps must not be mistaken for exact fractions',()=>{
 const ideal=run(IDEAL),quantized=run(QUANTIZED);
 const retained=run(QUANTIZED,{backlogExtraTicks:3});
 const four=run(QUANTIZED,{maxSteps:4});
 assert.equal(ideal.ticks,EXPECTED_TICKS,'ideal three-step negative control');
 assert.equal(ideal.droppedMs,0);
 // Never freeze the current two-backlog loss as a desired behavior:
 // a future improvement that also recovers this arm should pass.
 assert.ok(quantized.ticks<=EXPECTED_TICKS);
 assert.ok(quantized.droppedMs>=0);
 assert.equal(retained.ticks,EXPECTED_TICKS,
  'one additional backlog tick must recover quantized 30Hz chronology');
 assert.equal(retained.droppedMs,0);
 assert.equal(four.ticks,EXPECTED_TICKS,
  'four-update research alternative must recover the same chronology');
 assert.equal(four.droppedMs,0);
 assert.ok(retained.maxLagMs<=3*STEP_MS+1e-5,
  'retained simulation debt must stay bounded');
 assert.ok(four.maxLagMs<=2*STEP_MS+1e-5,
  'four-update alternative must not silently increase backlog');
 assert.ok(retained.burstFrames>0&&four.burstFrames>0,
  'the alternatives must actually exercise multi-update callbacks');
 assert.ok(retained.droppedMs<=quantized.droppedMs &&
  four.droppedMs<=quantized.droppedMs,
  'alternatives must not lose more time than the current research pilot');
});
