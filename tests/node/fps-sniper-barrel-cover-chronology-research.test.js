'use strict';
// #641 RESEARCH ONLY. Compose the real Sniper quick-rail barrel origin with
// Battlefield's actual swept terrain test. This is NOT a damage or rewind fix.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
process.env.NOVA_SNIPER_SUBTICK_QUICK_RAIL_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');

function scenario(cls,lateral,wallHeight=80,targeted=false,naturalMove=false,freezeMove=false){
 return withSeed(1517800,()=>{
  const g=bootGame(),i=g.input;
  g.sfx.muted=true;i.autofire=false;
  g.setClass(g.player,cls);g.player.fireCd=0;
  g.status='playing';g.paused=false;
  Object.assign(g.player,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0});
  const victim=targeted?g.tanks.find(t=>t!==g.player):null;
  if(targeted)assert.ok(victim,'real Game must provide an actual hostile tank fixture');
  if(victim)Object.assign(victim,{cls:'scout',x:200,y:20,vx:0,vy:0,
   hp:100000,maxHp:100000,alive:true,isPlayer:true,gene:null,perk:null,
   spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.tanks=victim?[g.player,victim]:[g.player];
  g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
  const victimHp=victim?victim.hp:null;
  if(victim){
   // Keep a true manually aimed eastward rail: the existing target must not
   // silently engage the shipping touch nearest-target assist and bend the
   // beam around the narrow cover. Other collision/damage owners stay real.
   const nearest=g.nearestTank;
   g.nearestTank=function(x,y,radius,except){
    if(except===g.player.id&&radius===480&&x===g.player.x&&y===g.player.y)return null;
    return nearest.apply(this,arguments);
   };
  }
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  const wall={id:-1,shape:'rect',x:110,y:0,w:12,h:wallHeight,
   solid:true,destructible:false,hp:0,maxHp:0};
  // Keep the same permanent wall in the real Game from input through
  // projectile birth and collision; do not conjure cover after firing.
  g.__novaTerrain=[wall];g.__novaBattlefieldIndex=null;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,
   document:g.__testWindow.document,rebindDomListeners:false,
   requireTrustedDuration:true,eventOriginMs:1000,
   maxIntentAgeMs:100,nowMs:()=>1260});
  const ev=(type,at,buttons,x)=>({type,pointerType:'touch',pointerId:11,
   button:0,buttons,clientX:x,clientY:200,
   __novaOriginalAt:at,__novaTimestampTrusted:true,
   __novaPhysicalTimestampExact:true,target:{closest:()=>null}});
  try{
   // Natural-movement arm starts at its actual physical release position;
   // unlike the legacy constructed-shift arms, do not teleport after up.
   if(naturalMove)g.player.y=lateral;
   i.pd(ev('pointerdown',.140,1,600));
   i.pm(ev('pointermove',.141,1,640));
   i.pu(ev('pointerup',.170,0,640));
   assert.ok(owner.pending,'the physical 30ms release is retained');
   if(!naturalMove)g.player.y+=lateral;
   if(naturalMove){
    // Model an already-moving tank, not a teleported hull: the actual
    // Game.update must advance it before consuming the physical release.
    i.move.active=true;i.move.dx=0;i.move.dy=1;
    g.player.vy=g.tankSpeed(g.player);
    if(freezeMove){
     // Research-only counterfactual: retain the exact inherited projectile
     // velocity but prevent hull translation on this one update.
     const move=g.moveTank;
     g.moveTank=function(t){if(t===g.player)return;return move.apply(this,arguments);};
    }
   }
   g.update(1/60);
   const rails=g.bullets.filter(b=>b.ownerId===g.player.id&&b.beam);
   assert.equal(rails.length,cls==='prism'?2:1);
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
   return {traces,surviving,playerY:g.player.y,targetDamage:victim?Math.max(0,victimHp-victim.hp):null};
  }finally{owner.detach();g.destroy();}
 });
}

test('research: real Sniper barrel origins change Battlefield cover contact after delayed release',()=>{
 for(const cls of ['railgun','prism','singularity']){
  const original=scenario(cls,0),later=scenario(cls,100);
  assert.equal(original.traces.length,later.traces.length);
  for(let j=0;j<original.traces.length;j++){
   const a=original.traces[j],b=later.traces[j];
   const originShift=b.y-a.y;
   // The current pilot fires at the later position (+100). A future
   // chronology fix may correctly retain the release origin (0). Do not
   // freeze the known provenance gap as a desired gameplay golden.
   assert.ok(Math.abs(originShift-100)<2||Math.abs(originShift)<2,
    'unexpected barrel origin policy outside the two researched alternatives');
   assert.equal(a.blocked,true,
    'release-position rail should intersect the permanent wall');
   assert.equal(original.surviving[j],false,
    'actual Battlefield bullet pass must stop the covered rail');
   assert.equal(later.surviving[j],!b.blocked,
    'actual Battlefield collision must agree with the live barrel-to-wall ray');
  }
  console.log('SNIPER_BARREL_COVER_RESEARCH '+JSON.stringify({
   cls,original,later,
   limitation:'actual composed projectile birth and Battlefield collision pass; constructed 100u displacement, no target HP or natural movement outcome'
  }));
 }
});

// A 20u translation is within plausible local combat repositioning, unlike
// the original 100u falsifier. It is still constructed, not a witnessed
// movement gesture or a target-HP experiment. Keep the same permanent wall
// throughout the actual Game projectile-birth and collision chain.
test('research: small Sniper displacement changes real narrow-cover contact without freezing delayed origin',()=>{
 for(const cls of ['railgun','prism','singularity']){
  const original=scenario(cls,0,12),later=scenario(cls,20,12);
  assert.equal(original.traces.length,later.traces.length);
  for(let j=0;j<original.traces.length;j++){
   const a=original.traces[j],b=later.traces[j];
   assert.equal(a.blocked,true,'the original narrow cover must physically intercept the rail');
   assert.equal(original.surviving[j],false,'original rail must stop at the wall');
   const delta=b.y-a.y;
   assert.ok(Math.abs(delta-20)<2||Math.abs(delta)<2,
    'shot origin must be either release-position or delayed-position, not arbitrary drift');
   assert.equal(later.surviving[j],!b.blocked,
    'the real Battlefield collision must agree with the actual delayed rail path');
  }
  console.log('SNIPER_SMALL_COVER_RESEARCH '+JSON.stringify({cls,original,later,
   limitation:'20u constructed displacement and narrow permanent wall; no natural movement, target HP or input-to-paint latency'}));
 }
});

// A real existing Scout hull beyond the same permanent wall makes the
// consequence observable as applied HP damage, not just a surviving bullet.
// This is still an intentionally controlled stationary-target geometry.
test('research: narrow-cover 20u Sniper displacement changes actual hostile HP contact',()=>{
 const original=scenario('railgun',0,12,true);
 const later=scenario('railgun',20,12,true);
 assert.equal(original.targetDamage,0,'the original blocked rail must not damage the target');
 const shifted=later.traces[0].y-original.traces[0].y;
 if(Math.abs(shifted-20)<2){
  assert.equal(later.traces[0].blocked,false);
  assert.ok(later.targetDamage>0,'a clear delayed rail must damage the real hostile hull');
 }else{
  assert.ok(Math.abs(shifted)<2,'future release-origin policy must preserve original aim provenance');
  assert.equal(later.targetDamage,0,'a corrected release-origin rail remains behind cover');
 }
 console.log('SNIPER_SMALL_COVER_HP_RESEARCH '+JSON.stringify({original,later,
  limitation:'stationary existing hostile, constructed 20u hull shift; no natural movement, browser input or player survival claim'}));
});

// A genuinely moving hull advances inside Game.update BEFORE the quick-shot
// intent is consumed. Unlike the constructed 20u shift above, this exercises
// a single 60Hz step with the real tankSpeed/moveTank owner and a narrow wall.
// Moving hull velocity also contributes 22% to projectile velocity in tryFire;
// this is a physical movement+trajectory test, NOT an isolated origin effect.
// It remains research-only: no browser event delivery or natural match rate.
test('research: one ordinary movement tick can change narrow-cover Sniper first contact',()=>{
 const still=scenario('railgun',8,12,true,false);
 const moving=scenario('railgun',8,12,true,true);
 const velocityOnly=scenario('railgun',8,12,true,true,true);
 const displacement=moving.playerY-still.playerY;
 assert.ok(Math.abs(velocityOnly.playerY-still.playerY)<1e-6,
  'the velocity-only counterfactual must retain the original firing hull position');
 assert.ok(Math.abs(velocityOnly.traces[0].dy-moving.traces[0].dy)<1e-6,
  'velocity-only and real-movement shots must inherit identical projectile bearing');
 assert.equal(velocityOnly.traces[0].blocked,true,
  'inherited hull velocity alone must not clear the wall at the original origin');
 assert.equal(velocityOnly.targetDamage,0,
  'inherited velocity alone must not damage the protected target');
 assert.ok(displacement>1.5&&displacement<3,
  'real 60Hz movement owner should advance a steady Railgun only a few units');
 assert.equal(still.traces[0].blocked,true,'release position must be behind narrow cover');
 assert.equal(still.targetDamage,0,'covered rail cannot damage target');
 const shotOriginShift=moving.traces[0].y-velocityOnly.traces[0].y;
 // Characterize current delayed-position firing without requiring it forever.
 // A future release-origin fix should pass with the covered/zero-HP branch.
 if(Math.abs(shotOriginShift-displacement)<.25){
  assert.equal(moving.traces[0].blocked,false,
   'current moving-origin rail must clear the deliberately selected wall edge');
  assert.ok(moving.targetDamage>0,'the physically clear rail must damage the target');
 }else{
  assert.ok(Math.abs(shotOriginShift)<.25,
   'the shot must originate at either the captured release position or moved hull');
  assert.equal(moving.traces[0].blocked,true,
   'release-origin rail must remain covered even when the hull moves afterward');
  assert.equal(moving.targetDamage,0,'covered release-origin rail must not damage target');
 }
 console.log('SNIPER_ONE_TICK_MOVEMENT_COVER '+JSON.stringify({still,velocityOnly,moving,displacement,shotOriginShift,
  limitation:'constructed 12u-high permanent wall and pre-existing steady velocity; real movement owner, but not a natural match or browser-trusted event'}));
});
