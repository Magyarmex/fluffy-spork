'use strict';
// Research-only projectile provenance prototype. NOT wired into gameplay.
// Compare against event-time hull-cone candidate logic before changing AI.
// options.terrain=false is a deliberately geometry-only B arm: it does not
// establish physical reachability through cover. Default C arm queries terrain.
function projectileCandidate(game,shooter,victim,startIndex=0,options={}){
 if(!game||!shooter||!victim||!Array.isArray(game.bullets)||
    !Number.isFinite(victim.x)||!Number.isFinite(victim.y))
  return {known:false,possible:false,reason:'invalid'};
 const defs=game.__testWindow?.__novaMakeRequire?.('')('game/classes')?.CLASSES;
 const size=Number(defs?.[victim.cls]?.size);
 const hull=size>0&&Number.isFinite(size)?size+3:18;
 let checked=0,terrainChecks=0,unsupported=0,geometricMisses=0;
 // A stationary birth-time miss is not a certified miss for a moving hull.
 // The actual engine can steer, collide or change velocity after firing;
 // preserve uncertainty rather than silently asserting a physical impossibility.
 const invalidMotion=(victim.vx!=null&&!Number.isFinite(victim.vx))||
  (victim.vy!=null&&!Number.isFinite(victim.vy));
 const movingVictim=!invalidMotion&&Math.hypot(victim.vx??0,victim.vy??0)>1e-6;
 for(let i=startIndex;i<game.bullets.length;i++){
  const b=game.bullets[i];
  if(!b||b.ownerId!==shooter.id||b.dead)continue;
  if(b.shell||b.splash||b.cluster||b.beam){unsupported++;continue;}
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
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||
     !Number.isFinite(projection)){unsupported++;continue;}
  const along=Math.max(0,Math.min(maxTravel,projection));
  const miss=Math.hypot(dx-ux*along,dy-uy*along);
  const hitRadius=hull+radius;
  if(miss>hitRadius){geometricMisses++;continue;}
  // Test cover only up to the tank's first possible swept contact,
  // not its center: a wall behind the near hull face is not a veto.
  const lateral2=Math.max(0,dx*dx+dy*dy-projection*projection);
  const entry=Math.max(0,Math.min(maxTravel,
    projection-Math.sqrt(Math.max(0,hitRadius*hitRadius-lateral2))));
  if(!Number.isFinite(entry)){unsupported++;continue;}
  if(options.terrain!==false&&typeof game.firstTerrainHit==='function'){
   terrainChecks++;
   let hit;
   try{
    hit=game.firstTerrainHit(b.x,b.y,b.x+ux*entry,b.y+uy*entry,
      radius*.45);
   }catch(_){
    // A failed terrain query is unknown, never proof of a clear shot.
    // Another independently clear projectile may still certify the volley.
    unsupported++;
    continue;
   }
   if(hit){
    // The shipping Battlefield can let penetrating rounds breach cover.
    // A confirmed permanent wall cannot be breached; destructible or
    // unclassified obstructions need actual impact resolution.
    // Only a confirmed permanent solid is a known veto. Even a pen=0
    // projectile may break destructible cover for a later pellet/shot in
    // this volley; without chronological cover-damage resolution, the
    // victim's eventual lane remains unknown rather than a certified miss.
    if(!hit.solid||hit.solid.destructible!==false)unsupported++;
    continue;
   }
  }
  return {known:true,possible:true,checked,terrainChecks,unsupported};
 }
 // An instantaneous zero velocity does not prove a tank will remain stationary:
 // the next player/AI command can accelerate it into the projectile lane.
 // Conservative research comparisons must not certify a negative merely
 // because a target was momentarily at rest at projectile birth.
 const futureMotionUnknown=options.conservativeMotion===true;
 return {known:checked>0&&unsupported===0&&!movingVictim&&!invalidMotion&&!futureMotionUnknown,possible:false,
  checked,terrainChecks,unsupported,movingVictim,
  futureMotionUnknown:futureMotionUnknown&&geometricMisses>0&&unsupported===0&&!movingVictim&&!invalidMotion};
}
module.exports={projectileCandidate};
