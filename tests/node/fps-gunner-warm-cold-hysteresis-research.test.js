'use strict';
/* #799 research-only: the legal rotary spin-up cliff may depend on the
 * firing history before a refresh-rate transition. Execute the actual
 * composed Game, not an independent cooldown approximation. Counts are
 * observations, not desired balance goldens or device FPS evidence. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function trial(seed,cls,reload,rates){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.setClass(p,cls);
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  p.droneRespawnT=Infinity;
  g.status='playing';g.paused=false;p.stats.reload=reload;
  g.input.autofire=false;g.input.aim.active=true;
  g.input.aim.dx=40;g.input.aim.dy=0;g.input.firing=true;
  let volleys=0;
  const original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return result;
  };
  try{
   const stages=[];
   for(const hz of rates){
    assert.ok(Number.isInteger(hz)&&hz>=30&&hz<=120);
    const before=volleys;
    for(let i=0;i<4*hz;i++){
     g.update(1/hz);
     assert.equal(g.tanks.length,1,'AI tank contamination');
     assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,
      'neutral or escort contamination');
    }
    stages.push({hz,volleys:volleys-before,spin:+(p.fireSpin||0).toFixed(6),
     cooldown:+p.fireCd.toFixed(6),heat:+(p.__v17Heat||0).toFixed(6)});
   }
   assert.ok(Math.abs(g.time-4*rates.length)<1e-5,'same total simulation time');
   assert.equal(volleys,stages.reduce((n,s)=>n+s.volleys,0));
   return {cls,reload,rates,stages,totalVolleys:volleys};
  }finally{g.destroy();}
 });
}

test('Gunner 60/61, 30/60 and low-FPS transitions reveal warm/cold spin history in real Game',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const rates of [[60,61],[61,60],[60,30],[30,60],[60,60],[61,61],
   [36,37],[37,36],[35,36],[36,35]]){
   const a=trial(1517800,cls,reload,rates);
   const b=trial(1517802,cls,reload,rates);
   assert.deepEqual(a,b,'no-target transition must be seed independent');
   assert.ok(a.stages.every(s=>s.volleys>0),'each stage must fire');
   rows.push(a);
  }
 }
 assert.equal(rows.length,20);
 console.log('GUNNER_WARM_COLD_FPS_HYSTERESIS '+JSON.stringify(rows));
});
