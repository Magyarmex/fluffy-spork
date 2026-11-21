'use strict';
// Research-only scaling probe. Host CPU is NOT Android frame-time evidence.
// Run: node tests/research/battle-sense-projectile-scaling.cjs
const {projectileCandidate}=require('./battle-sense-projectile-candidate.cjs');
let seed=0x219371;
function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
const shooter={id:7};
for(const bulletCount of [1,5,20,50])for(const targets of [12,30,100]){
 let terrainChecks=0,positives=0;
 const shots=300,start=process.hrtime.bigint();
 for(let s=0;s<shots;s++){
  const angle=rand()*Math.PI*2,bullets=[];
  for(let j=0;j<bulletCount;j++){
   const a=angle+(j-(bulletCount-1)/2)*.04;
   bullets.push({ownerId:7,x:0,y:0,vx:Math.cos(a)*700,vy:Math.sin(a)*700,
    ttl:1,r:3,pen:0});
  }
  const game={bullets,firstTerrainHit(){return null;}};
  for(let i=0;i<targets;i++){
   const victim={x:(rand()-.5)*1600,y:(rand()-.5)*1600};
   const result=projectileCandidate(game,shooter,victim);
   terrainChecks+=result.terrainChecks;
   positives+=Number(result.possible);
  }
 }
 const ms=Number(process.hrtime.bigint()-start)/1e6;
 console.log(JSON.stringify({bulletCount,targets,shots,candidates:shots*targets,
  ms,terrainChecks,positives}));
}
// Deliberately no device claims: this bypasses actual terrain collision cost,
// browser rendering, AI observers, input, and physical-phone scheduling.
