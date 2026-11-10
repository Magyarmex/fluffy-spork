'use strict';
// RESEARCH ONLY. This is a falsifiable CPU-gated catch-up *policy model*,
// not a measured CPU predictor or permission to change the shipping RAF.
// Executes the actual FixedStepRafOwner against bounded mean-30Hz traces.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner,STEP_MS}=require('../research/fixed-step-raf-owner.cjs');
const EPS=1e-7;
function replay(gaps,policy,{cheapPreviousUpdates=true}={}){
 let now=1000,callback=null,elapsed=0,peakLag=0,fourStepFrames=0;
 const input={firing:false,keyboard:{},move:{active:false},aim:{active:false},
  stickId:{move:-1,aim:-1},pd(){},pm(){},pu(){},kd(){},ku(){}};
 const game={input,sfx:{startMusic(){}},paused:false,status:'playing',
  update(){},start(){},destroy(){},setPaused(){}};
 const timeline=new ChronologicalInput(input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
  render(){},maxSteps:3,backlogExtraTicks:2
 });
 const originalAdvance=owner.advance;
 owner.advance=function(ts){
  const raw=Math.max(0,ts-this.lastMs);
  if(raw>100+EPS)this.maxSteps=2;
  else if(policy==='three')this.maxSteps=3;
  else if(policy==='four')this.maxSteps=4;
  else if(policy==='adaptive'){
   // Proposed low-risk gate: spend a fourth update only when three steps
   // plus two backlog ticks would otherwise overflow AND prior work was cheap.
   // Prior work cannot predict a costly CURRENT update: an explicit risk.
   this.maxSteps=cheapPreviousUpdates &&
    this.lagMs+raw>(3+2)*STEP_MS+EPS?4:3;
  }else throw Error('unknown research policy');
  const result=originalAdvance.call(this,ts);
  if(this.lastSteps===4)fourStepFrames++;
  peakLag=Math.max(peakLag,this.lagMs);
  return result;
 };
 try{
  owner.start();
  for(const gap of gaps){
   assert.ok(gap>0&&gap<100,'only active, non-stall gaps');
   elapsed+=gap;now=1000+elapsed;
   const fn=callback;callback=null;
   assert.equal(typeof fn,'function');
   fn(now);
  }
  assert.ok(Math.abs(elapsed-6000)<1e-5,'same six seconds of wall time');
  return {ticks:owner.ticks,droppedMs:owner.droppedMs,
   peakLag,fourStepFrames,remainingMs:owner.lagMs};
 }finally{owner.stop()}
}
function quantized(){
 return Array.from({length:45},()=>[
  83.4,16.6,16.6,1000/7.5-83.4-16.6-16.6]).flat();
}
function randomTraces(count){
 let seed=0x51a0b1e;
 const uniform=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return (seed+.5)/4294967296;};
 const traces=[];
 for(let trial=0;trial<count;trial++){
  const gaps=[];
  for(let group=0;group<45;group++){
   let values;
   do{
    const w=Array.from({length:4},()=>-Math.log(uniform()));
    const sum=w.reduce((a,b)=>a+b,0);
    values=w.map(x=>(1000/7.5)*x/sum);
   }while(Math.max(...values)>=100);
   gaps.push(...values);
  }
  traces.push(gaps);
 }
 return traces;
}
test('CPU-gated fourth-step research reduces some 30Hz loss without pretending to solve every trace',()=>{
 const q=quantized();
 const three=replay(q,'three'),four=replay(q,'four');
 const adaptive=replay(q,'adaptive');
 const expensive=replay(q,'adaptive',{cheapPreviousUpdates:false});
 assert.ok(three.droppedMs>0,'quantized three-step counterexample must be observed');
 assert.equal(four.droppedMs,0,'four-step candidate recovers this particular trace');
 assert.equal(adaptive.droppedMs,0,'cheap-work gate recovers this particular trace');
 assert.ok(adaptive.fourStepFrames>0,'adaptive recovery must actually spend extra updates');
 assert.deepEqual(expensive,three,'expensive prior-work gate must fail closed to three steps');
 const traces=randomTraces(100);
 let improved=0,worse=0,extraFour=0,adaptiveFour=0;
 let threeLost=0,adaptiveLost=0,fourLost=0;
 for(const gaps of traces){
  const a=replay(gaps,'three'),b=replay(gaps,'adaptive'),c=replay(gaps,'four');
  threeLost+=a.droppedMs;adaptiveLost+=b.droppedMs;fourLost+=c.droppedMs;
  if(b.droppedMs<a.droppedMs-EPS)improved++;
  if(b.droppedMs>a.droppedMs+EPS)worse++;
  extraFour+=c.fourStepFrames;adaptiveFour+=b.fourStepFrames;
 }
 assert.equal(worse,0,'adaptive policy must not lose more ticks in this finite grid');
 assert.ok(improved>0,'candidate must improve some non-stall schedules');
 assert.ok(adaptiveFour<extraFour,'candidate should use fewer four-update bursts');
 console.log('FIXED60_CPU_GATED_CATCHUP_RESEARCH '+JSON.stringify({
  quantized:{three,four,adaptive,expensive},
  traces:traces.length,improved,worse,
  meanDroppedMs:{three:threeLost/traces.length,
   adaptive:adaptiveLost/traces.length,four:fourLost/traces.length},
  meanFourStepFrames:{adaptive:adaptiveFour/traces.length,
   alwaysFour:extraFour/traces.length},
  caveat:'stubbed zero-cost updates; prior CPU cost cannot predict current spike; no Android approval'
 }));
});
