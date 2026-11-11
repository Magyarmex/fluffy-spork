'use strict';
// Research only: queued touch ownership must not be recomputed using a later
// canvas location when a stale DOM event forces input quarantine.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');

test('stale quarantine preserves both accepted stick owners across canvas relocation',()=>{
 const g=bootGame();
 try{
  let now=1000,shift=0;
  const canvas=g.input.canvas;
  const original=canvas.getBoundingClientRect.bind(canvas);
  canvas.getBoundingClientRect=()=>({...original(),left:shift,
    width:800,right:shift+800});
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const e=(type,stamp,id,x)=>({type,timeStamp:stamp,pointerType:'touch',
    pointerId:id,clientX:x,clientY:200,button:0,buttons:1,
    target:{closest:()=>null}});
  now=1020;
  assert.equal(bridge.capture(e('pointerdown',1010,11,100)),true);
  assert.equal(bridge.capture(e('pointerdown',1011,22,600)),true);
  assert.equal(timeline.events[0].data.__novaCanvasSide,'move');
  assert.equal(timeline.events[1].data.__novaCanvasSide,'aim');
  // Both touches were queued but not sampled. The canvas shifts before a
  // delayed old event forces quarantine; current geometry would place both
  // pointers on the move side and silently lose aim owner 22.
  shift=500;now=5000;
  assert.equal(bridge.capture(e('pointermove',1015,11,120)),false);
  assert.equal(bridge.staleClamps,1);
  assert.deepEqual([...bridge.pendingStaleTouchIds].sort((a,b)=>a-b),[11,22]);
  assert.equal(bridge.takeStaleTouchResetNotice(),true);
  assert.equal(bridge.takeStaleTouchResetNotice(),false);
  assert.equal(timeline.quarantined,true);
  assert.equal(g.input.move.active,false);
  assert.equal(g.input.aim.active,false);
  now=5010;
  assert.equal(bridge.capture(e('pointerup',5005,22,610)),false);
  assert.equal(timeline.quarantined,false);
  assert.equal(g.input.firing,false);
 }finally{g.destroy();}
});
