'use strict';
/* Exact materialized 48-overlay Game, canonical damageTank, and actual
 * Battlefield/Performance projectile owner. No synthetic damage callback. */
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;
function trial(fps){
 return withSeed(123456,()=>{
  const g=bootGame();if(!g.player)g.redeploy();g.sfx.muted=true;
  const p=g.player;p.x=-600;p.y=-600;p.spawnShieldT=0;
  const bots=g.tanks.filter(t=>t!==p).slice(0,3);
  assert.equal(bots.length,3,'canonical redeploy supplies AI tanks');
  for(const t of [...g.tanks])if(t!==p&&!bots.includes(t))g.unregisterTank(t);
  const positions=[93.7598181758076,139.03676807903686,184.3137179822661];
  bots.forEach((t,i)=>{
   t.x=positions[i];t.y=0;t.hp=100;t.maxHp=100;
   t.spawnShieldT=0;t.shieldT=0;t.bulwarkT=0;t.tauntT=0;
   t.alive=true;t.cls='scout';t.vx=0;t.vy=0;
  });
  g.shapes=[];g.drones=[];g.bullets=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  g.__novaShapeSweepActive=false;
  const ttl=.2043253394891508;
  const b={kind:'bullet',id:g.nextId++,ownerId:p.id,x:0,y:0,
   vx:3363.217242434621,vy:0,r:3,dmg:20,ttl,
   pen:2,hits:0,dead:false,shell:false,beam:false,color:'#fff'};
  g.bullets.push(b);
  for(let i=0;i<Math.ceil(ttl*fps)+2;i++){
   g.time+=1/fps;
   g.hash.clear();for(const t of g.tanks)if(t.alive)g.hash.insert(t);
   g.updateBullets(1/fps);
  }
  return {hp:bots.map(t=>t.hp),alive:bots.map(t=>t.alive),
   hits:b.hits,pen:b.pen,remaining:g.bullets.includes(b),score:p.score};
 });
}
for(const fps of [30,60,120,240])test('real 48-overlay pen=2 hull continuation at '+fps+'Hz',()=>{
 const r=trial(fps);
 assert.deepEqual(Array.from(r.hp),[80,80,80],
  'canonical damageTank hits every physically reached hull');
 assert.deepEqual(Array.from(r.alive),[true,true,true]);
 assert.equal(r.hits,3);assert.equal(r.pen,-1);
 assert.equal(r.remaining,false);assert.equal(r.score,0);
});
