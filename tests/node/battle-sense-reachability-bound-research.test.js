'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reachabilityMiss}=require('../research/battle-sense-reachability-bound.cjs');
const DT=1/60,S=124,R=21;
function bullet(speed,ttl=1){return {x:0,y:0,vx:speed,vy:0,ttl,r:0};}
function victim(x,y){return {x,y,vx:0,vy:0};}
function actualContact(b,v,ux,uy){
 let x=v.x,y=v.y,vx=0,vy=0;
 for(let n=1;n<=Math.ceil(b.ttl/DT);n++){
  vx+=(ux-vx)*DT*9;vy+=(uy-vy)*DT*9;
  x+=vx*DT;y+=vy*DT;
  // This is a discrete endpoint contact witness, not full swept physics.
  const t=Math.min(n*DT,b.ttl);
  if(Math.hypot(x-b.vx*t,y-b.vy*t)<=R)return true;
 }
 return false;
}
test('research reachability: a future-moving target is never certified outside the reachable tube',()=>{
 const b=bullet(200),v=victim(100,50);
 const r=reachabilityMiss(b,v,{speedLimit:S,hullRadius:R});
 assert.equal(r.known,false);
 assert.equal(r.reason,'reachable-tube');
});
test('research reachability: a far lateral target is a certified bounded miss',()=>{
 const r=reachabilityMiss(bullet(500,.6),victim(200,300),
  {speedLimit:S,hullRadius:R});
 assert.equal(r.known,true);
 assert.equal(r.possible,false);
 assert.equal(r.reason,'bounded-miss');
});
test('research reachability: missing speed proof, initial motion and invalid geometry fail closed',()=>{
 const b=bullet(200),v=victim(100,50);
 for(const opts of [{hullRadius:R},{speedLimit:S},{speedLimit:-1,hullRadius:R},
  {speedLimit:Infinity,hullRadius:R}]){
  assert.equal(reachabilityMiss(b,v,opts).known,false);
 }
 assert.equal(reachabilityMiss(b,{...v,vx:1},{speedLimit:S,hullRadius:R}).known,false);
 assert.equal(reachabilityMiss({...b,ttl:Infinity},v,
  {speedLimit:S,hullRadius:R}).known,false);
});
test('research reachability: seeded four-command physical witness never contradicts a certificate',()=>{
 let state=0x20261121;
 function rand(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
 let certified=0,contacts=0;
 for(const speed of [120,200,350,500]){
  for(let i=0;i<512;i++){
   const b=bullet(speed,speed===500?.6:1);
   const v=victim(15+rand()*205,-100+rand()*200);
   const r=reachabilityMiss(b,v,{speedLimit:S,hullRadius:R});
   if(r.known)certified++;
   for(const [ux,uy] of [[0,-S],[0,S],[S,0],[-S,0]]){
    if(actualContact(b,v,ux,uy)){
     contacts++;
     assert.equal(r.known,false,
      'certificate may not reject a physically simulated command at speed '+speed+' case '+i);
    }
   }
  }
 }
 assert.ok(certified>0,'synthetic test must exercise a nonempty certificate set');
 assert.ok(contacts>0,'synthetic test must exercise real reachable contacts');
});
