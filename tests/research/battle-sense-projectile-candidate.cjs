'use strict';
// Research-only projectile provenance prototype. NOT wired into gameplay.
// Compare against event-time hull-cone candidate logic before changing AI.
function projectileCandidate(game,shooter,victim,startIndex=0){
 if(!game||!shooter||!victim||!Array.isArray(game.bullets))
  return {known:false,possible:false,reason:'invalid'};
 const defs=game.__testWindow?.__novaMakeRequire?.('')('game/classes')?.CLASSES;
 const size=Number(defs?.[victim.cls]?.size);
 const hull=size>0&&Number.isFinite(size)?size+3:18;
 let checked=0,terrainChecks=0,unsupported=0;
 for(let i=startIndex;i<game.bullets.length;i++){
  const b=game.bullets[i];
  if(!b||b.ownerId!==shooter.id)continue;
  if(b.shell||b.splash||b.cluster){unsupported++;continue;}
  const speed=Math.hypot(b.vx,b.vy);
  if(!(speed>1)||!Number.isFinite(b.x)||!Number.isFinite(b.y)||
     !Number.isFinite(b.ttl)||b.ttl<=0){unsupported++;continue;}
  checked++;
  const ux=b.vx/speed,uy=b.vy/speed;
  const dx=victim.x-b.x,dy=victim.y-b.y;
  const maxTravel=speed*b.ttl;
  const along=Math.max(0,Math.min(maxTravel,dx*ux+dy*uy));
  const miss=Math.hypot(dx-ux*along,dy-uy*along);
  if(miss>hull+(Number(b.r)||0))continue;
  if(typeof game.firstTerrainHit==='function'){
   terrainChecks++;
   if(game.firstTerrainHit(b.x,b.y,b.x+ux*along,b.y+uy*along,
      Math.max(0,(Number(b.r)||0)*.45)))continue;
  }
  return {known:true,possible:true,checked,terrainChecks,unsupported};
 }
 return {known:checked>0&&unsupported===0,possible:false,
  checked,terrainChecks,unsupported};
}
module.exports={projectileCandidate};
