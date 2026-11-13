'use strict';
// Research-only: compare a conservative geometric first-contact witness with
// actual composed shipping damage, without granting the witness combat authority.
const test=require('node:test');
const assert=require('node:assert/strict');
const prior=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(prior===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prior;
const census=require('../browser/projectile-density-audit.js');

// Exact quadratic entry time for a moving point against a stationary disk.
// Returns null on a miss; this is a research oracle, not a shipping change.
function firstDiskContact(x,y,vx,vy,cx,cy,r,ttl){
 const dx=x-cx,dy=y-cy;
 const a=vx*vx+vy*vy,b=2*(dx*vx+dy*vy),c=dx*dx+dy*dy-r*r;
 if(!(a>0&&r>0&&ttl>0)||c<=0)return null; // initial overlap is ambiguous
 const disc=b*b-4*a*c;
 if(disc<0)return null;
 const t=(-b-Math.sqrt(disc))/(2*a);
 return t>=0&&t<=ttl?t:null;
}
function run(hz,scenario,observed){
 return withSeed(1517802,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  g.sfx.muted=true;
  const p=g.player;p.x=1000;p.y=1000;p.hp=1000;p.alive=true;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  const target=g.shapes.find(s=>s.type==='circle');
  assert.ok(target,'materialized game must provide a Circle');
  target.x=scenario.x;target.y=scenario.y;target.r=12;target.hp=100;
  target.__novaShapeSweepEpoch=7;
  target.__novaShapeSweepPrevX=target.x;
  target.__novaShapeSweepPrevY=target.y;
  target.born=0;target.vx=0;target.vy=0;
  g.shapes=[target];g.drones=[];g.__novaTerrain=[];
  g.time=1;g.__novaShapeSweepEpoch=7;g.__novaShapeSweepActive=true;
  g.__novaFrameStartBulletEpoch=7;g.__novaFrameStartBulletIdCeiling=1000;
  const bullet={kind:'bullet',id:999,ownerId:p.id,x:0,y:0,
   vx:36*hz,vy:0,r:3,dmg:20,ttl:.8/hz,pen:1,hits:0,
   dead:false,shell:false,beam:false,color:'#fff'};
  const expectedContact=firstDiskContact(bullet.x,bullet.y,bullet.vx,
   bullet.vy,target.x,target.y,target.r+bullet.r,bullet.ttl);
  g.bullets=[bullet];
  const counters=observed?census.install(g,census.create()):null;
  g.updateBullets(1/hz);
  return {hp:target.hp,remaining:g.bullets.length,
   expectedContact,observedInputs:counters?.penOneExpiringInputs??null};
 });
}
for(const hz of [30,60,120,240]){
 test('materialized pen=1 expiry first-contact shadow '+hz+'Hz',()=>{
  for(const scenario of [
   {name:'near target',x:18,y:0,contact:true},
   {name:'beyond TTL',x:80,y:0,contact:false},
   {name:'off-axis miss',x:18,y:100,contact:false}
  ]){
   const control=run(hz,scenario,false);
   const shadow=run(hz,scenario,true);
   assert.equal(control.expectedContact!==null,scenario.contact,
    scenario.name+': oracle geometry');
   assert.deepEqual({hp:shadow.hp,remaining:shadow.remaining},
    {hp:control.hp,remaining:control.remaining},
    scenario.name+': research observer must not alter actual damage/removal');
   assert.equal(shadow.observedInputs,1,
    scenario.name+': ordinary pen=1 expiry must be observed');
   // The near case is known to exercise real damage, not a vacuous parity test.
   if(scenario.contact)assert.ok(control.hp<100,
    scenario.name+': real shipping engine must register the nearby contact');
  }
 });
}
