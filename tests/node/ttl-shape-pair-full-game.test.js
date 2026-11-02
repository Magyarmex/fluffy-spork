'use strict';
// Run 534: real materialized Game + every shipping overlay, not a test Game.
// The separate, narrower Battlefield/Performance regression exercises vetoes.
const test=require('node:test');
const assert=require('node:assert/strict');
const old=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(old===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=old;
function run(hz,far){
 return withSeed(1517802,()=>{
  const g=bootGame();if(!g.player)g.redeploy();g.sfx.muted=true;
  const p=g.player;p.x=1000;p.y=1000;p.alive=true;p.hp=1000;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  const circles=g.shapes.filter(s=>s.type==='circle').slice(0,2);
  assert.equal(circles.length,2,'real game must contain canonical Circles');
  g.time=1;g.__novaShapeSweepEpoch=123;g.__novaShapeSweepActive=true;
  circles.forEach((s,i)=>{
   s.x=i?(far?64:43):18;s.y=0;s.r=12;s.hp=100;
   s.__novaShapeSweepEpoch=123;
   s.__novaShapeSweepPrevX=s.x;s.__novaShapeSweepPrevY=s.y;
   s.born=0;s.vx=0;s.vy=0;
  });
  g.shapes=circles;g.drones=[];g.__novaTerrain=[];
  const hits=[],oldDamage=g.damageShape;
  g.damageShape=function(s){hits.push(s.id);return oldDamage.apply(this,arguments);};
  g.bullets=[{kind:'bullet',id:999,ownerId:p.id,x:0,y:0,
   vx:36*hz,vy:0,r:3,dmg:20,ttl:1/(hz*1.2),pen:1,hits:0,
   dead:false,shell:false,beam:false,color:'#fff'}];
  g.updateBullets(1/hz);
  return {hits,hp:Array.from(circles,s=>s.hp),bulletCount:g.bullets.length};
 });
}
for(const hz of [30,60,120,240]){
 test('49-overlay real game preserves two certified pre-TTL Circle contacts at '+hz+'Hz',()=>{
  const r=run(hz,false);
  assert.equal(r.hits.length,2,'both distinct Circles must be damaged');
  assert.deepEqual(r.hp,[80,80]);
  assert.equal(r.bulletCount,0,'expired projectile must be removed');
 });
 test('49-overlay real game does not hit a Circle beyond physical TTL at '+hz+'Hz',()=>{
  const r=run(hz,true);
  assert.equal(r.hits.length,1);
  assert.deepEqual(r.hp,[80,100]);
  assert.equal(r.bulletCount,0);
 });
}
