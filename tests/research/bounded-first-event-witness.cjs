'use strict';
// Research-only, read-only earliest-event comparator. No combat writes.
// Input must contain complete, authoritative pre-frame witnesses. A false
// completeness assertion is NOT a substitute for real movement history.
const EPS=1e-9;
function circleContact(px,py,vx,vy,cx,cy,r,until){
 if(![px,py,vx,vy,cx,cy,r,until].every(Number.isFinite)||!(r>0)||!(until>0))return null;
 const dx=px-cx,dy=py-cy,c=dx*dx+dy*dy-r*r;
 if(!Number.isFinite(c))return null;
 if(c<=0)return 0;
 const a=vx*vx+vy*vy,b=dx*vx+dy*vy;
 if(!(a>0)||!(b<0)||!Number.isFinite(a)||!Number.isFinite(b))return null;
 const d=b*b-a*c;
 if(!(d>64*Number.EPSILON*(Math.abs(b*b)+Math.abs(a*c))))return null;
 const t=c/(-b+Math.sqrt(d));
 return Number.isFinite(t)&&t>=0&&t<=until?t:null;
}
function earliestOrdinaryEvent(shot,frame,world){
 if(!shot||!world||world.complete!==true||!Array.isArray(world.bodies)||
   !Array.isArray(world.walls)||!Array.isArray(world.projectiles)||
   ![shot.x,shot.y,shot.vx,shot.vy,shot.r,shot.ttl,frame].every(Number.isFinite)||
   !(shot.r>0)||!(shot.ttl>0)||!(frame>0)||frame>.05||shot.dead||
   shot.shell||shot.beam||shot.splash)return {kind:'abstain',reason:'invalid-input'};
 const limit=Math.min(frame,shot.ttl),candidates=[];
 function add(kind,id,t){if(t!==null&&t<=limit)candidates.push({kind,id,time:t});}
 if(shot.ttl<=frame)add('expiry',null,shot.ttl);
 if(!world.bounds||![world.bounds.minX,world.bounds.maxX,world.bounds.minY,world.bounds.maxY].every(Number.isFinite)||
   !(world.bounds.minX<world.bounds.maxX&&world.bounds.minY<world.bounds.maxY))
   return {kind:'abstain',reason:'bounds'};
 const B=world.bounds;
 if(shot.x<B.minX||shot.x>B.maxX||shot.y<B.minY||shot.y>B.maxY)
   return {kind:'abstain',reason:'outside'};
 for(const [p,v,min,max] of [[shot.x,shot.vx,B.minX,B.maxX],[shot.y,shot.vy,B.minY,B.maxY]]){
   const t=v>0?(max-p)/v:v<0?(min-p)/v:null;
   if(t!==null&&t>=0)add('exit',null,t);
 }
 for(const body of world.bodies){
   if(!body||!Number.isFinite(body.r)||!(body.r>0)||body.id==null)
     return {kind:'abstain',reason:'body-geometry'};
   if(body.certifiedStationary===true){
     if(!Number.isFinite(body.x)||!Number.isFinite(body.y))
       return {kind:'abstain',reason:'body-geometry'};
     add('body',body.id,circleContact(shot.x,shot.y,shot.vx,shot.vy,body.x,body.y,shot.r+body.r,limit));
     continue;
   }
   // A certified maximum distance from frame-start pose bounds EVERY
   // possible path, not merely the final displacement. This can prove a
   // remote moving body irrelevant without pretending to know its path.
   if(![body.startX,body.startY,body.maxTravel].every(Number.isFinite)||body.maxTravel<0)
     return {kind:'abstain',reason:'body-motion'};
   const dx=shot.x-body.startX,dy=shot.y-body.startY;
   const a=shot.vx*shot.vx+shot.vy*shot.vy;
   if(!Number.isFinite(a))return {kind:'abstain',reason:'shot-motion'};
   const t=a>0?Math.max(0,Math.min(limit,-(dx*shot.vx+dy*shot.vy)/a)):0;
   const distance=Math.hypot(dx+shot.vx*t,dy+shot.vy*t);
   if(!Number.isFinite(distance)||distance<=shot.r+body.r+body.maxTravel+1e-9)
     return {kind:'abstain',reason:'moving-body-near-corridor'};
 }
 // Terrain and interception times must be supplied by authoritative sweeps.
 // Empty arrays are valid only when world.complete certifies exhaustive scans.
 for(const wall of world.walls){
   if(!wall||wall.complete!==true||wall.id==null||!Number.isFinite(wall.time)||wall.time<0)
     return {kind:'abstain',reason:'wall-witness'};
   add('wall',wall.id,wall.time);
 }
 for(const p of world.projectiles){
   if(!p||p.complete!==true||p.id==null||!Number.isFinite(p.time)||p.time<0)
     return {kind:'abstain',reason:'interception-witness'};
   add('interception',p.id,p.time);
 }
 if(!candidates.length)return {kind:'none'};
 candidates.sort((a,b)=>a.time-b.time);
 if(candidates.length>1&&Math.abs(candidates[1].time-candidates[0].time)<=EPS)
   return {kind:'abstain',reason:'tie',time:candidates[0].time};
 return candidates[0];
}
module.exports={circleContact,earliestOrdinaryEvent};
