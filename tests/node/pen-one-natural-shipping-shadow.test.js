'use strict';
// Research-only: census wraps the actual materialized Game + shipping overlays.
const test=require('node:test');
const assert=require('node:assert/strict');
const prior=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(prior===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prior;
const audit=require('../browser/projectile-density-audit.js');

for(const hz of [30,60,120,240]){
 test('real materialized Game pen=1 expiring shot census at '+hz+'Hz',()=>{
  withSeed(1517802,()=>{
   const g=bootGame();if(!g.player)g.redeploy();
   g.sfx.muted=true;const p=g.player;
   p.x=1000;p.y=1000;p.hp=1000;p.alive=true;
   g.tanks=[p];g.tankById=new Map([[p.id,p]]);
   g.shapes=[];g.drones=[];g.__novaTerrain=[];
   g.time=1;g.__novaShapeSweepEpoch=9;g.__novaShapeSweepActive=true;
   g.__novaFrameStartBulletEpoch=9;
   g.__novaFrameStartBulletIdCeiling=1000;
   g.bullets=[{kind:'bullet',id:999,ownerId:p.id,x:0,y:0,
    vx:600,vy:0,r:3,dmg:20,ttl:1/(hz*1.2),pen:1,hits:0,
    dead:false,shell:false,beam:false,color:'#fff'}];
   const original=JSON.stringify(g.bullets);
   const counters=audit.install(g,audit.create());
   g.updateBullets(1/hz);
   assert.equal(counters.bulletUpdateCalls,1);
   assert.equal(counters.penOneRawInputs,1);
   assert.equal(counters.penOneRawExpiringInputs,1);
   assert.equal(counters.penOneShotInputs,1);
   assert.equal(counters.penOneExpiringInputs,1);
   assert.equal(counters.penOneFramesWithInputs,1);
   assert.equal(counters.penOneScanCensoredFrames,0);
   assert.equal(counters.penOneMissingOrdinaryFlagsInputs,0);
   assert.equal(JSON.parse(original)[0].pen,1);
  });
 });
}

test('real composed Game observer does not change ordinary projectile damage or removal',()=>{
 function arm(observe){
  return withSeed(1517802,()=>{
   const g=bootGame();if(!g.player)g.redeploy();g.sfx.muted=true;
   const p=g.player;p.x=1000;p.y=1000;p.hp=1000;p.alive=true;
   g.tanks=[p];g.tankById=new Map([[p.id,p]]);
   const target=g.shapes.find(s=>s.type==='circle');
   assert.ok(target);
   target.x=18;target.y=0;target.r=12;target.hp=100;
   target.__novaShapeSweepEpoch=7;
   target.__novaShapeSweepPrevX=18;target.__novaShapeSweepPrevY=0;
   target.born=0;target.vx=0;target.vy=0;
   g.shapes=[target];g.drones=[];g.__novaTerrain=[];
   g.time=1;g.__novaShapeSweepEpoch=7;g.__novaShapeSweepActive=true;
   g.__novaFrameStartBulletEpoch=7;g.__novaFrameStartBulletIdCeiling=1000;
   g.bullets=[{kind:'bullet',id:999,ownerId:p.id,x:0,y:0,
    vx:1080,vy:0,r:3,dmg:20,ttl:1/36,pen:1,hits:0,
    dead:false,shell:false,beam:false,color:'#fff'}];
   const counters=observe?audit.install(g,audit.create()):null;
   g.updateBullets(1/30);
   return {hp:target.hp,remaining:g.bullets.length,
    counted:counters?.penOneShotInputs??null};
  });
 }
 const baseline=arm(false),observed=arm(true);
 assert.deepEqual({hp:observed.hp,remaining:observed.remaining},
  {hp:baseline.hp,remaining:baseline.remaining});
 assert.equal(observed.counted,1);
});
