'use strict';
// #641 research-only: real 49-overlay Sniper short-tap lifecycle.
// Do not freeze today's missing quick-shot as desirable behavior.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');

test('subtick Sniper tap cannot bank focus or manufacture a full rail on the next press',()=>{
 const observations=[];
 for(const cls of ['railgun','prism','singularity']){
  const result=withSeed(1517800,()=>{
   const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
   g.setClass(g.player,cls);g.player.fireCd=0;
   g.status='playing';g.paused=false;
   const i=g.input,o=new DirectShotIntent(g,{
    window:g.__testWindow,document:g.__testWindow.document});
   const ev=(type,buttons,x=640)=>({type,pointerType:'touch',
    pointerId:11,button:0,buttons,clientX:x,clientY:200,
    target:{closest:()=>null}});
   const ownRails=()=>Array.from(g.bullets.filter(b=>
    b.ownerId===g.player.id&&b.beam));
   try{
    i.pd(ev('pointerdown',1,600));
    i.pm(ev('pointermove',1,640));
    i.pu(ev('pointerup',0,640));
    assert.ok(o.pending,'physical short tap creates a research intent');
    g.update(1/60);
    const afterTap=ownRails();
    assert.equal(o.intents,1,'one synthetic input tick consumed');
    assert.equal(i.__novaShotIntent,undefined,'synthetic intent is released');
    assert.equal(i.firing,false,'physical right stick is released');
    assert.equal(i.aim.active,false,'touch owner is released');
    assert.equal(g.player.__novaFocusStart||0,0,
     'short tap must not bank wall-clock rail focus for a later press');
    assert.ok(afterTap.every(b=>b.__novaFullRail!==true),
     'a short tap must never award a fully charged rail');
    i.pd(ev('pointerdown',1,600));
    i.pm(ev('pointermove',1,640));
    g.player.fireCd=0;
    g.update(1/60);
    const afterNewPress=ownRails();
    assert.ok(afterNewPress.every(b=>b.__novaFullRail!==true),
     'next fresh press cannot inherit a free fully charged rail');
    return {cls,subtickRailBirths:afterTap.length,
     nextPressRailBirths:afterNewPress.length,
     nextPressFocusStart:g.player.__novaFocusStart||0};
   }finally{o.detach();g.destroy();}
  });
  observations.push(result);
 }
 console.log('DIRECT_SNIPER_SUBTICK_RESEARCH '+JSON.stringify({
  observations,caveat:'research-only composed Game; zero current quick shots are observed, not asserted as desired; no browser/physical-device evidence'}));
});
