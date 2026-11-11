'use strict';
// #641 research only: real composed Sniper Game with trusted physical edges.
// A delayed simulation callback must not award extra focus or revive stale taps.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
process.env.NOVA_SNIPER_SUBTICK_QUICK_RAIL_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
const focusMs={railgun:520,prism:400,singularity:650};
function scenario(cls,{duration=30,delay=10,invalid=null,cancel=false,suppressed=false,cooldown=0}={}){
 return withSeed(1517800,()=>{
  const g=bootGame(),i=g.input;g.sfx.muted=true;i.autofire=false;
  g.setClass(g.player,cls);g.player.fireCd=cooldown;
  if(suppressed)g.player.__novaSuppressedUntil=Number.MAX_SAFE_INTEGER;
  g.status='playing';g.paused=false;
  const downAt=.140,upAt=downAt+duration/1000;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,
   document:g.__testWindow.document,rebindDomListeners:false,
   requireTrustedDuration:true,eventOriginMs:1000,maxIntentAgeMs:100,
   nowMs:()=>1000+upAt*1000+delay});
  const e=(type,at,buttons,x)=>({type,pointerType:'touch',pointerId:11,
   button:0,buttons,clientX:x,clientY:200,
   __novaOriginalAt:at,__novaTimestampTrusted:true,
   target:{closest:()=>null}});
  try{
   const down=e('pointerdown',downAt,1,600);
   if(invalid==='untrustedDown')down.__novaTimestampTrusted=false;
   i.pd(down);
   i.pm(e('pointermove',downAt+.001,1,640));
   const up=e(cancel?'pointercancel':'pointerup',
     invalid==='reversed'?downAt-.001:invalid==='prestart'?0:upAt,0,640);
   if(invalid==='untrustedUp')up.__novaTimestampTrusted=false;
   i.pu(up);
   g.update(1/60);
   const rails=g.bullets.filter(b=>b.ownerId===g.player.id&&b.beam);
   const first=rails.map(b=>({charge:b.__novaCharge,full:b.__novaFullRail}));
   g.update(1/60);
   return {first,afterSecond:g.bullets.filter(b=>b.ownerId===g.player.id&&b.beam).length,
    focus:g.player.__novaFocusStart||0,intents:owner.intents,
    rejectedStale:owner.rejectedStale,aimActive:i.aim.active,firing:i.firing};
  }finally{owner.detach();g.destroy();}
 });
}
test('trusted physical hold duration controls real quick-rail charge, not callback delay',()=>{
 for(const cls of Object.keys(focusMs)){
  for(const duration of [12,30,100]){
   const a=scenario(cls,{duration,delay:10});
   const b=scenario(cls,{duration,delay:90});
   const expected=Math.max(.05,Math.min(.96,duration/focusMs[cls]));
   const barrels=cls==='prism'?2:1;
   for(const row of [a,b]){
    assert.equal(row.first.length,barrels,cls+' '+duration+'ms');
    assert.ok(row.first.every(x=>x.full===false&&
      Math.abs(x.charge-expected)<1e-8),cls+' charge '+duration+'ms');
    assert.equal(row.afterSecond,barrels,'no second volley');
    assert.equal(row.focus,0,'no focus banking');
    assert.equal(row.intents,1,'one direct intent');
    assert.equal(row.aimActive,false);assert.equal(row.firing,false);
   }
  }
 }
});
test('invalid, reversed, canceled or stale physical events cannot earn Sniper charge',()=>{
 for(const cls of Object.keys(focusMs)){
  for(const invalid of ['untrustedDown','untrustedUp','reversed','prestart']){
   const row=scenario(cls,{invalid});
   assert.equal(row.first.length,0,cls+' '+invalid);
   assert.equal(row.intents,0);
  }
  const canceled=scenario(cls,{cancel:true});
  assert.equal(canceled.first.length,0);assert.equal(canceled.intents,0);
  for(const options of [{suppressed:true},{cooldown:1}]){
   const blocked=scenario(cls,options);
   assert.equal(blocked.first.length,0,cls+' suppressed/cooling');
  }
  const stale=scenario(cls,{delay:101});
  assert.equal(stale.first.length,0);assert.equal(stale.rejectedStale,1);
  // A long hold during a browser stall never earns an almost-full rail
  // merely because no simulation update sampled the physical press.
  for(const duration of [101,250,1000]){
   const long=scenario(cls,{duration,delay:10});
   assert.equal(long.first.length,0,cls+' unsampled '+duration+'ms');
   assert.equal(long.intents,0);
  }
 }
});

function target(){
 const listeners=new Map();
 return {
  addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},
  removeEventListener(k,fn){listeners.get(k)?.delete(fn);},
  emit(e){for(const fn of [...(listeners.get(e.type)||[])])fn(e);},
  count(k){return listeners.get(k)?.size||0}
 };
}
test('actual browser-event bridge retains both physical edges for Sniper charge',()=>{
 const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
 const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
 const {BrowserInputCapture}=require('../research/fixed-step-browser-capture.cjs');
 for(const cls of ['railgun','prism','singularity']){
  const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};i.autofire=false;
  g.status='playing';g.paused=false;g.setClass(g.player,cls);
  g.player.fireCd=0;i.detach();
  const w=target(),d=target(),c=Object.assign(target(),{
   getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
  Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
  Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
  i.attach(c);
  let now=1000;
  const timeline=new ChronologicalInput(i);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const capture=new BrowserInputCapture(i,c,timeline,bridge,{window:win,document:doc});
  const direct=new DirectShotIntent(g,{window:win,document:doc,
   rebindDomListeners:false,requireTrustedDuration:true,eventOriginMs:1000,
   maxIntentAgeMs:100,nowMs:()=>now});
  const send=(place,type,stamp,x,buttons)=>{
   now=stamp;place.emit({type,timeStamp:stamp,pointerType:'touch',
    pointerId:11,clientX:x,clientY:200,button:0,buttons,target:c,
    preventDefault(){}});
  };
  try{
   send(c,'pointerdown',1140,600,1);
   send(w,'pointermove',1141,640,1);
   send(w,'pointerup',1170,640,0);
   assert.equal(i.firing,false,'capture cannot mutate input before replay');
   timeline.consumeThrough(.180);
   assert.ok(direct.pending,'trusted short press should survive bridge');
   assert.ok(Math.abs(direct.pending.durationMs-30)<1e-7);
   now=1180;g.update(1/60);
   const rails=g.bullets.filter(b=>b.ownerId===g.player.id&&b.beam);
   assert.equal(rails.length,cls==='prism'?2:1);
   const expected=Math.max(.05,30/focusMs[cls]);
   assert.ok(rails.every(b=>Math.abs(b.__novaCharge-expected)<1e-8));
   assert.equal(direct.intents,1);
   assert.equal(i.stickId.aim,-1);
   assert.equal(i.firing,false);
   assert.deepEqual([c.count('pointerdown'),w.count('pointerup')],[1,1],
    'browser capture retains sole physical pointer ownership');
  }finally{direct.detach();capture.detach();i.detach();g.destroy();}
 }
});
