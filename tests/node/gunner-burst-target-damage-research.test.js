'use strict';
/* #799: composed 49-overlay moving-projectile / actual damageTank control.
 * Unlike nominal shot damage, this measures canonical HP changes against a
 * deliberately stationary, high-HP Scout target in open terrain. It is NOT
 * natural-match DPS: the target does not evade, shoot, or use cover. */
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
function trial(seed,cls,reload,hz,mode,targetX=200){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.setClass(p,cls);
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'real composed game must provide a target tank');
  p.x=0;p.y=0;p.vx=0;p.vy=0;p.angle=0;
  p.droneRespawnT=Infinity;p.spawnShieldT=0;
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:targetX,y:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
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
  let volleys=0,hits=0,damage=0,activeTicks=0;
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
    const active=activeAt(i*(120/hz),mode);
    g.input.firing=active;
    activeTicks+=+active;
    g.update(1/hz);
    // The experiment controls target motion; real bullet physics/damage
    // remain active. Restore its location after each complete game step.
    target.x=targetX;target.y=0;target.vx=0;target.vy=0;
    assert.equal(g.tanks.length,2);
    assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0);
   }
   assert.ok(Number.isFinite(damage)&&damage>=0);
   return {seed,cls,reload,hz,mode,activeSeconds:activeTicks/hz,
    volleys,hits,damage:+damage.toFixed(4),
    spin:+(p.fireSpin||0).toFixed(5),
    heat:+(p.__v17Heat||0).toFixed(5)};
  }finally{g.destroy();}
 });
}
test('real composed target-damage census for legal rotary upgrades under timed bursts',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm']){
  const reload=cls==='minigun'?1:3;
  for(const mode of ['held','long','short'])
   for(const hz of [30,60,120])
    for(const seed of [1517800,1517802]){
     const row=trial(seed,cls,reload,hz,mode);
     assert.ok(row.volleys>0);
     assert.ok(row.hits<=row.volleys,
      'one-target ordinary rotary shots cannot hit more often than volleys');
     rows.push(row);
    }
 }
 assert.equal(rows.length,36);
 console.log('GUNNER_BURST_TARGET_DAMAGE '+JSON.stringify(rows));
});
test('distant stationary target cannot be hit beyond physical bullet lifetime',()=>{
 for(const cls of ['minigun','needlestorm'])
  for(const hz of [30,60,120]){
   const row=trial(1517800,cls,cls==='minigun'?1:3,hz,'held',1200);
   assert.equal(row.hits,0,'no impossible long-range contact');
   assert.equal(row.damage,0);
  }
});
