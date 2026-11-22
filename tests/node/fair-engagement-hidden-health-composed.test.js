'use strict';
// Exercise the actual materialized engine and HTML-ordered 49 overlays.
// Offscreen health is private even when the Game still owns the tank object.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

test('composed Fair Engagement scoring cannot read an offscreen tank HP',()=>withSeed(1094,()=>{
  const g=bootGame();
  let target,oldHp;
  try {
    const bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
    assert.ok(bots.length>=2,'real Game must contain AI targets');
    const observer=bots[0];target=bots[1];
    observer.x=0;observer.y=0;
    // No legal candidate: do not trigger the separately tracked #1025
    // private-assignment saturation scan while testing sight-first scoring.
    for(const q of g.tanks){if(q!==observer){q.x=1900;q.y=0;}}
    g.w=800;g.h=600;g.cam.zoom=1;
    oldHp=Object.getOwnPropertyDescriptor(target,'hp');
    Object.defineProperty(target,'hp',{configurable:true,
      get(){throw Error('composed Game leaked offscreen health');}});
    const C={lineageForClass:()=> 'gunner'};
    assert.equal(g.__testFair.scoreTarget(g,C,observer,observer.ai,target,g.time),-Infinity);
    assert.doesNotThrow(()=>g.__testFair.chooseTarget(g,C,observer,observer.ai,g.time));
  } finally {
    if(target&&oldHp)Object.defineProperty(target,'hp',oldHp);
    g.destroy();
  }
}));

test('composed 49-overlay Game exposes the same public HP evidence used by Phase',()=>withSeed(1095,()=>{
 const g=bootGame();
 try{
  const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
  const C=g.__testWindow.__novaMakeRequire('')('game/classes');
  assert.equal(typeof fair.healthPublicTo,'function',
   'shipping Fair Engagement must export its public-health contract');
  const bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
  assert.ok(bots.length>=2);
  const observer=bots[0],target=bots[1];
  observer.x=0;observer.y=0;
  target.cls='twin';target.x=0;target.y=0;
  g.w=800;g.h=600;g.cam.zoom=1;
  const oldTerrain=g.__novaTerrain;
  g.__novaTerrain=[];
  assert.equal(fair.healthPublicTo(g,C,observer,target),true);
  target.x=2000;
  assert.equal(fair.healthPublicTo(g,C,observer,target),false);
  g.__novaTerrain=oldTerrain;
 }finally{g.destroy();}
}));

test('real composed AI Phase execution respects clipped versus visible HP evidence',()=>withSeed(1096,()=>{
 function attempt(targetY){
  const g=bootGame();
  try{
   const bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
   assert.ok(bots.length>=2);
   const hunter=bots[0],target=bots[1];
   for(const q of g.tanks){if(q!==hunter&&q!==target){q.x=2500;q.y=2500;}}
   hunter.cls='ghost';hunter.x=0;hunter.y=0;hunter.hp=100;hunter.maxHp=100;
   hunter.abilityCd=0;hunter.alive=true;
   hunter.ai.state='hunt';hunter.ai.__v180PlanT=0;
   target.cls='twin';target.x=0;target.y=targetY;target.hp=20;target.maxHp=100;
   target.spawnShieldT=0;target.alive=true;
   g.time=10;g.w=800;g.h=600;g.cam.zoom=1;
   g.__novaTerrain=[];
   g.hasLineOfSight=()=>true;
   let abilities=0;
   g.useAbility=()=>{abilities++;};
   const ai=g.__testWindow.__novaMakeRequire('')('game/ai');
   ai.updateAI(hunter,g,1/60);
   return abilities;
  }finally{g.destroy();}
 }
 assert.equal(attempt(-290),0,'offscreen HP bar cannot trigger execution Phase');
 assert.equal(attempt(-250),1,'readable low HP retains execution Phase');
}));
