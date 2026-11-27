'use strict';
// Research-only A/B/C scaling probe. Host CPU is NOT Android frame-time evidence.
// Run: node tests/research/battle-sense-projectile-scaling.cjs
// A = current broad firing cone; B = emitted projectile lanes, no terrain;
// C = emitted projectile lanes plus first-contact terrain query.
const {projectileCandidate}=require('./battle-sense-projectile-candidate.cjs');
let seed=0x219371;
function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
const shooter={id:7};
for(const bulletCount of [1,5,20,50])for(const targets of [12,30,100]){
 let terrainChecks=0,coneCandidates=0,laneCandidates=0,physicalCandidates=0;
 let laneUnknown=0,physicalUnknown=0,laneNs=0n,physicalNs=0n;
 const shots=300,start=process.hrtime.bigint();
 for(let s=0;s<shots;s++){
  const angle=rand()*Math.PI*2,bullets=[];
  for(let j=0;j<bulletCount;j++){
   const a=angle+(j-(bulletCount-1)/2)*.04;
   bullets.push({ownerId:7,x:0,y:0,vx:Math.cos(a)*700,vy:Math.sin(a)*700,
    ttl:1,r:3,pen:0});
  }
  const game={bullets,firstTerrainHit(){return null;}};
  const victims=Array.from({length:targets},()=>({
   x:(rand()-.5)*1600,y:(rand()-.5)*1600
  }));
  for(const victim of victims){
   const d=Math.hypot(victim.x,victim.y);
   if(d>1e-6&&Math.cos(angle-Math.atan2(victim.y,victim.x))>.75)
    coneCandidates++;
  }
  let t=process.hrtime.bigint();
  for(const victim of victims){
   const r=projectileCandidate(game,shooter,victim,0,{terrain:false});
   laneCandidates+=Number(r.possible);
   laneUnknown+=Number(!r.known);
   if(r.terrainChecks!==0)throw new Error('B arm unexpectedly queried terrain');
  }
  let next=process.hrtime.bigint();laneNs+=next-t;t=next;
  for(const victim of victims){
   const r=projectileCandidate(game,shooter,victim);
   physicalCandidates+=Number(r.possible);
   physicalUnknown+=Number(!r.known);
   terrainChecks+=r.terrainChecks;
  }
  physicalNs+=process.hrtime.bigint()-t;
 }
 if(laneCandidates!==physicalCandidates||laneUnknown!==physicalUnknown)
  throw new Error('clear-terrain A/B/C parity violated');
 const ms=Number(process.hrtime.bigint()-start)/1e6;
 console.log(JSON.stringify({bulletCount,targets,shots,candidates:shots*targets,
  coneCandidates,laneCandidates,physicalCandidates,laneUnknown,physicalUnknown,
  laneMs:Number(laneNs)/1e6,physicalMs:Number(physicalNs)/1e6,
  ms,terrainChecks}));
}
// Deliberately no device claims: this bypasses actual terrain collision cost,
// browser rendering, AI observers, input, and physical-phone scheduling.
