'use strict';
// #641 RESEARCH ONLY: a physical mouse release may be queued before the
// camera changes, yet DirectShotIntent projects the cursor at replay time.
// This controlled ordering is a falsifier, not evidence of natural frequency.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');

function run(cameraAtReplay,captureAtDom=true,moveAfterRelease=false){
 const g=bootGame(),i=g.input,win=g.__testWindow;
 g.sfx.muted=true;i.autofire=false;
 g.status='playing';g.paused=false;
 Object.assign(g.cam,{x:0,y:0,zoom:1});
 let now=1000;
 const timeline=new ChronologicalInput(i);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000},{
  captureMouseWorld:captureAtDom==='throw'?()=>{throw Error('unavailable camera');}:
   captureAtDom?e=>{
   const rect=i.canvas.getBoundingClientRect();
   return {x:g.cam.x+(e.clientX-rect.left-g.w*.5)/g.cam.zoom,
    y:g.cam.y+(e.clientY-rect.top-g.h*.5)/g.cam.zoom};
  }:null
 });
 const owner=new DirectShotIntent(g,{window:win,document:win.document,
  rebindDomListeners:false,requireTrustedDuration:true,eventOriginMs:1000,
  maxIntentAgeMs:100,nowMs:()=>1180});
 const e=(type,stamp,buttons)=>({type,timeStamp:stamp,pointerType:'mouse',
  pointerId:1,button:0,buttons,clientX:600,clientY:300,
  target:{closest:()=>null}});
 try{
  now=1100;assert.equal(bridge.capture(e('pointerdown',1100,1)),true);
  now=1130;assert.equal(bridge.capture(e('pointerup',1130,0)),true);
  if(moveAfterRelease){
   now=1140;assert.equal(bridge.capture({...e('pointermove',1140,0),
    clientX:700,clientY:500}),true);
  }
  assert.equal(owner.pending,null,'physical events are still queued');
  // Camera change between DOM capture and chronological Input replay.
  // The DOM cursor and original physical timestamp do not change.
  if(typeof cameraAtReplay==='number')g.cam.x=cameraAtReplay;
  else Object.assign(g.cam,cameraAtReplay);
  timeline.consumeThrough(.2);
  assert.ok(owner.pending&&owner.pending.world,
   'actual Input replay should preserve one short mouse intent');
  assert.ok(Math.abs(owner.pending.durationMs-30)<1e-7);
  const result={worldX:owner.pending.world.x,worldY:owner.pending.world.y,
   durationMs:owner.pending.durationMs,applied:timeline.applied,
   projectionFailures:bridge.mouseProjectionFailures,replayCameraX:g.cam.x};
  return result;
 }finally{owner.detach();g.destroy();}
}
test('DOM-time world target resists late camera movement; legacy replay still drifts',()=>{
 const stable=run(0),moved=run(100),zoomed=run({x:100,zoom:2}),
  cursorMoved=run({x:100,zoom:2},true,true),
  legacy=run(100,false),failed=run(100,'throw');
 assert.equal(stable.applied,2);assert.equal(moved.applied,2);
 assert.ok(Math.abs(stable.worldX-200)<1e-8);
 assert.ok(Math.abs(moved.worldX-stable.worldX)<1e-8,
  'a captured physical world target must not drift with the replay camera');
 assert.ok(Math.abs(zoomed.worldX-stable.worldX)<1e-8,
  'camera translation plus zoom must not retarget the captured world point');
 assert.ok(Math.abs(cursorMoved.worldX-stable.worldX)<1e-8,
  'post-release cursor motion must not retarget the physical shot');
 assert.equal(cursorMoved.applied,3,'cursor motion must still replay as live input');
 assert.ok(Math.abs(legacy.worldX-stable.worldX-100)<1e-8,
  'negative control must still reproduce the original 100-unit drift');
 assert.equal(stable.durationMs,moved.durationMs);
 assert.equal(stable.projectionFailures,0);
 assert.equal(moved.projectionFailures,0);
 assert.equal(failed.projectionFailures,1,'failed projection must be observable');
 assert.ok(Math.abs(failed.worldX-legacy.worldX)<1e-8,
  'projection failure preserves legacy fallback rather than inventing a world point');
 console.log('MOUSE_LATE_REPLAY_CAMERA_RESEARCH '+JSON.stringify({
  stable,moved,zoomed,cursorMoved,legacy,failed,projectionDrift:moved.worldX-stable.worldX,
  caveat:'research-only injected capture-time projection; constructed camera mutation, not physical Android validation'
 }));
});


test('actual fixed-step browser factory freezes the DOM-time mouse world point',()=>{
 const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;i.autofire=false;g.status='playing';g.paused=false;
 Object.assign(g.cam,{x:0,y:0,zoom:1});
 let now=1000;
 const pilot=createFixedStepBrowserPilot(g,{
  window:win,document:doc,canvas:i.canvas,
  clock:{now:()=>now,timeOrigin:1793560000000},
  request:()=>1,cancel:()=>{},render:()=>{},
  shotOnlyPulseFactory:(game)=>new DirectShotIntent(game,{
   window:win,document:doc,rebindDomListeners:false,
   requireTrustedDuration:true,eventOriginMs:1000,
   maxIntentAgeMs:100,nowMs:()=>1180})
 });
 const e=(type,stamp,buttons)=>({type,timeStamp:stamp,pointerType:'mouse',
  pointerId:1,button:0,buttons,clientX:600,clientY:300,
  target:{closest:()=>null}});
 try{
  now=1100;assert.equal(pilot.bridge.capture(e('pointerdown',1100,1)),true);
  now=1130;assert.equal(pilot.bridge.capture(e('pointerup',1130,0)),true);
  g.cam.x=100;
  pilot.timeline.consumeThrough(.2);
  assert.ok(pilot.pulse.pending?.world,'factory must pass a physical world target');
  assert.ok(Math.abs(pilot.pulse.pending.world.x-200)<1e-8,
   'camera movement after DOM capture cannot move the physical mouse target');
  assert.ok(Math.abs(pilot.pulse.pending.durationMs-30)<1e-7);
  Object.assign(g.player,{x:0,y:0,angle:0,fireCd:0});
  const born=[];const originalFire=g.tryFire;
  g.tryFire=function(t,...args){
   const before=this.bullets.length,result=originalFire.call(this,t,...args);
   if(t===g.player)born.push(...this.bullets.slice(before).map(b=>({vx:b.vx,vy:b.vy})));
   return result;
  };
  g.update(1/60);
  assert.ok(born.length>0,'captured world target must create a real player projectile');
  assert.ok(born[0].vx>0,'projectile must aim toward the captured eastward world target');
  assert.equal(pilot.pulse.intents,1,'only one weapon intent may be consumed');
 }finally{pilot.stop();g.destroy();}
});
