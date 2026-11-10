'use strict';
/* #799 research: compare actual player-owned rotary projectile damage under
 * identical wall-clock fire edges but different irregular presentation steps.
 * This is a characterization test, NOT a new balance golden or scheduler.
 * No production code changes; retain the numerical evidence in CI output. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const EPS=1e-9;
const SECONDS=6;
function frames(mode){
 if(mode==='native60')return Array.from({length:360},()=>1/60);
 if(mode==='cluster30')return Array.from({length:180},()=>1/30);
 if(mode==='alternating40_120')return Array.from({length:180},()=>[1/40,1/120]).flat();
 throw Error('unknown presentation mode');
}
function trial(seed,cls,reload,mode){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.setClass(p,cls);
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'shipping Game must supply a target');
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
  // A seeded camera may start far from the fixture; normalize public visibility.\n  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;\n  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:200,y:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
   gene:null,perk:null,spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;p.stats.reload=reload;
  g.input.autofire=false;g.input.mouseActive=false;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  g.input.moveVec=()=>({x:0,y:0});
  let volleys=0,hits=0,damage=0,firstBirths=[];
  const originalFire=g.tryFire,originalDamage=g.damageTank;
  g.tryFire=function(t){
   const n=this.bullets.length,result=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>n){
    volleys++;
    if(firstBirths.length<5)firstBirths.push(+this.time.toFixed(6));
   }
   return result;
  };
  g.damageTank=function(t){
   const before=t.hp,result=originalDamage.apply(this,arguments);
   if(t===target&&t.hp<before){\n    assert.equal(arguments[2],p.id,'damage must be player-owned');\n    hits++;damage+=before-t.hp;\n   }
   return result;
  };
  let now=0,updates=0,onTime=0,edges=0;
  const initialTime=g.time;
  try{
   for(const frame of frames(mode)){
    const end=now+frame;
    while(now<end-EPS){
     // Every mode samples the same exact fire input edges: .5s on, .3s off.
     const cycle=Math.floor((now+EPS)/.8);
     const phase=now-cycle*.8;
     const firing=phase<.5-EPS;
     const boundary=cycle*.8+(firing?.5:.8);
     const next=Math.min(end,boundary);
     const dt=next-now;
     assert.ok(dt>EPS,'input-event split must progress');
     g.input.firing=firing;
     if(firing)onTime+=dt;
     g.update(dt);updates++;
     // Control target motion only; real bullets, collisions and damage remain.
     target.x=200;target.y=0;target.vx=0;target.vy=0;
     now=next;
     if(next<end-EPS)edges++;
    }
   }
   assert.ok(Math.abs(now-SECONDS)<1e-7,'same wall time');
   assert.ok(Math.abs(g.time-initialTime-SECONDS)<1e-6,'same simulated time');
   assert.ok(Math.abs(onTime-3.9)<1e-7,'same exact fire duty');
   assert.equal(g.tanks.length,2,'no extra tanks');
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'no ecology contamination');
   assert.ok(volleys>0&&hits>0&&damage>0,'real projectile damage required');
   assert.ok(hits<=volleys,'ordinary single-target rotary shots');
   assert.ok(Number.isFinite(damage)&&damage<=1000000);
   return {seed,cls,reload,mode,updates,edges,volleys,hits,
    damage:+damage.toFixed(4),onTime:+onTime.toFixed(5),firstBirths,
    heat:+(p.__v17Heat||0).toFixed(5),spin:+(p.fireSpin||0).toFixed(5)};
  }finally{g.destroy();}
 });
}
test('irregular presentation frames preserve input duty but expose actual Gunner damage',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const seed of [1517800,1517802]){
   for(const mode of ['native60','cluster30','alternating40_120']){
    const row=trial(seed,cls,reload,mode);
    const repeat=trial(seed,cls,reload,mode);
    assert.deepEqual(row,repeat,'seeded composed simulation must reproduce');
    rows.push(row);
   }
  }
 }
 assert.equal(rows.length,12);
 for(const row of rows)assert.equal(row.onTime,3.9);
 console.log('GUNNER_IRREGULAR_REAL_DAMAGE '+JSON.stringify(rows));
});
