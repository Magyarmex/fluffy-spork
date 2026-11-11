'use strict';
// #641 research-only: two browser-captured right-stick gestures must not
// steal one another's physical ownership or replay an obsolete shot.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {BrowserInputCapture}=require('../research/fixed-step-browser-capture.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function target(){
 const listeners=new Map();
 return {
  addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},
  removeEventListener(k,fn){listeners.get(k)?.delete(fn);},
  emit(e){for(const fn of [...(listeners.get(e.type)||[])])fn(e);},
  count(k){return listeners.get(k)?.size||0}
 };
}
test('browser chronological replay gives rapid retarget to the second pointer, never stale first aim',()=>{
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;g.sfx.startMusic=()=>{};i.autofire=false;
 g.status='playing';g.paused=false;g.player.angle=0;
 i.detach();
 const w=target(),d=target(),c=Object.assign(target(),{
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 i.attach(c);
 let now=1000;
 const timeline=new ChronologicalInput(i);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const capture=new BrowserInputCapture(i,c,timeline,bridge,{window:win,document:doc});
 const direct=new DirectShotIntent(g,{window:win,document:doc,rebindDomListeners:false});
 const send=(place,type,stamp,id,x,y,buttons)=>{
  now=stamp;place.emit({type,timeStamp:stamp,pointerType:'touch',
   pointerId:id,clientX:x,clientY:y,button:0,buttons,target:c,preventDefault(){}});
 };
 try{
  // Both touches are physically complete before the next simulation tick.
  // The first short shot is superseded by the second press, not fired east.
  send(c,'pointerdown',1010,11,600,200,1);
  send(w,'pointermove',1012,11,640,200,1);
  send(w,'pointerup',1018,11,640,200,0);
  send(c,'pointerdown',1022,12,600,200,1);
  send(w,'pointermove',1024,12,600,260,1);
  send(w,'pointerup',1030,12,600,260,0);
  assert.equal(i.firing,false,'physical DOM capture must not mutate Input');
  timeline.consumeThrough(.031);
  assert.ok(direct.pending,'latest short gesture must survive replay');
  assert.equal(direct.pendingSource.id,12,'the newer physical pointer owns the shot');
  assert.ok(Math.abs(direct.pending.aim.x)<.05,'old eastward aim must not survive');
  assert.ok(direct.pending.aim.y>.9,'new downward aim must be preserved');
  assert.equal(i.stickId.aim,-1,'no physical stick may remain captured');
  // Assert real projectile physics, not only the transient intent object.
  const births=[];const originalTryFire=g.tryFire;
  g.tryFire=function(tank){
   const before=this.bullets.length;
   const out=originalTryFire.apply(this,arguments);
   if(tank===g.player)births.push(...this.bullets.slice(before).map(b=>({vx:b.vx,vy:b.vy})));
   return out;
  };
  g.player.fireCd=0;
  g.update(1/60);
  assert.equal(births.length,1,'latest short gesture creates exactly one real projectile');
  assert.ok(births[0].vy>0&&g.player.angle>0.1,
   'real projectile must begin turning toward newer downward aim, not remain east');
  assert.equal(direct.intents,1,'only one intended shot can be consumed');
  assert.equal(i.firing,false);
  assert.equal(i.aim.active,false);
  assert.equal(i.__novaShotIntent,undefined);
  g.update(1/60);
  assert.equal(direct.intents,1,'no replay on later updates');
  assert.deepEqual([c.count('pointerdown'),w.count('pointerup'),w.count('pointercancel')],[1,1,1]);
 }finally{
  direct.detach();capture.detach();
  i.detach();g.destroy();
 }
});

test('real fixed-step browser factory consumes two short gestures once at next tick',()=>{
 const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;g.sfx.startMusic=()=>{};i.autofire=false;
 g.status='playing';g.paused=false;g.player.fireCd=0;g.player.angle=0;
 i.detach();
 const w=target(),d=target(),c=Object.assign(target(),{
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 i.attach(c);
 let now=1000,callback;
 const births=[],oldTryFire=g.tryFire;
 g.tryFire=function(tank){
  const before=this.bullets.length;
  const result=oldTryFire.apply(this,arguments);
  if(tank===g.player)births.push(...this.bullets.slice(before).map(b=>({vx:b.vx,vy:b.vy})));
  return result;
 };
 const pilot=createFixedStepBrowserPilot(g,{
  window:win,document:doc,canvas:c,
  clock:{now:()=>now,timeOrigin:1793560000000},
  request:fn=>(callback=fn,1),cancel:()=>{},render:()=>{},
  shotOnlyPulseFactory:game=>new DirectShotIntent(game,{
   window:win,document:doc,rebindDomListeners:false,
   maxIntentAgeMs:100,nowMs:()=>now,eventOriginMs:1000})
 });
 const send=(place,type,stamp,id,x,y,buttons)=>{
  now=stamp;place.emit({type,timeStamp:stamp,pointerType:'touch',
   pointerId:id,clientX:x,clientY:y,button:0,buttons,target:c,preventDefault(){}});
 };
 try{
  pilot.start();
  send(c,'pointerdown',1002,11,600,200,1);
  send(w,'pointermove',1004,11,640,200,1);
  send(w,'pointerup',1006,11,640,200,0);
  send(c,'pointerdown',1008,12,600,200,1);
  send(w,'pointermove',1010,12,600,260,1);
  send(w,'pointerup',1012,12,600,260,0);
  assert.equal(i.firing,false,'DOM events must remain queued until RAF simulation');
  now=1034;callback(now);
  assert.equal(pilot.owner.lastSteps,2,'real pilot must advance both eligible ticks');
  assert.equal(pilot.pulse.intents,1,'latest physical gesture is consumed once');
  assert.equal(births.length,1,'one real player projectile, not two stale shots');
  assert.ok(births[0].vy>0&&g.player.angle>0.1,
   'projectile begins turning toward the second downward gesture');
  assert.equal(i.stickId.aim,-1);
  assert.equal(i.firing,false);
 }finally{
  pilot.stop();i.detach();g.destroy();
 }
});
