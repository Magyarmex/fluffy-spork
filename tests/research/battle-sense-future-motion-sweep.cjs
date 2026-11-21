'use strict';
// Research-only synthetic sensitivity study. NOT shipping combat or balance.
// Replays the base Game.moveTank 60 Hz easing formula against four constant
// legal commands. This is NOT the full Battlefield collision/swept projectile
// model, a natural-match incidence estimate, or a proof of reachability.
const DT=1/60, SPEED=124, RADIUS=21, N=100000;
let state=20261121;
function random(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
const samples=Array.from({length:N},()=>({x:15+random()*205,y:-100+random()*200}));
function canContact(x0,y0,bulletSpeed,ttl,commandX,commandY){
 let x=x0,y=y0,vx=0,vy=0;
 const frames=Math.round(ttl/DT);
 for(let frame=1;frame<=frames;frame++){
  const f=Math.min(1,DT*9);
  vx+=(commandX-vx)*f;vy+=(commandY-vy)*f;
  x+=vx*DT;y+=vy*DT;
  const bulletX=bulletSpeed*frame*DT;
  if(Math.hypot(x-bulletX,y)<=RADIUS)return true;
 }
 return false;
}
function staticHit(x,y,bulletSpeed,ttl){
 const closest=Math.max(0,Math.min(bulletSpeed*ttl,x));
 return Math.hypot(x-closest,y)<=RADIUS;
}
const cases=[[120,.8],[200,1],[350,.8],[500,.6]];
for(const [bulletSpeed,ttl] of cases){
 let staticMisses=0,commandHits=0;
 for(const {x,y} of samples){
  if(staticHit(x,y,bulletSpeed,ttl))continue;
  staticMisses++;
  const commands=[[0,-SPEED],[0,SPEED],[SPEED,0],[-SPEED,0]];
  if(commands.some(([vx,vy])=>canContact(x,y,bulletSpeed,ttl,vx,vy)))
   commandHits++;
 }
 const result={seed:20261121,samples:N,bulletSpeed,ttl,
  staticMisses,commandHits,conditionalFraction:commandHits/staticMisses};
 if(!Number.isFinite(result.conditionalFraction))throw Error('invalid synthetic result');
 console.log('NOVA_BATTLE_SENSE_FUTURE_MOTION_SWEEP '+JSON.stringify(result));
}
// Interpretation: an initial straight-lane miss is not proof of a future miss.
// The four commands are a tiny subset of possible controls. No terrain,
// abilities, projectiles with area damage, latency, aim, collision broadphase,
// target behavior policy, or observer information model is simulated.
