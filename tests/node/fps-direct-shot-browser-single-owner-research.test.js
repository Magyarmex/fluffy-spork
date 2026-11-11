'use strict';
// #641 research-only: chronological browser capture is the sole physical DOM
// pointer owner; DirectShotIntent observes replayed Input methods only.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {BrowserInputCapture}=require('../research/fixed-step-browser-capture.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function target(){
 const map=new Map();return {
  addEventListener(k,fn){if(!map.has(k))map.set(k,new Set());map.get(k).add(fn);},
  removeEventListener(k,fn){map.get(k)?.delete(fn);},
  emit(e){for(const fn of [...(map.get(e.type)||[])])fn(e);},
  count(k){return map.get(k)?.size||0;}
 };
}
test('single DOM pointer owner, chronological short tap, and reversible teardown',()=>{
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;g.input.autofire=false;g.status='playing';g.paused=false;
 i.detach();const w=target(),d=target(),c=Object.assign(target(),{
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 i.attach(c);
 const baseline=[c.count('pointerdown'),w.count('pointerup'),w.count('pointercancel')];
 let now=1000;const timeline=new ChronologicalInput(i);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const capture=new BrowserInputCapture(i,c,timeline,bridge,{window:win,document:doc});
 const captured=[c.count('pointerdown'),w.count('pointerup'),w.count('pointercancel')];
 const direct=new DirectShotIntent(g,{window:win,document:doc,rebindDomListeners:false});
 try{
  assert.deepEqual([c.count('pointerdown'),w.count('pointerup'),w.count('pointercancel')],captured,
   'direct owner must not add pointer listeners to browser capture');
  const fire=(place,type,stamp,x,buttons)=>{now=stamp;place.emit({
   type,timeStamp:stamp,pointerType:'touch',pointerId:11,
   clientX:x,clientY:200,button:0,buttons,target:c,preventDefault(){}
  });};
  fire(c,'pointerdown',1010,600,1);
  fire(w,'pointermove',1012,640,1);
  fire(w,'pointerup',1018,640,0);
  assert.equal(i.firing,false,'physical event must remain queued');
  timeline.consumeThrough(.02);
  assert.ok(direct.pending,'replay should capture one short shot');
  g.update(1/60);
  assert.equal(direct.intents,1);
  assert.equal(direct.pending,null);
  assert.equal(i.firing,false);
  assert.equal(i.aim.active,false);
  g.update(1/60);assert.equal(direct.intents,1,'no duplicate shot');
 }finally{
  direct.detach();capture.detach();
  assert.deepEqual([c.count('pointerdown'),w.count('pointerup'),w.count('pointercancel')],baseline,
   'production pointer listeners must be restored');
  i.detach();g.destroy();
 }
});
test('invalid DOM ownership option fails closed',()=>{
 const g=bootGame();
 try{assert.throws(()=>new DirectShotIntent(g,{
  window:g.__testWindow,document:g.__testWindow.document,rebindDomListeners:'false'
 }),/DOM ownership/);}finally{g.destroy();}
});
