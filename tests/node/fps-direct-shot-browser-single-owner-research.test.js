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
 const direct=new DirectShotIntent(g,{window:win,document:doc,rebindDomListeners:false,
  maxIntentAgeMs:100,nowMs:()=>now,eventOriginMs:1000});
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

test('real browser pilot factory composes replay-only shot owner without duplicate DOM hooks',()=>{
 const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;i.autofire=false;
 i.detach();const w=target(),d=target(),c=Object.assign(target(),{
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 i.attach(c);
 const baseline=[c.count('pointerdown'),w.count('pointerup'),w.count('pointercancel')];
 let now=1000,callback;const pilot=createFixedStepBrowserPilot(g,{
  window:win,document:doc,canvas:c,
  clock:{now:()=>now,timeOrigin:1793560000000},
  request:fn=>(callback=fn,1),cancel:()=>{},render:()=>{},
  shotOnlyPulseFactory:game=>new DirectShotIntent(game,{
   window:win,document:doc,rebindDomListeners:false})
 });
 try{
  assert.deepEqual([c.count('pointerdown'),w.count('pointerup'),w.count('pointercancel')],[1,1,1]);
  pilot.start();
  assert.equal(typeof callback,'function');
  now=1034;callback(now);
  assert.ok(pilot.owner.ticks>=1,'real pilot advances composed Game');
 }finally{
  pilot.stop();
  assert.deepEqual([c.count('pointerdown'),w.count('pointerup'),w.count('pointercancel')],baseline);
  i.detach();g.destroy();
 }
});

test('fatal browser render tears down replay-only shot owner and restores production input',()=>{
 const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;i.autofire=false;
 i.detach();const w=target(),d=target(),c=Object.assign(target(),{
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 i.attach(c);
 const original={pd:i.pd,pu:i.pu,update:g.update,destroy:g.destroy};
 let now=1000,callback;const pilot=createFixedStepBrowserPilot(g,{
  window:win,document:doc,canvas:c,
  clock:{now:()=>now,timeOrigin:1793560000000},
  request:fn=>(callback=fn,1),cancel:()=>{},
  render:()=>{throw Error('injected single-owner render failure');},
  shotOnlyPulseFactory:game=>new DirectShotIntent(game,{
   window:win,document:doc,rebindDomListeners:false})
 });
 try{
  pilot.start();now=1034;
  assert.throws(()=>callback(now),/injected single-owner render failure/);
  assert.equal(pilot.owner.started,false);
  assert.equal(pilot.capture.active,false);
  assert.equal(pilot.pulse.old,null,'shot owner detached on fatal render');
  assert.equal(i.pd,original.pd);assert.equal(i.pu,original.pu);
  assert.equal(g.update,original.update);assert.equal(g.destroy,original.destroy);
  assert.equal(c.count('pointerdown'),1);
  assert.equal(w.count('pointerup'),1);
  c.emit({type:'pointerdown',pointerType:'mouse',pointerId:1,button:0,buttons:1,
   clientX:600,clientY:200,target:c});
  assert.equal(i.firing,true,'production input usable after fatal research failure');
  w.emit({type:'pointerup',pointerType:'mouse',pointerId:1,button:0,buttons:0,
   clientX:600,clientY:200,target:c});
  assert.equal(i.firing,false);
 }finally{pilot.stop();i.detach();g.destroy();}
});

test('native primary mouse chord remains chronological with replay-only shot intent',()=>{
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;i.autofire=false;g.status='playing';g.paused=false;
 i.detach();const w=target(),d=target(),c=Object.assign(target(),{
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 i.attach(c);
 let now=1000;const timeline=new ChronologicalInput(i);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const capture=new BrowserInputCapture(i,c,timeline,bridge,{window:win,document:doc});
 const direct=new DirectShotIntent(g,{window:win,document:doc,rebindDomListeners:false});
 try{
  const send=(place,type,stamp,button,buttons)=>{now=stamp;place.emit({
   type,timeStamp:stamp,pointerType:'mouse',pointerId:1,
   clientX:640,clientY:220,button,buttons,target:c,preventDefault(){}
  });};
  send(c,'pointerdown',1010,2,2);
  send(c,'mousedown',1011,2,2);
  send(c,'mousedown',1012,0,3);
  assert.equal(i.firing,false,'native primary edge must be queued');
  timeline.consumeThrough(.013);
  assert.equal(i.firing,true,'primary chord press replayed once');
  send(w,'mouseup',1020,0,2);
  assert.equal(i.firing,true,'native release remains queued');
  timeline.consumeThrough(.021);
  assert.ok(direct.pending,'native primary release captures a short shot');
  g.update(1/60);
  assert.equal(direct.intents,1);
  assert.equal(i.firing,false);
  assert.equal(i.__novaShotIntent,undefined);
  g.update(1/60);assert.equal(direct.intents,1);
 }finally{direct.detach();capture.detach();i.detach();g.destroy();}
});
