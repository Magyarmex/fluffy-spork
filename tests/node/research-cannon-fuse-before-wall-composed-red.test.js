'use strict';
// Full 49-overlay regression for the existing Battlefield fuse-first guard.
// Earlier research #270 was red on its historical branch, but current main
// already certifies isolated Cannon fuse crossings before later terrain.
// Preserve the real Game.update order and both wall-first/fuse-first controls.
const test=require('node:test');
const assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function trial({hz,startX,wallX,vx,wall}){
 return withSeed(270827,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  const p=g.player;
  p.x=900;p.y=900;p.vx=0;p.vy=0;p.alive=true;
  p.droneRespawnT=999;p.spawnShieldT=0;
  g.status='playing';g.sfx.muted=true;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.orbs=[];g.aiRespawns=[];
  g.hash.clear();g.hash.insert(p);
  g.shapeTimer=999;g.powerupTimer=999;g.eliteTimer=999;
  g.input.firing=false;g.input.autofire=false;
  g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
  g.__novaTerrain=wall?[{id:-9501,shape:'rect',x:wallX,y:0,
   w:20,h:80,solid:true,destructible:false}]:[];
  const b={kind:'bullet',id:777,ownerId:p.id,x:startX,y:0,
   vx,vy:0,r:8.5,dmg:26,baseDmg:26,ttl:2,shell:true,pen:1,hits:0,
   dead:false,hp:1,maxHp:1,__v17Cannon:true,__v17FuseDist:150,
   __v17SpawnX:0,__v17SpawnY:0,__v17FuseArmed:false,
   splash:72,splashDmg:.4,color:'#ffb45e'};
  g.bullets=[b];g.nextId=Math.max(g.nextId||0,1200);
  const preWall=wall?g.firstTerrainHit(startX,0,startX+vx/hz,0,b.r*.45):null;
  const bursts=[],orig=g.clusterBurst.bind(g);
  g.clusterBurst=function(shell){if(shell===b)bursts.push({x:shell.x,y:shell.y});return orig(shell);};
  for(let i=0;i<3&&bursts.length===0;i++)g.update(1/hz);
  return {bursts,bullet:b,preWall};
 });
}
const cases=[
 {hz:30,startX:146,wallX:168,vx:380},
 {hz:60,startX:147.9,wallX:168,vx:380},
 {hz:120,startX:147.9,wallX:164.625,vx:380},
 {hz:240,startX:147.9,wallX:164.625,vx:380*(1+.085*8)*1.35}
];
for(const scenario of cases){
 test('full 49-overlay Cannon fuse before later wall '+scenario.hz+'Hz',()=>{
  const {bursts,preWall}=trial({...scenario,wall:true});
  assert.ok(preWall&&preWall.hit&&preWall.hit.t>0,
   'the later wall must physically intersect the current frame');
  assert.ok(preWall.hit.t/scenario.hz>(150-scenario.startX)/scenario.vx+1e-7,
   'the wall must be later than the physical fuse crossing');
  assert.equal(bursts.length,1,'one shell burst');
  assert.ok(bursts[0].x>=148-1e-6&&bursts[0].x<=150+1e-6,
   'physical fuse must beat later wall; actual x='+bursts[0].x);
 });
 test('full 49-overlay unobstructed Cannon fuse '+scenario.hz+'Hz',()=>{
  const {bursts}=trial({...scenario,wall:false});
  assert.equal(bursts.length,1,'one shell burst');
  assert.ok(bursts[0].x>=148-1e-6&&bursts[0].x<=150+1e-6,
   'unobstructed programmed fuse remains stable; x='+bursts[0].x);
 });
}

/* Negative control: a wall physically earlier than the programmed fuse must
 * retain the original wall burst. This proves the full-game fixture really
 * exercises terrain instead of bypassing it. */
test('full 49-overlay earlier wall retains first-contact priority',()=>{
 const {bursts,preWall}=trial({hz:30,startX:146,wallX:163,vx:380,wall:true});
 assert.ok(preWall&&preWall.hit&&preWall.hit.t>0);
 assert.equal(bursts.length,1);
 assert.ok(Math.abs(bursts[0].x-149.175)<1e-3,
  'wall must beat later fuse; actual x='+bursts[0].x);
});
