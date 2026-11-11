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
function scenario(cls,{duration=30,delay=10,invalid=null,cancel=false}={}){
 return withSeed(1517800,()=>{
  const g=bootGame(),i=g.input;g.sfx.muted=true;i.autofire=false;
  g.setClass(g.player,cls);g.player.fireCd=0;
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
   i.pd(e('pointerdown',invalid==='untrustedDown'?0:downAt,1,600));
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
  const stale=scenario(cls,{delay:101});
  assert.equal(stale.first.length,0);assert.equal(stale.rejectedStale,1);
 }
});
