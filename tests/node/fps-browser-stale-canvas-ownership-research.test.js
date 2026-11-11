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
  // Shipping Input ignores a second pointer on an already-owned side.
  assert.equal(bridge.capture(e('pointerdown',1012,12,150)),true);
  assert.equal(timeline.events[0].data.__novaCanvasSide,'move');
  assert.equal(timeline.events[1].data.__novaCanvasSide,'aim');
  assert.equal(timeline.events[2].data.__novaCanvasSide,'move');
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

test('chronological replay preserves touch stick ownership and deflection after canvas translation',()=>{
 for(const shift of [0,250,-160]){
  const g=bootGame();
  try{
   let now=1000,left=0,top=0;
   const canvas=g.input.canvas;
   canvas.getBoundingClientRect=()=>({left,top,width:800,height:400,right:left+800,bottom:top+400});
   const timeline=new ChronologicalInput(g.input);
   const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
   const e=(type,stamp,id,x,y)=>({type,timeStamp:stamp,pointerType:'touch',
     pointerId:id,clientX:x,clientY:y,button:0,buttons:1,
     target:{closest:()=>null}});
   now=1020;
   bridge.capture(e('pointerdown',1010,11,100,200));
   bridge.capture(e('pointerdown',1011,22,600,200));
   bridge.capture(e('pointermove',1012,11,130,200));
   bridge.capture(e('pointermove',1013,22,650,180));
   left=shift;top=40;
   timeline.consumeThrough(.02);
   assert.equal(g.input.stickId.move,11,'movement owner at shift '+shift);
   assert.equal(g.input.stickId.aim,22,'aim owner at shift '+shift);
   assert.equal(g.input.move.active,true);
   assert.equal(g.input.aim.active,true);
   assert.ok(Math.abs(g.input.move.dx-30)<1e-6);
   assert.ok(Math.abs(g.input.aim.dx-50)<1e-6);
   assert.ok(Math.abs(g.input.aim.dy+20)<1e-6);
   now=1040;bridge.capture(e('pointerup',1030,22,650,180));
   bridge.capture(e('pointerup',1031,11,130,200));
   timeline.consumeThrough(.04);
   assert.equal(g.input.move.active,false);
   assert.equal(g.input.aim.active,false);
   assert.equal(g.input.firing,false);
  }finally{g.destroy();}
 }
});

test('translated canvas cannot steal a recovered right-stick flick',()=>{
 const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
 const g=bootGame();
 let owner;
 try{
  g.sfx.muted=true;g.input.autofire=false;
  let now=1000,left=0;
  g.input.canvas.getBoundingClientRect=()=>({left,top:0,width:800,height:400,right:left+800,bottom:400});
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  owner=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document,
    rebindDomListeners:false});
  const e=(type,stamp,x)=>({type,timeStamp:stamp,pointerType:'touch',
    pointerId:22,clientX:x,clientY:200,button:0,
    buttons:type==='pointerup'?0:1,target:{closest:()=>null}});
  now=1020;
  bridge.capture(e('pointerdown',1010,600));
  bridge.capture(e('pointerup',1012,640));
  left=500; // Without capture-frame replay this becomes left-stick movement.
  timeline.consumeThrough(.02);
  assert.equal(g.input.aim.active,false);
  assert.equal(g.input.move.active,false);
  assert.ok(owner.pending,'the original right-stick release remains a shot');
  assert.ok(owner.pending.aim.x>.99);
  g.update(1/60);
  assert.equal(owner.intents,1);
  assert.equal(g.input.firing,false);
 }finally{if(owner)owner.detach();g.destroy();}
});

test('canvas translation cannot convert pointercancel into a recovered shot',()=>{
 const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
 const g=bootGame();
 let owner;
 try{
  g.sfx.muted=true;g.input.autofire=false;
  let now=1000,left=0;
  g.input.canvas.getBoundingClientRect=()=>({left,top:0,width:800,height:400,right:left+800,bottom:400});
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  owner=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document,
    rebindDomListeners:false});
  const e=(type,stamp,x)=>({type,timeStamp:stamp,pointerType:'touch',
    pointerId:22,clientX:x,clientY:200,button:0,
    buttons:type==='pointerdown'?1:0,target:{closest:()=>null}});
  now=1020;bridge.capture(e('pointerdown',1010,600));
  bridge.capture(e('pointercancel',1012,640));
  left=500;timeline.consumeThrough(.02);
  assert.equal(owner.pending,null);
  g.update(1/60);
  assert.equal(owner.intents,0);
  assert.equal(g.input.aim.active,false);
  assert.equal(g.input.firing,false);
 }finally{if(owner)owner.detach();g.destroy();}
});
