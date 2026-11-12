'use strict';
/* #799 research: moving-target counterfactual to the stationary target fixture.
 * Target motion is externally prescribed and identical at every wall-clock
 * timestamp; real Game projectile collision and damage remain authoritative.
 * This is not an AI match, not production balance, and not an FPS golden.
 * Compare against the separate stationary-target experiment. */
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
function trial(seed,cls,reload,mode,offset,amplitude){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.setClass(p,cls);
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'shipping Game must supply a target');
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
  // A seeded camera may start far from the fixture; normalize public visibility.
  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:200,y:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
   gene:null,perk:null,spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
  // Keep the exact manual eastward stick bearing in both counterfactual arms.
  // Shipping nearest-target assist otherwise tracks the oscillating Scout
  // (within its 0.22-rad cone), hiding the intended movement/miss effect.
  let aimAssistVetoes=0;
  const nearest=g.nearestTank;
  g.nearestTank=function(x,y,radius,except){
   if(except===p.id&&radius===480&&x===p.x&&y===p.y){
    aimAssistVetoes++;return null;
   }
   return nearest.apply(this,arguments);
  };
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
  let volleys=0,hits=0,damage=0,firstBirths=[],firstHits=[];
  const originalFire=g.tryFire,originalDamage=g.damageTank;
  g.tryFire=function(t){
   const n=this.bullets.length,result=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>n){
    volleys++;
    if(firstBirths.length<5){
     const b=this.bullets[this.bullets.length-1];
     firstBirths.push({time:+this.time.toFixed(6),targetY:+target.y.toFixed(4),
      x:+b.x.toFixed(4),y:+b.y.toFixed(4)});
    }
   }
   return result;
  };
  g.damageTank=function(t){
   const before=t.hp,result=originalDamage.apply(this,arguments);
   if(t===target&&t.hp<before){
    assert.equal(arguments[2],p.id,'damage must be player-owned');
    hits++;damage+=before-t.hp;
    if(firstHits.length<5)firstHits.push({time:+this.time.toFixed(6),
     targetY:+target.y.toFixed(4),applied:+(before-t.hp).toFixed(4)});
   }
   return result;
  };
  let now=0,updates=0,onTime=0,edges=0,travel=0,peakOffset=0,previousY=0;
  let targetMoveSteps=0,expectedNextY=0;
  const bulletStep=g.updateBullets;
  g.updateBullets=function(dt){
   // Integrate the scripted, bounded target displacement through the REAL
   // Battlefield moveTank owner immediately before physical bullet collision.
   // This preserves swept-body metadata instead of teleporting after combat.
   const dy=expectedNextY-target.y;
   target.vx=0;target.vy=dy/dt;
   this.moveTank(target,0,dy/dt,dt);
   targetMoveSteps++;
   return bulletStep.apply(this,arguments);
  };
  const initialTime=g.time;
  try{
   for(const frame of frames(mode)){
    const end=now+frame;
    while(now<end-EPS){
     // Every mode samples the same .5s-on/.3s-off edges, offset by a controlled phase
     // from frame zero so input events actually split presentation frames.
     const cycle=Math.floor((now+offset+EPS)/.8);
     const phase=now+offset-cycle*.8;
     const firing=phase<.5-EPS;
     const boundary=cycle*.8+(firing?.5:.8)-offset;
     const next=Math.min(end,boundary);
     const dt=next-now;
     assert.ok(dt>EPS,'input-event split must progress');
     // Normalize the physical target at the exact beginning of each step.
     // This keeps initial geometry tied to world time, not prior AI drift.
     target.x=200;target.y=amplitude*Math.sin(2*Math.PI*now/1.6);
     target.vx=0;target.vy=0;
     expectedNextY=amplitude*Math.sin(2*Math.PI*next/1.6);
     g.input.firing=firing;
     if(firing)onTime+=dt;
     g.update(dt);updates++;
     // The real moveTank/Battlefield owner must arrive at the same scripted
     // endpoint; no after-collision teleport or silent geometry correction.
     const y=expectedNextY;
     assert.ok(Math.abs(target.y-y)<1e-4,
      'real moving-body integration diverged from prescribed world-time path');
     travel+=Math.abs(y-previousY);
     previousY=y;
     peakOffset=Math.max(peakOffset,Math.abs(y));
     now=next;
     if(next<end-EPS)edges++;
    }
   }
   assert.ok(Math.abs(now-SECONDS)<1e-7,'same wall time');
   assert.ok(Math.abs(g.time-initialTime-SECONDS)<1e-6,'same simulated time');
   assert.ok(Math.abs(onTime-3.9)<1e-7,'same exact fire duty');
   assert.equal(g.tanks.length,2,'no extra tanks');
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'no ecology contamination');
   assert.equal(targetMoveSteps,updates,'each Game update must integrate one real target movement');
   assert.ok(aimAssistVetoes>0,'manual-aim assist veto must execute in composed Game');
   assert.ok(volleys>0&&hits>0&&damage>0,'real projectile damage required');
   assert.ok(hits<=volleys,'ordinary single-target rotary shots');
   assert.ok(Number.isFinite(damage)&&damage<=1000000);
   return {seed,cls,reload,mode,offset,amplitude,updates,edges,volleys,hits,
    targetMoveSteps,
    aimAssistVetoes,
    travel:+travel.toFixed(4),peakOffset:+peakOffset.toFixed(4),
    damage:+damage.toFixed(4),onTime:+onTime.toFixed(5),firstBirths,firstHits,
    heat:+(p.__v17Heat||0).toFixed(5),spin:+(p.fireSpin||0).toFixed(5)};
  }finally{g.destroy();}
 });
}
test('matched moving-target chronology measures real rotary damage under irregular frames',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const seed of [1517800,1517802]){
   for(const offset of [.007,.012])
    for(const mode of ['native60','cluster30','alternating40_120']){
     const row=trial(seed,cls,reload,mode,offset,26);
     const repeat=trial(seed,cls,reload,mode,offset,26);
     assert.deepEqual(row,repeat,'seeded composed simulation must reproduce');
     assert.ok(row.peakOffset>25.9&&row.travel>50,'target must actually traverse the projectile corridor');
     const stationary=trial(seed,cls,reload,mode,offset,0);
     assert.equal(stationary.peakOffset,0,'stationary control cannot move');
     assert.equal(stationary.travel,0,'stationary control cannot drift');
     assert.equal(stationary.onTime,row.onTime,'matched physical input duty');
     rows.push({...row,stationaryDamage:stationary.damage,
      stationaryHits:stationary.hits,
      damageDelta:+(row.damage-stationary.damage).toFixed(4)});
    }
  }
 }
 assert.equal(rows.length,24);
 for(const row of rows)assert.equal(row.onTime,3.9);
 assert.ok(rows.some(row=>row.damageDelta!==0),
  'moving-target arm must change at least one real HP outcome versus stationary control');
 console.log('GUNNER_MOVING_TARGET_REAL_DAMAGE '+JSON.stringify(rows));
});
