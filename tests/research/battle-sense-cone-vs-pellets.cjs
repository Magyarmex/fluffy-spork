'use strict';
// Deterministic synthetic sensitivity probe, NOT natural-game evidence.
// Compare the legacy broad hull cone against real pellet-lane geometry.
// Run: node tests/research/battle-sense-cone-vs-pellets.cjs
const {projectileCandidate}=require('./battle-sense-projectile-candidate.cjs');
let seed=0x81a5f77;
function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
const shots=10000,bots=12,shooter={id:1};
let cone=0,physical=0,coneOnly=0,physicalOnly=0,neither=0,terrainChecks=0;
for(let s=0;s<shots;s++){
 const angle=rand()*Math.PI*2,bullets=[];
 for(let p=0;p<5;p++){
  const a=angle+(p-2)*.06;
  bullets.push({ownerId:1,x:0,y:0,vx:Math.cos(a)*700,vy:Math.sin(a)*700,ttl:1,r:3});
 }
 for(let i=0;i<bots;i++){
  const v={x:(rand()-.5)*1600,y:(rand()-.5)*1600};
  const d=Math.hypot(v.x,v.y);
  const inCone=d>1e-6&&(v.x*Math.cos(angle)+v.y*Math.sin(angle))/d>.75;
  const provenance=projectileCandidate({bullets,firstTerrainHit(){return null;}},shooter,v);
  const inPellets=provenance.possible;terrainChecks+=provenance.terrainChecks;
  if(inCone)cone++;
  if(inPellets)physical++;
  if(inCone&&!inPellets)coneOnly++;
  if(inPellets&&!inCone)physicalOnly++;
  if(!inCone&&!inPellets)neither++;
 }
}
const total=shots*bots;
console.log(JSON.stringify({shots,bots,total,cone,physical,coneOnly,physicalOnly,neither,terrainChecks,
 coneOnlyFraction:cone?coneOnly/cone:0},null,2));
// These are sensitivity statistics, not evidence of AI decisions, actual hit
// probabilities, class balance, natural aim, cover, or Android performance.
