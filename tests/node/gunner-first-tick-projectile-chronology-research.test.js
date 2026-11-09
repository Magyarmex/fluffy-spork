'use strict';
/* #799: first-tick projectile chronology in the actual materialized 49-overlay
 * Game. A new shot is created in player input handling before the same tick's
 * bullet update. This source-executed witness tests first-step displacement
 * and TTL accounting, not natural-match hit probability or input latency. */
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function firstTick(seed,cls,reload,hz){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;
  try{
   g.sfx.muted=true;g.setClass(p,cls);
   p.x=0;p.y=0;p.vx=0;p.vy=0;p.angle=0;p.fireCd=0;
   p.stats.reload=reload;p.spawnShieldT=0;p.droneRespawnT=Infinity;
   g.tanks=[p];g.tankById=new Map([[p.id,p]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.shapeById)g.shapeById.clear();
   if(g.hash&&g.hash.clear)g.hash.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;
   g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   g.status='playing';g.paused=false;
   g.input.autofire=false;g.input.firing=true;
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   let born=null;
   const original=g.tryFire;
   g.tryFire=function(t){
    const before=this.bullets.length;
    const out=original.apply(this,arguments);
    if(t===p&&this.bullets.length>before){
     const b=this.bullets[before];
     born={ref:b,x:b.x,y:b.y,vx:b.vx,vy:b.vy,ttl:b.ttl};
    }
    return out;
   };
   const dt=1/hz;
   g.update(dt);
   assert.ok(born,'the legal player must fire a real projectile');
   assert.ok(g.bullets.includes(born.ref),'first projectile must survive one unobstructed tick');
   const b=born.ref;
   const distance=Math.hypot(b.x-born.x,b.y-born.y);
   const expected=Math.hypot(born.vx,born.vy)*dt;
   assert.ok(distance>0&&Number.isFinite(distance));
   assert.ok(Math.abs(distance-expected)<1e-3,
    'new projectile should move through the full same-tick dt in open space');
   assert.ok(Math.abs((born.ttl-b.ttl)-dt)<1e-6,
    'new projectile should consume a full same-tick TTL slice');
   return {seed,cls,reload,hz,dt,
    speed:+Math.hypot(born.vx,born.vy).toFixed(4),
    firstDisplacement:+distance.toFixed(6),
    firstTtlConsumed:+(born.ttl-b.ttl).toFixed(6)};
  }finally{g.destroy();}
 });
}

test('shipping first-tick projectile chronology scales with the simulation update slice',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm']){
  const reload=cls==='minigun'?1:3;
  for(const seed of [1517800,1517802]){
   const arms=[30,60,120].map(hz=>firstTick(seed,cls,reload,hz));
   const speed=arms[0].speed;
   for(const a of arms)assert.ok(Math.abs(a.speed-speed)<1e-3,
    'same first shot must have the same launch speed across update rates');
   assert.ok(arms[0].firstDisplacement>arms[1].firstDisplacement);
   assert.ok(arms[1].firstDisplacement>arms[2].firstDisplacement);
   rows.push(...arms);
  }
 }
 assert.equal(rows.length,12);
 console.log('GUNNER_FIRST_TICK_PROJECTILE_CHRONOLOGY '+JSON.stringify(rows));
});
