'use strict';
// RESEARCH ONLY. A sufficient (not necessary) miss certificate for a linear
// projectile against a hull with finite initial velocity and bounded control magnitude.
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
  !Number.isFinite(victim.vx)||!Number.isFinite(victim.vy)||
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
 const segments=options.segments??frames;
 if(!Number.isInteger(segments)||segments<1||segments>frames)
  return {known:false,reason:'segments'};
 const f=Math.min(1,dt*steer),ux=bullet.vx/bulletSpeed,uy=bullet.vy/bulletSpeed;
 const dx=victim.x-bullet.x,dy=victim.y-bullet.y;
 const projection=dx*ux+dy*uy;
 const initialSpeed=Math.hypot(victim.vx,victim.vy);
 if(!Number.isFinite(projection)||!Number.isFinite(initialSpeed))
  return {known:false,reason:'geometry'};
 // Variable-step mode uses the frame-independent convex velocity bound:
 // every legal moveTank update preserves |v|<=max(|v0|,speedLimit), so
 // displacement over any interval is at most that speed times elapsed time.
 // It is less selective but remains valid across 30/60/120Hz and jitter.
 // An exact scalar upper bound for the discrete Game.moveTank recurrence.
 // Grouping adjacent frames into a segment and using its END displacement
 // for the entire projectile segment can only make certification stricter.
 // Eight groups usually preserve much of the 60-frame research signal while
 // requiring only eight geometric distance checks. No terrain rays.
 function maxDisplacement(n){
  if(options.variableStep===true)
   return Math.max(initialSpeed,speedLimit)*Math.min(bullet.ttl,n*dt);
  if(f===0)return initialSpeed*dt*n;
  const decay=1-f;
  return dt*(speedLimit*n+
   (initialSpeed-speedLimit)*decay*(1-Math.pow(decay,n))/f);
 }
 for(let seg=1;seg<=segments;seg++){
  const a=Math.floor((seg-1)*frames/segments);
  const b=Math.floor(seg*frames/segments);
  const segmentStart=bulletSpeed*a*dt;
  const segmentEnd=Math.min(bulletSpeed*bullet.ttl,bulletSpeed*b*dt);
  const along=Math.max(segmentStart,Math.min(segmentEnd,projection));
  const miss=Math.hypot(dx-ux*along,dy-uy*along);
  const displacementBound=maxDisplacement(b);
  if(!Number.isFinite(miss)||!Number.isFinite(displacementBound))
   return {known:false,reason:'geometry'};
  // Numerical guard favors unknown over a near-tangent false certificate.
  if(miss<=hullRadius+bullet.r+displacementBound+1e-8)
   return {known:false,reason:'reachable-tube',segment:seg};
 }
 return {known:true,possible:false,frames,segments,reason:'bounded-miss'};
}
module.exports={reachabilityMiss};
