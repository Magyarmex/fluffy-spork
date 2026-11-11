'use strict';
// #641 RESEARCH ONLY. Compose the real Sniper quick-rail barrel origin with
// Battlefield's actual swept terrain test. This is NOT a damage or rewind fix.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
process.env.NOVA_SNIPER_SUBTICK_QUICK_RAIL_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');

function scenario(cls,lateral){
 return withSeed(1517800,()=>{
  const g=bootGame(),i=g.input;
  g.sfx.muted=true;i.autofire=false;
  g.setClass(g.player,cls);g.player.fireCd=0;
  g.status='playing';g.paused=false;
  Object.assign(g.player,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0});
  g.tanks=[g.player];g.tankById=new Map([[g.player.id,g.player]]);
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  const wall={id:-1,shape:'rect',x:110,y:0,w:12,h:80,
   solid:true,destructible:false,hp:0,maxHp:0};
  // Keep cover absent during firing setup; install it for the same
  // authoritative Battlefield intersection query after real projectile birth.
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,
   document:g.__testWindow.document,rebindDomListeners:false,
   requireTrustedDuration:true,eventOriginMs:1000,
   maxIntentAgeMs:100,nowMs:()=>1260});
  const ev=(type,at,buttons,x)=>({type,pointerType:'touch',pointerId:11,
   button:0,buttons,clientX:x,clientY:200,
   __novaOriginalAt:at,__novaTimestampTrusted:true,
   __novaPhysicalTimestampExact:true,target:{closest:()=>null}});
  try{
   i.pd(ev('pointerdown',.140,1,600));
   i.pm(ev('pointermove',.141,1,640));
   i.pu(ev('pointerup',.170,0,640));
   assert.ok(owner.pending,'the physical 30ms release is retained');
   g.player.y+=lateral;
   g.update(1/60);
   const rails=g.bullets.filter(b=>b.ownerId===g.player.id&&b.beam);
   assert.equal(rails.length,cls==='prism'?2:1);
   g.__novaTerrain=[wall];g.__novaBattlefieldIndex=null;
   const traces=rails.map(b=>{
    const speed=Math.hypot(b.vx||0,b.vy||0);
    assert.ok(speed>0,'real rail velocity must be nonzero');
    const dx=b.vx/speed,dy=b.vy/speed;
    const contact=g.firstTerrainHit(b.x,b.y,b.x+dx*240,b.y+dy*240,(b.r||0)*.45);
    return {x:b.x,y:b.y,dx,dy,r:b.r,blocked:!!contact};
   });
   assert.equal(owner.intents,1);
   // Observational full engine collision pass. Do not freeze its result until
   // the real Game establishes the wall/contact behavior on CI.
   const projectiles=rails.slice();
   g.updateBullets(.1);
   g.updateBullets(.1);
   const surviving=projectiles.map(b=>!b.dead&&g.bullets.includes(b));
   return {traces,surviving};
  }finally{owner.detach();g.destroy();}
 });
}

test('research: real Sniper barrel origins change Battlefield cover contact after delayed release',()=>{
 for(const cls of ['railgun','prism','singularity']){
  const original=scenario(cls,0),later=scenario(cls,100);
  assert.equal(original.traces.length,later.traces.length);
  for(let j=0;j<original.traces.length;j++){
   const a=original.traces[j],b=later.traces[j];
   assert.ok(Math.abs((b.y-a.y)-100)<2,
    'real barrel should follow the later player position');
   assert.equal(a.blocked,true,
    'release-position rail should intersect the permanent wall');
   assert.equal(b.blocked,false,
    'later-position rail should clear the same permanent wall');
  }
  console.log('SNIPER_BARREL_COVER_RESEARCH '+JSON.stringify({
   cls,original,later,
   limitation:'projectiles born in composed Game; authoritative terrain ray checked separately, not a target HP or real-time movement outcome'
  }));
 }
});
