'use strict';
// Research-only fallback for mouse taps not supplied with a historical
// world target by BrowserEventTimeline. Production input is unchanged.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');

function withOwner(rect,fn){
 const g=bootGame(),i=g.input,win=g.__testWindow;
 g.status='playing';g.paused=false;g.w=800;g.h=600;
 Object.assign(g.cam,{x:20,y:-10,zoom:2});
 i.canvas.getBoundingClientRect=()=>rect;
 const owner=new DirectShotIntent(g,{window:win,document:win.document,
  rebindDomListeners:false});
 try{return fn(owner,g,i);}finally{owner.detach();g.destroy();}
}
test('CSS-scaled center captures the actual world camera center',()=>{
 withOwner({left:100,top:50,width:400,height:300},owner=>{
  const p=owner.captureMouse({clientX:300,clientY:200});
  assert.deepEqual(p.world,{x:20,y:-10});
  const internal=owner.resolveMouse(p);
  assert.deepEqual(internal,{x:500,y:350});
 });
});
test('off-center CSS-scale capture and inverse core projection preserve world target',()=>{
 withOwner({left:100,top:50,width:400,height:300},(owner,g)=>{
  const p=owner.captureMouse({clientX:400,clientY:125});
  assert.deepEqual(p.world,{x:120,y:-85});
  // The replay uses internal coordinates because the existing Game reader
  // still subtracts half of Game.w/h rather than the CSS rectangle.
  g.cam.x=100;g.cam.y=40;
  const internal=owner.resolveMouse(p);
  const rect=g.input.canvas.getBoundingClientRect();
  const x=g.cam.x+(internal.x-rect.left-g.w*.5)/g.cam.zoom;
  const y=g.cam.y+(internal.y-rect.top-g.h*.5)/g.cam.zoom;
  assert.ok(Math.abs(x-p.world.x)<1e-8);
  assert.ok(Math.abs(y-p.world.y)<1e-8);
 });
});
test('1:1 canvas mapping remains unchanged',()=>{
 withOwner({left:100,top:50,width:800,height:600},owner=>{
  const p=owner.captureMouse({clientX:700,clientY:200});
  assert.deepEqual(p.world,{x:120,y:-85});
 });
});
test('missing or invalid presented rectangle cannot fabricate world target',()=>{
 for(const rect of [
  {left:100,top:50,width:0,height:300},
  {left:100,top:50,width:400,height:NaN},
  {left:100,top:50,width:Infinity,height:300}
 ])withOwner(rect,owner=>{
  const p=owner.captureMouse({clientX:300,clientY:200});
  assert.equal(p.world,null);
 });
});
