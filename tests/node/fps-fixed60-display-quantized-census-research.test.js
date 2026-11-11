'use strict';
// #799 RESEARCH ONLY: a display-quantized timing census. The frame gaps
// are integer multiples of a 60Hz display interval, not arbitrary sub-refresh
// callbacks. Execute the actual research RAF owner; do not change production.
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepRafOwner,STEP_MS}=require('../research/fixed-step-raf-owner.cjs');
const GROUPS=[];
for(let a=1;a<=5;a++)for(let b=1;b<=5;b++)
 for(let c=1;c<=5;c++)for(let d=1;d<=5;d++)
  if(a+b+c+d===8)GROUPS.push([a,b,c,d]);
const DURATION_MS=6000;
function replay(gaps,maxSteps,backlogExtraTicks){
 let now=1000,callback=null,four=0;
 const input={};
 const game={input,paused:false,status:'playing',sfx:{startMusic(){}},
  update(){},destroy(){},setPaused(){}};
 const timeline={input,reset(){},consumeThrough(){},tickOrigin:0};
 const bridge={timeline,startMs:1000};
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
  render(){},maxSteps,backlogExtraTicks
 });
 try{
  owner.start();
  for(const gap of gaps){
   now+=gap;
   const fn=callback;callback=null;
   assert.equal(typeof fn,'function','exclusive RAF ownership lost');
   fn(now);
   if(owner.lastSteps===4)four++;
  }
  assert.ok(Math.abs(now-1000-DURATION_MS)<.002);
  assert.ok(Math.abs(owner.ticks*STEP_MS+owner.droppedMs+
   owner.lagMs-DURATION_MS)<.002,'wall/simulation accounting mismatch');
  return {ticks:owner.ticks,droppedMs:owner.droppedMs,
   queuedMs:owner.lagMs,four};
 }finally{owner.stop();}
}
test('display-quantized 30Hz traces distinguish extra-backlog and fourth-update recovery',()=>{
 assert.equal(GROUPS.length,35,'ordered 60Hz-display gap partitions changed');
 let seed=0x4e4f5641;
 const uniform=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return (seed+.5)/4294967296;};
 const N=2000;
 let lostThree=0,lostFour=0,improved=0,worse=0;
 let discardedThree=0,discardedFour=0,queuedThree=0,queuedFour=0,fourFrames=0;
 for(let trial=0;trial<N;trial++){
  const gaps=[];
  for(let group=0;group<45;group++){
   const slots=GROUPS[Math.floor(uniform()*GROUPS.length)];
   for(const ticks of slots)gaps.push(ticks*STEP_MS);
  }
  assert.equal(gaps.length,180);
  const a=replay(gaps,3,3),b=replay(gaps,4,2);
  lostThree+=a.droppedMs>0;lostFour+=b.droppedMs>0;
  improved+=b.droppedMs<a.droppedMs-1e-7;
  worse+=b.droppedMs>a.droppedMs+1e-7;
  discardedThree+=a.droppedMs;discardedFour+=b.droppedMs;
  queuedThree+=a.queuedMs;queuedFour+=b.queuedMs;
  fourFrames+=b.four;
 }
 assert.equal(worse,0,'four-step policy must not discard more time in this finite corpus');
 assert.ok(fourFrames>0,'the candidate must actually exercise four-update callbacks');
 // Do not require the current 3+3 policy to keep losing time: a future safe
 // improvement that recovers these traces should pass this research test.
 console.log('FIXED60_DISPLAY_QUANTIZED_CENSUS '+JSON.stringify({
  traces:N,groups:GROUPS.length,lostThree,lostFour,improved,worse,
  meanDiscardedMs:{three:discardedThree/N,four:discardedFour/N},
  meanQueuedMs:{three:queuedThree/N,four:queuedFour/N},
  meanFourUpdateFrames:fourFrames/N,
  caveat:'uniform synthetic partitions, not natural incidence; zero-cost updates, not Android CPU'}));
});
