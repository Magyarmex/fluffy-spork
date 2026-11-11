'use strict';
// #799 RESEARCH ONLY. Falsify a tempting sub-millisecond carry tolerance
// before anyone mistakes one recovered Chromium-quantized pattern for a
// general scheduler fairness fix. No production Game/RAF/input changes.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const ownerPath=path.resolve(__dirname,'../research/fixed-step-raf-owner.cjs');
const original=fs.readFileSync(ownerPath,'utf8');
const anchor='const maxBacklog=(this.maxSteps+this.backlogExtraTicks)*STEP_MS;';
assert.equal(original.split(anchor).length-1,1,'source owner backlog gate drift');
const alternate=original.replace(anchor,
 'const maxBacklog=(this.maxSteps+this.backlogExtraTicks)*STEP_MS+0.1;');
const sandbox={module:{exports:{}},require:createRequire(ownerPath)};
vm.runInNewContext(alternate,sandbox,{filename:ownerPath,timeout:3000});
const SlackOwner=sandbox.module.exports.FixedStepRafOwner;
function schedule(longGap){
 const short=16.6;
 return Array.from({length:45},()=>[
  longGap,short,short,1000/7.5-longGap-short-short]).flat();
}
function replay(Owner,gaps){
 let now=1000,callback=null,elapsed=0,updates=0;
 const input={firing:false,keyboard:{},move:{active:false},aim:{active:false},
  stickId:{move:-1,aim:-1},pd(){},pm(){},pu(){},kd(){},ku(){}};
 const game={input,sfx:{startMusic(){}},paused:false,status:'playing',
  update(){updates++},start(){},destroy(){},setPaused(){}};
 const timeline=new ChronologicalInput(input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const owner=new Owner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
  render(){},maxSteps:3,backlogExtraTicks:2
 });
 const originalAdvance=owner.advance;
 owner.advance=function(ts){
  const gap=Math.max(0,ts-this.lastMs);
  this.maxSteps=gap>100+1e-7?2:3;
  return originalAdvance.call(this,ts);
 };
 try{
  owner.start();
  for(const gap of gaps){
   elapsed+=gap;now=1000+elapsed;
   const next=callback;callback=null;
   assert.equal(typeof next,'function','owner must retain one RAF chain');
   next(now);
   assert.ok(owner.lastSteps<=owner.maxSteps,'bounded update count');
  }
  assert.equal(updates,owner.ticks);
  return {ticks:owner.ticks,droppedMs:owner.droppedMs,
   lagMs:owner.lagMs,elapsed,updates};
 }finally{owner.stop();}
}
test('0.1ms backlog tolerance repairs one quantized frame pattern but moves the cliff by 0.05ms',()=>{
 const reference=replay(FixedStepRafOwner,schedule(83.4));
 const slack=replay(SlackOwner,schedule(83.4));
 assert.equal(reference.ticks,315);
 assert.ok(Math.abs(reference.droppedMs-750)<1e-5);
 assert.equal(slack.ticks,360);
 assert.equal(slack.droppedMs,0);
 const shifted=replay(SlackOwner,schedule(83.45));
 assert.equal(shifted.ticks,315,'slightly different quantization still loses whole ticks');
 assert.ok(Math.abs(shifted.droppedMs-750)<1e-5);
 console.log('FIXED60_SUBMS_TOLERANCE_FALSIFIER '+JSON.stringify({reference,slack,shifted}));
});
test('submillisecond tolerance preserves uniform 60Hz and long-stall safety without proving device performance',()=>{
 const uniform=Array(360).fill(1000/60);
 for(const Owner of [FixedStepRafOwner,SlackOwner]){
  const regular=replay(Owner,uniform);
  assert.equal(regular.ticks,360);
  assert.equal(regular.droppedMs,0);
  const stalled=replay(Owner,[120,1000/60,1000/60]);
  assert.ok(stalled.droppedMs>0,'foreground stall must still discard stale time');
  assert.ok(stalled.ticks<=6,'long stall cannot trigger unbounded updates');
 }
});
