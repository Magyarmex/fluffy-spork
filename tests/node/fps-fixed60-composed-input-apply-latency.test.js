'use strict';
// Source-executed composed-game timing witness. NOT physical touch-to-photon.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function run(maxSteps){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  let now=1000,callback=null,elapsed=0;
  const applied=[];
  const kd=g.input.kd,ku=g.input.ku;
  g.input.kd=function(e){applied.push({kind:'keydown',key:e.key,atMs:now-1000});
    return kd.call(this,e)};
  g.input.ku=function(e){applied.push({kind:'keyup',key:e.key,atMs:now-1000});
    return ku.call(this,e)};
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,maxSteps,request:fn=>{callback=fn;return 1},
    cancel:()=>{callback=null},render(){}});
  const events=[{atMs:130,type:'keydown',key:'w'},
    {atMs:310,type:'keyup',key:'w'}];
  let next=0;
  try{
   owner.start();
   for(let frame=0;frame<8;frame++){
    elapsed+=50;now=1000+elapsed;
    while(next<events.length&&events[next].atMs<=elapsed){
     const e=events[next++];
     assert.equal(bridge.capture({type:e.type,timeStamp:1000+e.atMs,key:e.key,
      target:{tagName:'CANVAS',closest:()=>null}}),true);
    }
    const f=callback;callback=null;assert.equal(typeof f,'function');f(now);
   }
   return {applied,ticks:owner.ticks,droppedMs:owner.droppedMs,
    lateClamps:bridge.lateClamps};
  }finally{owner.stop();g.destroy()}
 });
}
test('real composed Game receives a held keyboard edge later under 20Hz two-step overload',()=>{
 const low=run(2),sufficient=run(3);
 assert.equal(low.applied.length,2);
 assert.equal(sufficient.applied.length,2);
 assert.deepEqual(low.applied.map(e=>e.kind),['keydown','keyup']);
 assert.deepEqual(sufficient.applied.map(e=>e.kind),['keydown','keyup']);
 assert.equal(low.applied[0].atMs,200);
 assert.equal(sufficient.applied[0].atMs,150);
 assert.ok(low.ticks<sufficient.ticks);
 assert.ok(low.droppedMs>0);
 assert.equal(sufficient.droppedMs,0);
 assert.equal(sufficient.ticks,24);
});
