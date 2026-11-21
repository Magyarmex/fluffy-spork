'use strict';
// RESEARCH ONLY. A sufficient (not necessary) miss certificate for a linear
// projectile against a hull starting at rest with bounded control magnitude.
// Matches base Game.moveTank's discrete f=min(1,dt*9) smoothing; NOT valid
// for dash, knockback, teleports, variable frame steps, speed boosts, terrain
// ricochets, homing, AoE or any unbounded external displacement.
// Never feed this oracle to shipping AI without proving its preconditions.
function reachabilityMiss(bullet,victim,options={}){
 const dt=options.dt??1/60,steer=options.steer??9;
 const speedLimit=options.speedLimit,hullRadius=options.hullRadius;
 if(!bullet||!victim||!Number.isFinite(dt)||dt<=0||
  !Number.isFinite(steer)||steer<0||
  !Number.isFinite(speedLimit)||speedLimit<0||
  !Number.isFinite(hullRadius)||hullRadius<=0||
  !Number.isFinite(victim.x)||!Number.isFinite(victim.y)||
  victim.vx!==0||victim.vy!==0||
  !Number.isFinite(bullet.x)||!Number.isFinite(bullet.y)||
  !Number.isFinite(bullet.vx)||!Number.isFinite(bullet.vy)||
  !Number.isFinite(bullet.ttl)||bullet.ttl<=0||
  !Number.isFinite(bullet.r)||bullet.r<0)
  return {known:false,reason:'preconditions'};
 const bulletSpeed=Math.hypot(bullet.vx,bullet.vy);
 if(!Number.isFinite(bulletSpeed)||bulletSpeed<=0)
  return {known:false,reason:'projectile'};
 const frames=Math.ceil(bullet.ttl/dt);
 if(frames>600||frames<1)return {known:false,reason:'horizon'};
 const f=Math.min(1,dt*steer),ux=bullet.vx/bulletSpeed,uy=bullet.vy/bulletSpeed;
 const dx=victim.x-bullet.x,dy=victim.y-bullet.y;
 const projection=dx*ux+dy*uy;
 if(!Number.isFinite(projection))return {known:false,reason:'geometry'};
 let velocityBound=0,displacementBound=0;
 for(let n=1;n<=frames;n++){
  const segmentStart=bulletSpeed*(n-1)*dt;
  const segmentEnd=Math.min(bulletSpeed*bullet.ttl,bulletSpeed*n*dt);
  const along=Math.max(segmentStart,Math.min(segmentEnd,projection));
  const miss=Math.hypot(dx-ux*along,dy-uy*along);
  // For a bounded control vector, each component of velocity is a convex
  // combination of the previous velocity and legal input. The scalar
  // recurrence upper-bounds displacement in any direction from rest.
  velocityBound+=(speedLimit-velocityBound)*f;
  displacementBound+=velocityBound*dt;
  if(!Number.isFinite(miss)||!Number.isFinite(displacementBound))
   return {known:false,reason:'geometry'};
  if(miss<=hullRadius+bullet.r+displacementBound)
   return {known:false,reason:'reachable-tube',frame:n};
 }
 return {known:true,possible:false,frames,reason:'bounded-miss'};
}
module.exports={reachabilityMiss};
