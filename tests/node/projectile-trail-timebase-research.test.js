'use strict';
// Research-only composed-game census: quantify projectile VFX per live bullet-second.
// This is NOT a proposed production change or a gameplay-balance assertion.
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function trial(seed,hz){
 return withSeed(seed,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  assert.ok(g.player&&g.player.alive,'canonical player required');
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(g.player,'tempest');
  g.input.aim.active=true;g.input.aim.dx=40;
  g.input.firing=true;g.input.autofire=false;
  const oldUpdate=g.updateBullets,oldParticles=g.addParticles;
  let inBullets=false,bulletSeconds=0,bulletUpdates=0;
  let visualCalls=0,visualParticles=0;
  g.addParticles=function(_x,_y,_color,n){
   if(inBullets){visualCalls++;visualParticles+=Number(n)||0;}
   return oldParticles.apply(this,arguments);
  };
  g.updateBullets=function(dt){
   bulletSeconds+=this.bullets.filter(b=>b&&!b.dead).length*dt;
   bulletUpdates++;
   inBullets=true;
   try{return oldUpdate.apply(this,arguments);}
   finally{inBullets=false;}
  };
  try{
   // Short enough to avoid relying on player survival, but exercises real
   // weapon creation, projectile updates, and shipping visual ownership.
   for(let i=0;i<hz*2;i++)g.update(1/hz);
   assert.ok(bulletUpdates>0&&bulletSeconds>0,
    'trial must actually advance live projectiles');
   assert.ok(visualCalls>0,'trial must exercise projectile VFX');
   return {seed,hz,bulletUpdates,bulletSeconds,visualCalls,visualParticles,
    callsPerBulletSecond:visualCalls/bulletSeconds,
    particlesPerBulletSecond:visualParticles/bulletSeconds};
  }finally{g.destroy();}
 });
}

test('research: composed Tempest projectile VFX timebase at 30/60Hz',()=>{
 const observations=[];
 for(const seed of [1517800,1517802,1517804])
  for(const hz of [30,60])observations.push(trial(seed,hz));
 for(const row of observations){
  assert.ok(Number.isFinite(row.callsPerBulletSecond));
  assert.ok(Number.isFinite(row.particlesPerBulletSecond));
 }
 const byHz=hz=>observations.filter(x=>x.hz===hz);
 const mean=(rows,key)=>rows.reduce((n,x)=>n+x[key],0)/rows.length;
 const rate30=mean(byHz(30),'callsPerBulletSecond');
 const rate60=mean(byHz(60),'callsPerBulletSecond');
 console.log('NOVA_PROJECTILE_TRAIL_TIMEBASE '+JSON.stringify({
  rate30,rate60,ratio60to30:rate60/rate30,observations,
  caveat:'Independently evolving seeded combat, not paired deterministic replay; includes all addParticles calls inside updateBullets, not only ordinary trails.'
 }));
 assert.ok(rate30>0&&rate60>0);
});
