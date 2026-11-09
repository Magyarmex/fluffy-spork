'use strict';
/* #799: composed 49-overlay moving-target damage research.
 * Unlike nominal shot damage, this measures canonical HP changes against a
 * high-HP Scout target in open terrain, held stationary or scripted along a
 * lateral sinusoid. A manual-aim control suppresses only the player nearestTank
 * assist query to separate target motion from shipping touch aim assistance.
 * It is NOT natural-match DPS: the target does not choose
 * evasive tactics, shoot, or use cover; motion is externally prescribed. */
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function activeAt(tick,mode){
 if(mode==='held')return true;
 const on=mode==='long'?120:48,off=mode==='long'?30:48;
 return tick%(on+off)<on;
}
function trial(seed,cls,reload,hz,mode,targetX=200,motion='stationary',assist='shipping'){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.setClass(p,cls);
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'real composed game must provide a target tank');
  p.x=0;p.y=0;p.vx=0;p.vy=0;p.angle=0;
  p.droneRespawnT=Infinity;p.spawnShieldT=0;
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:targetX,y:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
   gene:null,perk:null,
   spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;
  p.stats.reload=reload;
  g.input.autofire=false;g.input.aim.active=true;
  g.input.aim.dx=40;g.input.aim.dy=0;
  // Observe the exact shipping Fair Engagement eligibility before optionally
  // suppressing the player-only assist result. Other nearestTank callers and
  // the original visibility/hostility/terrain checks are never replaced.
  let assistQueries=0,assistEligible=0;
  const nearest=g.nearestTank;
  g.nearestTank=function(x,y,radius,except){
   const result=nearest.apply(this,arguments);
   if(except===p.id&&radius===480&&x===p.x&&y===p.y){
    assistQueries++;
    if(result===target)assistEligible++;
    if(assist==='manual')return null;
   }
   return result;
  };
  let volleys=0,hits=0,damage=0,activeTicks=0,aimErrorSum=0;
  const fire=g.tryFire,originalDamage=g.damageTank;
  g.tryFire=function(t){
   const before=this.bullets.length,out=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return out;
  };
  g.damageTank=function(t){
   const before=t.hp;
   const result=originalDamage.apply(this,arguments);
   if(t===target&&t.hp<before){
    hits++;damage+=before-t.hp;
   }
   return result;
  };
  try{
   for(let i=0;i<8*hz;i++){
    const targetY=motion==='crossing'?36*Math.sin(Math.PI*2*i/(2*hz)):0;
    target.y=targetY;
    const active=activeAt(i*(120/hz),mode);
    g.input.firing=active;
    activeTicks+=+active;
    g.update(1/hz);
    const targetBearing=Math.atan2(targetY,targetX);
    aimErrorSum+=Math.abs(Math.atan2(Math.sin(p.angle-targetBearing),
     Math.cos(p.angle-targetBearing)));
    // The experiment controls target motion; real bullet physics/damage
    // remain active. Restore its location after each complete game step.
    target.x=targetX;target.y=targetY;target.vx=0;target.vy=0;
    assert.equal(g.tanks.length,2);
    assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0);
   }
   assert.ok(Number.isFinite(damage)&&damage>=0);
   return {seed,cls,reload,hz,mode,motion,assist,assistQueries,assistEligible,activeSeconds:activeTicks/hz,
    volleys,hits,damage:+damage.toFixed(4),
    meanAimErrorRad:+(aimErrorSum/(8*hz)).toFixed(5),
    spin:+(p.fireSpin||0).toFixed(5),
    heat:+(p.__v17Heat||0).toFixed(5)};
  }finally{g.destroy();}
 });
}
test('moving lateral target exposes hit and damage sensitivity under matched wall-time bursts',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm']){
  const reload=cls==='minigun'?1:3;
  for(const mode of ['held','short'])
   for(const hz of [30,60,120])
    for(const seed of [1517800,1517802]){
     const stationary=trial(seed,cls,reload,hz,mode,200,'stationary');
     const crossing=trial(seed,cls,reload,hz,mode,200,'crossing');
     const manual=trial(seed,cls,reload,hz,mode,200,'crossing','manual');
     assert.equal(crossing.activeSeconds,stationary.activeSeconds,
      'matched input duty must not depend on target motion');
     assert.equal(crossing.volleys,stationary.volleys,
      'target movement must not alter firing chronology');
     assert.equal(manual.activeSeconds,crossing.activeSeconds);
     assert.ok(crossing.assistQueries>0&&crossing.assistEligible>0,
      'the shipping arm must actually find the visible hostile moving target');
     assert.equal(manual.assistQueries,crossing.assistQueries);
     assert.equal(manual.assistEligible,crossing.assistEligible,
      'the manual arm must retain the same shipping eligibility witness');
     assert.equal(manual.volleys,crossing.volleys,
      'manual aim counterfactual must preserve the same firing cadence');
     assert.ok(crossing.hits>=0&&crossing.damage>=0);
     assert.ok(manual.hits>=0&&manual.damage>=0);
     assert.ok(crossing.damage<=1000000);
     assert.ok(stationary.hits>0&&stationary.damage>0,
      'stationary positive control must take real projectile damage');
     rows.push({cls,reload,mode,hz,seed,
      stationary:{hits:stationary.hits,damage:stationary.damage,volleys:stationary.volleys,aimError:stationary.meanAimErrorRad},
      crossing:{hits:crossing.hits,damage:crossing.damage,volleys:crossing.volleys,aimError:crossing.meanAimErrorRad,assistEligible:crossing.assistEligible},
      manual:{hits:manual.hits,damage:manual.damage,volleys:manual.volleys,aimError:manual.meanAimErrorRad,assistEligible:manual.assistEligible}});
    }
 }
 assert.equal(rows.length,24);
 console.log('GUNNER_MOVING_TARGET_DAMAGE_RESEARCH '+JSON.stringify(rows));
});
