'use strict';
// #641 RESEARCH ONLY. Positive regression for the opt-in fixed60 browser
// factory's DOM-time mouse projection on a CSS-scaled canvas.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');

test('opt-in fixed60 factory preserves CSS-scaled canvas center world target',()=>{
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;i.autofire=false;g.status='playing';g.paused=false;
 Object.assign(g.cam,{x:20,y:-10,zoom:1});
 g.w=800;g.h=600;
 const oldRect=i.canvas.getBoundingClientRect;
 i.canvas.getBoundingClientRect=()=>({left:0,top:0,width:400,height:300});
 let now=1000;
 const pilot=createFixedStepBrowserPilot(g,{
  window:win,document:doc,canvas:i.canvas,
  clock:{now:()=>now,timeOrigin:1793560000000},
  request:()=>1,cancel:()=>{},render:()=>{},
  shotOnlyPulseFactory:game=>new DirectShotIntent(game,{
   window:win,document:doc,rebindDomListeners:false,
   requireTrustedDuration:true,eventOriginMs:1000,
   maxIntentAgeMs:100,nowMs:()=>1180})
 });
 const event=(type,stamp,buttons)=>({type,timeStamp:stamp,
  pointerType:'mouse',pointerId:1,button:0,buttons,
  clientX:200,clientY:150,target:{closest:()=>null}});
 try{
  now=1100;assert.equal(pilot.bridge.capture(event('pointerdown',1100,1)),true);
  now=1130;assert.equal(pilot.bridge.capture(event('pointerup',1130,0)),true);
  pilot.timeline.consumeThrough(.2);
  const captured=pilot.pulse.pending&&pilot.pulse.pending.world;
  assert.ok(captured,'actual factory must deliver a captured mouse target');
  const expected={x:20,y:-10}; // physical CSS-rect center
  assert.ok(Math.abs(captured.x-expected.x)<1e-8&&
    Math.abs(captured.y-expected.y)<1e-8,
   'CSS-scaled pointer center must remain the camera world center');
  console.log('FIXED60_CSS_MOUSE_CAPTURE_PARITY '+JSON.stringify({
   expected,captured,canvasInternal:{w:800,h:600},
   canvasPresented:{w:400,h:300},
   caveat:'research-only CSS-scale fixture; no measured production player error'
  }));
 }finally{
  pilot.stop();i.canvas.getBoundingClientRect=oldRect;g.destroy();
 }
});
