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

function trial(seed,mode,fixed30,quality='low'){
 return withSeed(seed,draws=>{
  const g=bootGame(quality),p=g.player;
  assert.equal(g.parts.length,quality==='low'?200:400,'shipping particle pool size');
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,'tempest');
  // Retain actual enemy, ecology and projectile systems.
  p.spawnShieldT=20;
  g.status='playing';g.paused=false;
  let now=1000,callback=null,owner,ordinary=0,other=0;
  let poolWrites=0,activeOverwrites=0;
  let inBulletUpdate=false;
  const updateBullets=g.updateBullets;
  g.updateBullets=function(){
   const was=inBulletUpdate;inBulletUpdate=true;
   try{return updateBullets.apply(this,arguments);}
   finally{inBulletUpdate=was;}
  };
  const add=g.addParticles;
  g.addParticles=function(x,y,color,n,speed,kind){
   // Never suppress another system's glow with the same particle signature.
   if(inBulletUpdate&&n===1&&speed===20&&kind==='glow'){
    ordinary+=n;
    if(mode==='suppress-trails'){
     // Canonical single-glow addParticles consumes four cosmetic draws.
     // Burn the same draws so downstream visual choices remain paired.
     for(let i=0;i<4;i++)this.cosmeticRandom();
     return;
    }
   }else other+=n;
   // Count actual writes to the shipping circular particle pool, not just
   // requested effects. The low-quality pool still writes one trail particle.
   const writes=this.quality==='low'?Math.max(1,Math.round(n*0.5)):n;
   for(let i=0;i<writes;i++){
    const slot=this.parts[(this.partIdx+i)%this.parts.length];
    if(slot.active&&slot.life>0)activeOverwrites++;
   }
   poolWrites+=writes;
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
    ordinary,other,poolWrites,activeOverwrites,
    cosmeticState:g.__novaCosmeticRngState,
    gunner:[p.fireCd,p.__v17Heat,p.__v17Stability,p.__v17ShotIndex,
     p.__v17FiredAt,g.__v17FiringStepDt],
    bullets:g.bullets.length};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}

test('actual composed Tempest: ordinary-trail suppression is simulation- and RNG-neutral',()=>{
 for(const quality of ['low','high'])for(const seed of [1517800,1517802]){
  for(const fixed30 of [false,true]){
   const a=trial(seed,'baseline',fixed30,quality);
   const aa=trial(seed,'baseline',fixed30,quality);
   const suppressed=trial(seed,'suppress-trails',fixed30,quality);
   assert.deepEqual(aa,a,'A/A control must be deterministic');
   assert.ok(a.ordinary>0,'fixture must actually emit ordinary trails');
   assert.equal(suppressed.ordinary,a.ordinary,'same trail opportunities must be sampled');
   assert.equal(suppressed.other,a.other,'other feedback call sites must remain paired');
   assert.equal(a.poolWrites-suppressed.poolWrites,a.ordinary,
    'each suppressed ordinary trail must eliminate exactly one real particle-pool write');
   assert.ok(a.poolWrites>suppressed.poolWrites,
    'cosmetic intervention must actually reduce circular particle-pool writes');
   assert.ok(a.activeOverwrites>=0&&suppressed.activeOverwrites>=0,
    'record live-particle replacement pressure without assuming it improves');
   assert.equal(suppressed.cosmeticState,a.cosmeticState,'cosmetic RNG sequence must be preserved');
   assert.equal(suppressed.physical,a.physical,'cosmetic suppression changed physical Game');
   assert.deepEqual(suppressed.gunner,a.gunner,
    'cosmetic suppression changed Tempest heat, stability or cadence state');
   assert.equal(suppressed.gameplayDraws,a.gameplayDraws,'cosmetic suppression changed gameplay RNG');
   console.log('NOVA_TRAIL_POOL_CENSUS '+JSON.stringify({seed,fixed30,quality,
    ordinary:a.ordinary,baselineWrites:a.poolWrites,
    suppressedWrites:suppressed.poolWrites,
    baselineActiveOverwrites:a.activeOverwrites,
    suppressedActiveOverwrites:suppressed.activeOverwrites}));
  }
 }
});

test('fixed60 at 30Hz presentation preserves native60 projectile trail opportunities',()=>{
 for(const quality of ['low','high'])for(const seed of [1517800,1517802]){
  const native=trial(seed,'baseline',false,quality);
  const fixed=trial(seed,'baseline',true,quality);
  assert.equal(fixed.physical,native.physical);
  assert.equal(fixed.gameplayDraws,native.gameplayDraws);
  assert.equal(fixed.ordinary,native.ordinary);
 }
});
