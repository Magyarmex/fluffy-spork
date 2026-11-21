'use strict';
// Research-only projectile provenance prototype. NOT wired into gameplay.
// Compare against event-time hull-cone candidate logic before changing AI.
function projectileCandidate(game,shooter,victim,startIndex=0){
 if(!game||!shooter||!victim||!Array.isArray(game.bullets)||
    !Number.isFinite(victim.x)||!Number.isFinite(victim.y))
  return {known:false,possible:false,reason:'invalid'};
 const defs=game.__testWindow?.__novaMakeRequire?.('')('game/classes')?.CLASSES;
 const size=Number(defs?.[victim.cls]?.size);
 const hull=size>0&&Number.isFinite(size)?size+3:18;
 let checked=0,terrainChecks=0,unsupported=0;
 for(let i=startIndex;i<game.bullets.length;i++){
  const b=game.bullets[i];
  if(!b||b.ownerId!==shooter.id||b.dead)continue;
  if(b.shell||b.splash||b.cluster){unsupported++;continue;}
  const speed=Math.hypot(b.vx,b.vy);
  const radius=b.r==null?0:b.r;
  if(!Number.isFinite(b.vx)||!Number.isFinite(b.vy)||
     !(speed>1)||!Number.isFinite(speed)||
     !Number.isFinite(b.x)||!Number.isFinite(b.y)||
     !Number.isFinite(b.ttl)||b.ttl<=0||
     !Number.isFinite(radius)||radius<0||
     (b.pen!=null&&(!Number.isFinite(b.pen)||b.pen<0))||
     !Number.isFinite(speed*b.ttl)){unsupported++;continue;}
  checked++;
  const ux=b.vx/speed,uy=b.vy/speed;
  const dx=victim.x-b.x,dy=victim.y-b.y;
  const maxTravel=speed*b.ttl;
  const projection=dx*ux+dy*uy;
  const along=Math.max(0,Math.min(maxTravel,projection));
  const miss=Math.hypot(dx-ux*along,dy-uy*along);
  const hitRadius=hull+radius;
  if(miss>hitRadius)continue;
  // Test cover only up to the tank's first possible swept contact,
  // not its center: a wall behind the near hull face is not a veto.
  const lateral2=Math.max(0,dx*dx+dy*dy-projection*projection);
  const entry=Math.max(0,Math.min(maxTravel,
    projection-Math.sqrt(Math.max(0,hitRadius*hitRadius-lateral2))));
  if(typeof game.firstTerrainHit==='function'){
   terrainChecks++;
   const hit=game.firstTerrainHit(b.x,b.y,b.x+ux*entry,b.y+uy*entry,
      radius*.45);
   if(hit){
    // The shipping Battlefield can let penetrating rounds breach cover.
    // A confirmed permanent wall cannot be breached; destructible or
    // unclassified obstructions need actual impact resolution.
    if(b.pen>0&&(!hit.solid||hit.solid.destructible!==false))unsupported++;
    continue;
   }
  }
  return {known:true,possible:true,checked,terrainChecks,unsupported};
 }
 return {known:checked>0&&unsupported===0,possible:false,
  checked,terrainChecks,unsupported};
}
module.exports={projectileCandidate};
