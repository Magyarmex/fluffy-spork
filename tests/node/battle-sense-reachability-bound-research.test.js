'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reachabilityMiss}=require('../research/battle-sense-reachability-bound.cjs');
const DT=1/60,S=124,R=21;
function bullet(speed,ttl=1){return {x:0,y:0,vx:speed,vy:0,ttl,r:0};}
function victim(x,y){return {x,y,vx:0,vy:0};}
function actualContact(b,v,ux,uy){
 let x=v.x,y=v.y,vx=v.vx,vy=v.vy;
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
test('research reachability: missing speed proof, corrupt initial motion and invalid geometry fail closed',()=>{
 const b=bullet(200),v=victim(100,50);
 for(const opts of [{hullRadius:R},{speedLimit:S},{speedLimit:-1,hullRadius:R},
  {speedLimit:Infinity,hullRadius:R}]){
  assert.equal(reachabilityMiss(b,v,opts).known,false);
 }
 assert.equal(reachabilityMiss(b,{...v,vx:Infinity},{speedLimit:S,hullRadius:R}).known,false);
 assert.equal(reachabilityMiss(b,{...v,vy:NaN},{speedLimit:S,hullRadius:R}).known,false);
 assert.equal(reachabilityMiss(bullet(500,.6),{...victim(200,300),vx:30,vy:-20},
  {speedLimit:S,hullRadius:R}).known,true,
  'a moving hull with finite initial velocity may still be provably unreachable');
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
   const v={...victim(15+rand()*205,-100+rand()*200),
    vx:(rand()-.5)*S,vy:(rand()-.5)*S};
   const r=reachabilityMiss(b,v,{speedLimit:S,hullRadius:R});
   const coarse=reachabilityMiss(b,v,{speedLimit:S,hullRadius:R,segments:8});
   if(r.known)certified++;
   if(coarse.known)assert.equal(r.known,true,
    'coarse bound must never certify more than full frame-by-frame bound');
   for(const [ux,uy] of [[0,-S],[0,S],[S,0],[-S,0]]){
    if(actualContact(b,v,ux,uy)){
     contacts++;
     assert.equal(r.known,false,
      'certificate may not reject a physically simulated command at speed '+speed+' case '+i);
     assert.equal(coarse.known,false,
      'coarse certificate may not reject a physical command at speed '+speed+' case '+i);
    }
   }
  }
 }
 assert.ok(certified>0,'synthetic test must exercise a nonempty certificate set');
 assert.ok(contacts>0,'synthetic test must exercise real reachable contacts');
});

test('research reachability: invalid coarse window counts fail closed',()=>{
 const b=bullet(200),v=victim(100,50);
 for(const segments of [0,-1,1.5,Infinity,1000]){
  assert.equal(reachabilityMiss(b,v,{speedLimit:S,hullRadius:R,segments}).known,false);
 }
});

test('research reachability: 512 seeded changing-direction inputs cannot beat the bound',()=>{
 let seed=0x55112026;
 function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
 let certified=0,contacts=0;
 for(let i=0;i<512;i++){
  const speed=[120,200,350,500][i%4],ttl=[.8,1,.8,.6][i%4];
  const b=bullet(speed,ttl);
  const v={...victim(15+rand()*205,-100+rand()*200),
   vx:(rand()-.5)*S,vy:(rand()-.5)*S};
  const coarse=reachabilityMiss(b,v,{speedLimit:S,hullRadius:R,segments:8});
  if(coarse.known)certified++;
  let x=v.x,y=v.y,vx=v.vx,vy=v.vy;
  for(let n=1;n<=Math.ceil(ttl/DT);n++){
   const angle=rand()*Math.PI*2,power=rand()*S;
   const ux=Math.cos(angle)*power,uy=Math.sin(angle)*power;
   vx+=(ux-vx)*DT*9;vy+=(uy-vy)*DT*9;
   x+=vx*DT;y+=vy*DT;
   const t=Math.min(n*DT,ttl);
   if(Math.hypot(x-b.vx*t,y-b.vy*t)<=R){
    contacts++;
    assert.equal(coarse.known,false,
     'changing legal movement cannot outrun the conservative tube at '+i);
    break;
   }
  }
 }
 assert.ok(certified>0);
 assert.ok(contacts>0);
});

test('research reachability: frame-independent bound survives 30/60/120Hz and jitter',()=>{
 let seed=0x3012060;
 function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
 let certified=0,contacts=0;
 for(const hz of [30,60,120,'jitter']){
  for(let i=0;i<256;i++){
   const speed=[120,200,350,500][i%4],ttl=[.8,1,.8,.6][i%4];
   const b=bullet(speed,ttl);
   const v={...victim(15+rand()*205,-100+rand()*200),
    vx:(rand()-.5)*S,vy:(rand()-.5)*S};
   const certificate=reachabilityMiss(b,v,
    {speedLimit:S,hullRadius:R,segments:8,variableStep:true});
   if(certificate.known)certified++;
   let x=v.x,y=v.y,vx=v.vx,vy=v.vy,t=0;
   while(t<ttl-1e-10){
    const dt=Math.min(ttl-t,hz==='jitter'?(1/120+rand()/40):1/hz);
    const angle=rand()*Math.PI*2,power=rand()*S;
    const f=Math.min(1,dt*9);
    vx+=(Math.cos(angle)*power-vx)*f;
    vy+=(Math.sin(angle)*power-vy)*f;
    x+=vx*dt;y+=vy*dt;t+=dt;
    if(Math.hypot(x-b.vx*t,y-b.vy*t)<=R){
     contacts++;
     assert.equal(certificate.known,false,
      'variable-step certificate cannot reject legal movement '+hz+'/'+i);
     break;
    }
   }
  }
 }
 assert.ok(certified>0);
 assert.ok(contacts>0);
});
