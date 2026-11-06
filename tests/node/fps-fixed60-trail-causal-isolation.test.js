'use strict';
// Research-only causal control: suppressing ordinary projectile trail particles
// must not alter the actual Game's combat state or gameplay RNG. This does NOT
// claim a measured browser/Android frame-time improvement.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
  require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const TICKS=120;

function trial(seed,mode,fixed30){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,'tempest');
  // Retain actual enemy, ecology and projectile systems.
  p.spawnShieldT=20;
  g.status='playing';g.paused=false;
  let now=1000,callback=null,owner,ordinary=0,other=0;
  const add=g.addParticles;
  g.addParticles=function(x,y,color,n,speed,kind){
   if(speed===20&&kind==='glow'){
    ordinary+=n;
    if(mode==='suppress-trails')return;
   }else other+=n;
   return add.apply(this,arguments);
  };
  try{
   if(fixed30){
    const timeline=new ChronologicalInput(g.input);
    owner=new FixedStepRafOwner(g,timeline,{timeline,startMs:1000},{
     now:()=>now,request:fn=>{callback=fn;return 1;},
     cancel:()=>{callback=null},render:()=>{},maxSteps:2
    });
    owner.start();
   }
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.input.firing=true;g.input.autofire=false;
   if(fixed30){
    for(let frame=1;frame<=TICKS/2;frame++){
     now=1000+frame*1000/30;
     const next=callback;callback=null;
     assert.equal(typeof next,'function','fixed60 lost RAF ownership');
     next(now);
    }
    assert.equal(owner.ticks,TICKS);
    assert.equal(owner.droppedFrames,0);
   }else for(let tick=0;tick<TICKS;tick++)g.update(1/60);
   return {physical:digest(physical(g)),gameplayDraws:draws(),
    ordinary,other,bullets:g.bullets.length};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}

test('actual composed Tempest: ordinary-trail suppression is simulation- and RNG-neutral',()=>{
 for(const seed of [1517800,1517802]){
  for(const fixed30 of [false,true]){
   const a=trial(seed,'baseline',fixed30);
   const aa=trial(seed,'baseline',fixed30);
   const suppressed=trial(seed,'suppress-trails',fixed30);
   assert.deepEqual(aa,a,'A/A control must be deterministic');
   assert.ok(a.ordinary>0,'fixture must actually emit ordinary trails');
   assert.equal(suppressed.ordinary,a.ordinary,'intervention must reach identical trail opportunities');
   assert.equal(suppressed.physical,a.physical,'cosmetic suppression changed physical Game');
   assert.equal(suppressed.gameplayDraws,a.gameplayDraws,'cosmetic suppression changed gameplay RNG');
  }
 }
});

test('fixed60 at 30Hz presentation preserves native60 projectile trail opportunities',()=>{
 for(const seed of [1517800,1517802]){
  const native=trial(seed,'baseline',false);
  const fixed=trial(seed,'baseline',true);
  assert.equal(fixed.physical,native.physical);
  assert.equal(fixed.gameplayDraws,native.gameplayDraws);
  assert.equal(fixed.ordinary,native.ordinary);
  assert.equal(fixed.other,native.other);
 }
});
