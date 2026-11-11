'use strict';
// #641 research-only falsifier: a sub-tick Sniper press should yield ONE
// weakest quick rail, not full focus, and never fire after cancellation.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
process.env.NOVA_SNIPER_SUBTICK_QUICK_RAIL_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function run(cls,{cancel=false,cooldown=0}={}){
 return withSeed(1517800,()=>{
  const g=bootGame(),i=g.input;g.sfx.muted=true;i.autofire=false;
  g.setClass(g.player,cls);g.player.fireCd=cooldown;
  g.status='playing';g.paused=false;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,
   document:g.__testWindow.document});
  const e=(type,buttons,x)=>({type,pointerType:'touch',pointerId:11,
   button:0,buttons,clientX:x,clientY:200,target:{closest:()=>null}});
  const rails=()=>g.bullets.filter(b=>b.ownerId===g.player.id&&b.beam);
  try{
   i.pd(e('pointerdown',1,600));
   i.pm(e('pointermove',1,640));
   i.pu(e(cancel?'pointercancel':'pointerup',0,640));
   g.update(1/60);
   const first=rails().map(b=>({full:b.__novaFullRail,charge:b.__novaCharge,
    damage:b.dmg,velocity:Math.hypot(b.vx,b.vy)}));
   const cd=g.player.fireCd,focus=g.player.__novaFocusStart||0;
   g.update(1/60);
   return {first,afterSecond:rails().length,cd,focus,
    intents:owner.intents,aimActive:i.aim.active,firing:i.firing};
  }finally{owner.detach();g.destroy();}
 });
}
test('real composed Railgun/Prism/Singularity recover one low-charge short rail',()=>{
 const observations=[];
 for(const cls of ['railgun','prism','singularity']){
  const row=run(cls),canceled=run(cls,{cancel:true}),cooling=run(cls,{cooldown:1});
  const barrels=cls==='prism'?2:1;
  assert.equal(row.first.length,barrels,cls+' must emit one normal quick volley');
  assert.ok(row.first.every(b=>b.full===false),cls+' must not grant full focus');
  assert.ok(row.first.every(b=>b.charge===.05),cls+' minimum quick charge');
  assert.ok(row.first.every(b=>b.damage>0&&b.velocity>0));
  assert.ok(row.cd>0,cls+' must pay existing cooldown');
  assert.equal(row.focus,0,cls+' must not bank focus');
  assert.equal(row.afterSecond,barrels,cls+' must not duplicate the volley');
  assert.equal(row.intents,1);
  assert.equal(row.aimActive,false);assert.equal(row.firing,false);
  assert.equal(canceled.first.length,0,cls+' canceled touch must not fire');
  assert.equal(canceled.intents,0);
  assert.equal(cooling.first.length,0,cls+' cannot bypass weapon cooldown');
  observations.push({cls,quickCharge:row.first[0].charge,cooldown:row.cd});
 }
 console.log('SNIPER_SUBTICK_QUICK_RAIL_RESEARCH '+JSON.stringify({
  observations,caveat:'research-only exact composed Game; fixed minimum charge, no trusted duration or physical device validation'}));
});

test('research patch preserves genuine held-to-released Sniper quick-rail behavior',()=>{
 for(const cls of ['railgun','prism','singularity'])withSeed(1517800,()=>{
  const g=bootGame(),i=g.input;g.sfx.muted=true;i.autofire=false;
  g.setClass(g.player,cls);g.player.fireCd=0;
  g.status='playing';g.paused=false;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,
   document:g.__testWindow.document});
  const e=(type,buttons,x)=>({type,pointerType:'touch',pointerId:11,
   button:0,buttons,clientX:x,clientY:200,target:{closest:()=>null}});
  try{
   i.pd(e('pointerdown',1,600));
   i.pm(e('pointermove',1,640));
   g.update(1/60);
   assert.equal(g.bullets.filter(b=>b.ownerId===g.player.id&&b.beam).length,0,
    cls+' genuine hold must not quick-fire before release');
   assert.ok(g.player.__novaFocusStart>0,cls+' genuine hold begins focus');
   i.pu(e('pointerup',0,640));
   g.update(1/60);
   const rails=g.bullets.filter(b=>b.ownerId===g.player.id&&b.beam);
   assert.equal(rails.length,cls==='prism'?2:1,
    cls+' genuine release still emits one class-specific volley');
   assert.ok(rails.every(b=>b.__novaFullRail===false));
   assert.equal(owner.intents,0,'sampled hold must not create synthetic intent');
   assert.equal(g.player.__novaFocusStart||0,0);
  }finally{owner.detach();g.destroy();}
 });
});
