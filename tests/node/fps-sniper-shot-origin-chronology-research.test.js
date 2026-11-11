'use strict';
// #641 RESEARCH ONLY: a physically released Sniper tap is consumed on a later
// simulation tick. Measure the real projectile origin if the player moves in
// between. This is a falsifier, NOT a proposed rewind or production change.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
process.env.NOVA_SNIPER_SUBTICK_QUICK_RAIL_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function run(cls,offset){
 return withSeed(1517800,()=>{
  const g=bootGame(),i=g.input;
  g.sfx.muted=true;i.autofire=false;
  g.setClass(g.player,cls);g.player.fireCd=0;
  g.status='playing';g.paused=false;
  // Keep the origin experiment free of unrelated collisions, AI and ecology.
  // We still execute the actual materialized Sniper Game.update/fireRail path.
  Object.assign(g.player,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0});
  g.tanks=[g.player];g.tankById=new Map([[g.player.id,g.player]]);
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,
   document:g.__testWindow.document,rebindDomListeners:false,
   requireTrustedDuration:true,eventOriginMs:1000,
   maxIntentAgeMs:100,nowMs:()=>1180});
  const ev=(type,at,buttons,x)=>({type,pointerType:'touch',pointerId:11,
   button:0,buttons,clientX:x,clientY:200,
   __novaOriginalAt:at,__novaTimestampTrusted:true,
   __novaPhysicalTimestampExact:true,target:{closest:()=>null}});
  try{
   const releaseX=g.player.x,releaseY=g.player.y;
   i.pd(ev('pointerdown',.140,1,600));
   i.pm(ev('pointermove',.141,1,640));
   i.pu(ev('pointerup',.170,0,640));
   assert.ok(owner.pending,'physical release must preserve one shot');
   // Controlled displacement isolates the later simulation-origin question.
   // No claim that teleportation represents ordinary movement or cover.
   g.player.x+=offset;
   g.update(1/60);
   const rails=Array.from(g.bullets.filter(b=>
    b.ownerId===g.player.id&&b.beam),b=>({
     x:b.x,y:b.y,charge:b.__novaCharge,full:b.__novaFullRail
   }));
   assert.equal(rails.length,cls==='prism'?2:1,
    'real composed Sniper quick rail must be created');
   assert.equal(owner.intents,1);
   assert.equal(i.aim.active,false);
   assert.equal(i.firing,false);
   return {releaseX,releaseY,updateX:g.player.x,
    rails,intents:owner.intents};
  }finally{owner.detach();g.destroy();}
 });
}
test('research: delayed Sniper release uses later player origin; quantify provenance gap',()=>{
 for(const cls of ['railgun','prism','singularity']){
  const base=run(cls,0);
  for(const offset of [10,30,120]){
   const shifted=run(cls,offset);
   assert.equal(base.rails.length,shifted.rails.length);
   for(let n=0;n<base.rails.length;n++){
    const a=base.rails[n],b=shifted.rails[n];
    assert.ok(Math.abs(a.charge-b.charge)<1e-8,
     'physical charge must not depend on player displacement');
    assert.equal(a.full,false);assert.equal(b.full,false);
    assert.ok(Math.abs((b.x-a.x)-offset)<2,
     'projectile origin should expose later simulation displacement');
    assert.ok(Math.abs(b.y-a.y)<2,
     'lateral controlled displacement should not change barrel Y');
   }
   console.log('SNIPER_SHOT_ORIGIN_CHRONOLOGY '+JSON.stringify({
    cls,offset,releaseX:base.releaseX,baseUpdateX:base.updateX,
    shiftedUpdateX:shifted.updateX,
    originDeltaX:shifted.rails[0].x-base.rails[0].x,
    charge:base.rails[0].charge,
    caveat:'constructed displacement between physical release and next simulation; not natural movement, terrain or browser latency'
   }));
  }
 }
});
