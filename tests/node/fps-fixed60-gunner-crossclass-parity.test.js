'use strict';
// Research-only acceptance gate for the opt-in fixed60 RAF owner.
// A Tempest-only cadence win must not silently change other Gunner classes.
// This executes the real composed 49-overlay Game, not a cooldown toy model.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
  require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');

const CLASSES=['twin','minigun','shotgun','tempest',
  'needlestorm','breachlord','flakmaster'];
const TICKS=240;

function run(cls,seed,presentationHz){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  g.status='playing';g.paused=false;
  let owner,now=1000,callback=null,volleys=0;
  const original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return result;
  };
  try{
   if(presentationHz===30){
    const timeline=new ChronologicalInput(g.input);
    const bridge={timeline,startMs:1000};
    owner=new FixedStepRafOwner(g,timeline,bridge,{
     now:()=>now,request:fn=>{callback=fn;return 1;},
     cancel:()=>{callback=null},render:()=>{},maxSteps:2
    });
    owner.start();
   }
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.input.firing=true;g.input.autofire=false;
   if(presentationHz===30){
    for(let frame=1;frame<=TICKS/2;frame++){
     now=1000+frame*1000/30;
     const next=callback;
     assert.equal(typeof next,'function','fixed60 must retain RAF ownership');
     callback=null;next(now);
    }
    assert.equal(owner.ticks,TICKS,'no 60Hz simulation tick may disappear');
    assert.equal(owner.droppedFrames,0,'healthy 30Hz must not drop simulation time');
    assert.equal(owner.droppedMs,0);
   }else{
    for(let tick=0;tick<TICKS;tick++)g.update(1/60);
   }
   return {volleys,hash:digest(physical(g)),draws:draws(),
    heat:p.__v17Heat||0,fireCd:p.fireCd,
    shotIndex:p.__v17ShotIndex||0,overheatT:p.overheatT||0};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}

test('fixed60 30Hz presentation preserves seven Gunner class outcomes and RNG',()=>{
 for(const cls of CLASSES){
  for(const seed of [1517800,1517802]){
   const reference=run(cls,seed,60);
   const fixed30=run(cls,seed,30);
   assert.ok(reference.volleys>0,cls+' must fire in the fixture');
   assert.deepEqual(fixed30,reference,
    cls+' at seed '+seed+' diverged from the actual 60Hz Game');
  }
 }
});
