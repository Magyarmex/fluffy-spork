'use strict';
/* #799: source-executed 49-overlay input/aim witness.
 * Does the shipping current-position assist erase a deliberate small
 * manual lead? This isolates aim input before testing any balance change.
 * The target is stationary during this single tick; velocity is used only
 * to calculate a physically plausible intercept bearing. */
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function sample(seed,cls,hz,leadAngle){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const p=g.player,t=g.tanks.find(x=>x!==p);
   assert.ok(t);
   g.sfx.muted=true;g.setClass(p,cls);
   p.x=0;p.y=0;p.vx=0;p.vy=0;p.angle=0;
   p.spawnShieldT=0;p.droneRespawnT=Infinity;
   Object.assign(t,{cls:'scout',isPlayer:true,alive:true,
    x:200,y:0,vx:0,vy:60,spawnShieldT:0,shieldT:0,
    cloakT:0,tauntT:0,bulwarkT:0});
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
   g.tanks=[p,t];g.tankById=new Map([[p.id,p],[t.id,t]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash&&g.hash.clear)g.hash.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;
   g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   g.status='playing';g.paused=false;
   g.input.autofire=false;g.input.firing=false;
   g.input.aim.active=true;
   g.input.aim.dx=40*Math.cos(leadAngle);
   g.input.aim.dy=40*Math.sin(leadAngle);
   let eligible=0;
   const nearest=g.nearestTank;
   g.nearestTank=function(x,y,r,exclude){
    const result=nearest.apply(this,arguments);
    if(exclude===p.id&&r===480&&x===p.x&&y===p.y&&result===t)eligible++;
    return result;
   };
   g.update(1/hz);
   assert.equal(nearest.call(g,p.x,p.y,480,p.id),t,
    'public viewport must authorize the target independently of aim-cone selection');
   return {seed,cls,hz,requested:leadAngle,actual:p.angle,eligible};
  }finally{g.destroy();}
 });
}

test('current-position touch assist suppresses small manual lead but not outside-cone input',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm'])
  for(const seed of [1517800,1517802])
   for(const hz of [30,60,120]){
    const speed=cls==='minigun'?480:690;
    const muzzle=cls==='minigun'?34:41;
    const targetLateralSpeed=60;
    const time=(200-muzzle)/Math.sqrt(speed*speed-targetLateralSpeed*targetLateralSpeed);
    const lead=Math.atan2(targetLateralSpeed*time,200-muzzle);
    assert.ok(lead>0&&lead<.22,'physical lead should lie inside assist cone');
    const inside=sample(seed,cls,hz,lead);
    const outside=sample(seed,cls,hz,.30);
    assert.ok(Math.abs(inside.actual)<1e-5,
     'small deliberate lead is snapped to current target bearing');
    assert.ok(outside.actual>0.01,
     'input outside assist cone should still rotate toward requested bearing');
    rows.push({cls,seed,hz,leadDeg:+(lead*180/Math.PI).toFixed(3),
     snappedAngle:+inside.actual.toFixed(6),
     outsideAngle:+outside.actual.toFixed(6)});
   }
 assert.equal(rows.length,12);
 console.log('GUNNER_MANUAL_LEAD_SNAP_RESEARCH '+JSON.stringify(rows));
});

test('assist cone boundary causes a discontinuous aim response to tiny stick changes',()=>{
 const rows=[];
 for(const seed of [1517800,1517802])
  for(const hz of [30,60,120]){
   const inside=sample(seed,'minigun',hz,.219);
   const outside=sample(seed,'minigun',hz,.221);
   const jump=outside.actual-inside.actual;
   assert.ok(Math.abs(inside.actual)<1e-5);
   assert.ok(jump>.02,
    '0.002rad extra requested aim must not be mistaken for a smooth response');
   rows.push({seed,hz,inside:+inside.actual.toFixed(6),
    outside:+outside.actual.toFixed(6),jump:+jump.toFixed(6)});
  }
 assert.equal(rows.length,6);
 console.log('AIM_ASSIST_CONE_DISCONTINUITY_RESEARCH '+JSON.stringify(rows));
});
