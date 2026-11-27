'use strict';
// Research-only constant-velocity sensitivity study; NOT a natural match,
// collision/terrain oracle, balance benchmark or gameplay implementation.
// Run: node tests/research/battle-sense-moving-victim-sensitivity.cjs
// Reproducible independent swept relative-motion geometry against static hull.
let state=1517800;
function rand(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
function swept(x,y,vx,vy,ttl,r){
 const vv=vx*vx+vy*vy;
 const t=vv>0?Math.max(0,Math.min(ttl,(x*vx+y*vy)/vv)):0;
 return Math.hypot(x-vx*t,y-vy*t)<=r;
}
const N=100000;
for(const targetSpeed of [0,40,80,120,180,240]){
 let staticHit=0,movingHit=0,movingOnly=0,staticOnly=0;
 for(let i=0;i<N;i++){
  const shotAngle=rand()*Math.PI*2;
  const shotSpeed=300+rand()*600,ttl=.4+rand()*1.6;
  const dist=70+rand()*530,bearing=rand()*Math.PI*2;
  const x=dist*Math.cos(bearing),y=dist*Math.sin(bearing);
  const bvx=shotSpeed*Math.cos(shotAngle),bvy=shotSpeed*Math.sin(shotAngle);
  const va=rand()*Math.PI*2,tvx=targetSpeed*Math.cos(va),tvy=targetSpeed*Math.sin(va);
  const stationary=swept(x,y,bvx,bvy,ttl,22);
  const moving=swept(x,y,bvx-tvx,bvy-tvy,ttl,22);
  staticHit+=Number(stationary);movingHit+=Number(moving);
  movingOnly+=Number(moving&&!stationary);
  staticOnly+=Number(stationary&&!moving);
 }
 console.log('NOVA_MOVING_VICTIM_SYNTHETIC '+JSON.stringify({
  seed:1517800,samples:N,targetSpeed,staticHit,movingHit,movingOnly,staticOnly
 }));
}
// No claim that straight-line future motion is the actual engine path: tanks
// steer, accelerate, collide, take knockback and may change speed mid-shot.
