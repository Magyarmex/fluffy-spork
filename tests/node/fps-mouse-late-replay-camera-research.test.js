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

function run(cameraAtReplay){
 const g=bootGame(),i=g.input,win=g.__testWindow;
 g.sfx.muted=true;i.autofire=false;
 g.status='playing';g.paused=false;
 Object.assign(g.cam,{x:0,y:0,zoom:1});
 let now=1000;
 const timeline=new ChronologicalInput(i);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const owner=new DirectShotIntent(g,{window:win,document:win.document,
  rebindDomListeners:false,requireTrustedDuration:true,eventOriginMs:1000,
  maxIntentAgeMs:100,nowMs:()=>1180});
 const e=(type,stamp,buttons)=>({type,timeStamp:stamp,pointerType:'mouse',
  pointerId:1,button:0,buttons,clientX:600,clientY:300,
  target:{closest:()=>null}});
 try{
  now=1100;assert.equal(bridge.capture(e('pointerdown',1100,1)),true);
  now=1130;assert.equal(bridge.capture(e('pointerup',1130,0)),true);
  assert.equal(owner.pending,null,'physical events are still queued');
  // Camera change between DOM capture and chronological Input replay.
  // The DOM cursor and original physical timestamp do not change.
  g.cam.x=cameraAtReplay;
  timeline.consumeThrough(.2);
  assert.ok(owner.pending&&owner.pending.world,
   'actual Input replay should preserve one short mouse intent');
  assert.ok(Math.abs(owner.pending.durationMs-30)<1e-7);
  const result={worldX:owner.pending.world.x,worldY:owner.pending.world.y,
   durationMs:owner.pending.durationMs,applied:timeline.applied,
   replayCameraX:g.cam.x};
  return result;
 }finally{owner.detach();g.destroy();}
}
test('research: observe late mouse projection drift without freezing it as desired behavior',()=>{
 const stable=run(0),moved=run(100);
 assert.equal(stable.applied,2);assert.equal(moved.applied,2);
 assert.ok(Math.abs(stable.worldX-200)<1e-8);
 const drift=moved.worldX-stable.worldX;
 // Current research implementation drifts by +100; a future correct
 // capture-time projection should instead produce zero. Neither outcome
 // is a desired golden until browser-trusted behavior establishes the fix.
 assert.ok(Math.abs(drift)<1e-8||Math.abs(drift-100)<1e-8,
  'unexpected mouse target projection outside the two researched policies');
 assert.equal(stable.durationMs,moved.durationMs);
 console.log('MOUSE_LATE_REPLAY_CAMERA_RESEARCH '+JSON.stringify({
  stable,moved,projectionDrift:moved.worldX-stable.worldX,
  caveat:'constructed camera mutation between DOM capture and replay; no browser-trusted frequency or player damage established'
 }));
});
