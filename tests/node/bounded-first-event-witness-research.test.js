'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {circleContact,earliestOrdinaryEvent:earliest}=require('../research/bounded-first-event-witness.cjs');
const shot=()=>({kind:'bullet',x:0,y:0,vx:6000,vy:0,r:3,radiusCertified:true,frameStartEpoch:1,ownerId:1,pen:0,hits:0,ttl:.005,dead:false,shell:false,beam:false,splash:false});
const world=()=>({complete:true,epoch:1,bounds:{minX:-2230,maxX:2230,minY:-2230,maxY:2230},bodies:[],walls:[],projectiles:[]});
for(const fps of [30,60,120,240])test('physical body before TTL at '+fps+'Hz',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});
 const event=earliest(shot(),1/fps,w);assert.equal(event.kind,'body');assert.equal(event.id,2);
 assert.ok(Math.abs(event.time-19/6000)<1e-12);
});
test('body beyond TTL cannot win',()=>{const w=world();w.bodies.push({id:2,x:100,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});assert.equal(earliest(shot(),1/30,w).kind,'expiry');});
test('permanent wall before body wins',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});w.walls.push({id:9,time:.001,complete:true,solid:true,permanent:true});assert.deepEqual(earliest(shot(),1/30,w),{kind:'wall',id:9,time:.001});});
test('wall after body cannot steal body',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});w.walls.push({id:9,time:.004,complete:true,solid:true,permanent:true});assert.equal(earliest(shot(),1/30,w).kind,'body');});
test('interception before body wins',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});w.projectiles.push({id:9,time:.002,complete:true,hostile:true,frameStartEpoch:1});assert.equal(earliest(shot(),1/30,w).kind,'interception');});
test('simultaneous body contacts abstain',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1},{id:3,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});assert.equal(earliest(shot(),1/30,w).reason,'tie');});
test('unknown movement abstains even far away',()=>{const w=world();w.bodies.push({id:2,x:1000,y:1000,r:18,certifiedStationary:false,collisionEligible:true,radiusCertified:true,epoch:1});assert.equal(earliest(shot(),1/30,w).reason,'body-motion');});
test('certified remote moving body does not veto local body',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});
 w.bodies.push({id:3,startX:500,startY:300,r:18,maxTravel:50,collisionEligible:true,radiusCertified:true,epoch:1});
 assert.equal(earliest(shot(),1/30,w).kind,'body');
});
test('bounded moving body near corridor abstains',()=>{
 const w=world();w.bodies.push({id:3,startX:40,startY:40,r:18,maxTravel:30,collisionEligible:true,radiusCertified:true,epoch:1});
 assert.equal(earliest(shot(),1/30,w).reason,'moving-body-near-corridor');
});
test('invalid cover/interception witness abstains',()=>{const w=world();w.walls.push({id:9,time:NaN,complete:true,solid:true,permanent:true});assert.equal(earliest(shot(),1/30,w).reason,'wall-witness');w.walls=[];w.projectiles.push({id:8,time:0,complete:false});assert.equal(earliest(shot(),1/30,w).reason,'interception-witness');});
test('earlier arena exit wins',()=>{const w=world();const s=shot();s.x=2220;w.bodies.push({id:2,x:2300,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});assert.equal(earliest(s,1/30,w).kind,'exit');});
test('comparator never mutates game objects',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});const s=shot(),before=JSON.stringify([s,w]);for(let i=0;i<20;i++)earliest(s,1/30,w);assert.equal(JSON.stringify([s,w]),before);});
test('tangent abstains rather than certifying',()=>{assert.equal(circleContact(0,21,6000,0,40,0,21,.005),undefined);});
test('seeded independent closest-approach differential',()=>{
 let seed=0x147234;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<10000;i++){
  const s=shot();s.vx=100+rnd()*9000;s.vy=(rnd()-.5)*5000;s.ttl=.001+rnd()*.02;
  const w=world(),x=(rnd()-.2)*170,y=(rnd()-.5)*90,r=8+rnd()*20;
  w.bodies.push({id:2,x,y,r,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});
  const until=Math.min(1/30,s.ttl),dx=-x,dy=-y,a=s.vx*s.vx+s.vy*s.vy;
  const t=Math.max(0,Math.min(until,-(dx*s.vx+dy*s.vy)/a));
  const dist=Math.hypot(dx+s.vx*t,dy+s.vy*t),rad=s.r+r;
  if(Math.abs(dist-rad)<1e-6)continue;
  assert.equal(earliest(s,1/30,w).kind==='body',dist<rad,'world '+i);
 }
});

test('remote-motion clearance never misses bounded sample trajectories',()=>{
 let seed=0x20261113;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<30000;i++){
  const s=shot();s.vx=(rnd()-.5)*18000;s.vy=(rnd()-.5)*18000;
  s.ttl=.002+rnd()*.025;
  const w=world(),cx=(rnd()-.5)*500,cy=(rnd()-.5)*500;
  const maxTravel=rnd()*100,r=2+rnd()*30;
  w.bodies.push({id:3,startX:cx,startY:cy,r,maxTravel,collisionEligible:true,radiusCertified:true,epoch:1});
  const event=earliest(s,1/30,w);
  if(event.kind==='abstain')continue;
  const limit=Math.min(s.ttl,1/30);
  for(let j=0;j<=12;j++){
   const t=limit*j/12,x=s.x+s.vx*t,y=s.y+s.vy*t;
   assert.ok(Math.hypot(x-cx,y-cy)>r+s.r+maxTravel,
     'unsafe moving-body clearance world '+i+' sample '+j);
  }
 }
});

test('uncertified eligibility, solidity and hostility abstain',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true});
 assert.equal(earliest(shot(),1/30,w).reason,'body-geometry');
 w.bodies=[];w.walls.push({id:9,time:.001,complete:true});
 assert.equal(earliest(shot(),1/30,w).reason,'wall-witness');
 w.walls=[];w.projectiles.push({id:9,time:.001,complete:true});
 assert.equal(earliest(shot(),1/30,w).reason,'interception-witness');
});

test('certified moving crossing resolves by relative motion',()=>{
 const w=world();w.bodies.push({id:3,startX:25,startY:20,vx:0,vy:-6000,
   r:10,certifiedLinear:true,linearDt:1/30,collisionEligible:true,radiusCertified:true,epoch:1});
 const e=earliest(shot(),1/30,w);
 assert.equal(e.kind,'body');assert.ok(e.time>0&&e.time<.005);
});
test('uncertified linear motion cannot masquerade as static',()=>{
 const w=world();w.bodies.push({id:3,startX:25,startY:20,vx:NaN,vy:-6000,
   r:10,certifiedLinear:true,linearDt:1/30,collisionEligible:true,radiusCertified:true,epoch:1});
 assert.equal(earliest(shot(),1/30,w).reason,'linear-witness');
});
test('seeded certified linear crossings match independent closest approach',()=>{
 let seed=0x2026147;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<15000;i++){
  const s=shot();s.vx=(rnd()-.5)*12000;s.vy=(rnd()-.5)*12000;
  s.ttl=.001+rnd()*.025;
  const w=world(),x=(rnd()-.5)*120,y=(rnd()-.5)*120,r=5+rnd()*20;
  const vx=(rnd()-.5)*6000,vy=(rnd()-.5)*6000;
  w.bodies.push({id:3,startX:x,startY:y,vx,vy,r,certifiedLinear:true,linearDt:1/30,collisionEligible:true,radiusCertified:true,epoch:1});
  const dx=-x,dy=-y,rvx=s.vx-vx,rvy=s.vy-vy,a=rvx*rvx+rvy*rvy;
  const until=Math.min(1/30,s.ttl);
  const t=a>0?Math.max(0,Math.min(until,-(dx*rvx+dy*rvy)/a)):0;
  const dist=Math.hypot(dx+rvx*t,dy+rvy*t),rad=s.r+r;
  if(Math.abs(dist-rad)<1e-6)continue;
  assert.equal(earliest(s,1/30,w).kind==='body',dist<rad,'world '+i);
 }
});

test('near tangent cannot certify expiry as the first event',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:21,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});
 assert.equal(earliest(shot(),1/30,w).reason,'uncertain-contact');
});
test('finite overflowing speed cannot certify no hit',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});
 const s=shot();s.vx=1e308;
 assert.equal(earliest(s,1/30,w).reason,'uncertain-contact');
});

test('translation and rotation preserve earliest event time',()=>{
 let seed=0x147e11;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<10000;i++){
  const s=shot();s.x=(rnd()-.5)*150;s.y=(rnd()-.5)*150;
  s.vx=(rnd()-.5)*9000;s.vy=(rnd()-.5)*9000;s.ttl=.002+rnd()*.015;
  const w=world();w.bodies.push({id:2,x:(rnd()-.5)*150,y:(rnd()-.5)*150,r:10+rnd()*20,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});
  w.bounds={minX:-1e6,maxX:1e6,minY:-1e6,maxY:1e6};
  const original=earliest(s,1/30,w);
  const dx=1200,dy=-500,angle=1.1,co=Math.cos(angle),si=Math.sin(angle);
  const transform=(x,y)=>[co*x-si*y+dx,si*x+co*y+dy];
  const [sx,sy]=transform(s.x,s.y),[vx,vy]=[co*s.vx-si*s.vy,si*s.vx+co*s.vy];
  const [bx,by]=transform(w.bodies[0].x,w.bodies[0].y);
  const moved={...s,x:sx,y:sy,vx,vy};
  const newWorld={...w,bodies:[{...w.bodies[0],x:bx,y:by}]};
  const result=earliest(moved,1/30,newWorld);
  assert.equal(result.kind,original.kind,'kind '+i);
  if(result.time!==undefined)assert.ok(Math.abs(result.time-original.time)<1e-8,'time '+i);
 }
});
test('body order does not change unique first event',()=>{
 const w=world();w.bodies=[
  {id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1},
  {id:3,x:80,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1}];
 const a=earliest(shot(),1/30,w);w.bodies.reverse();
 assert.deepEqual(earliest(shot(),1/30,w),a);
});

test('stale body epoch and linear dt cannot certify contact',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:0});
 assert.equal(earliest(shot(),1/30,w).reason,'body-geometry');
 w.bodies=[{id:3,startX:25,startY:20,vx:0,vy:-6000,r:10,
   certifiedLinear:true,linearDt:1/60,collisionEligible:true,radiusCertified:true,epoch:1}];
 assert.equal(earliest(shot(),1/30,w).reason,'linear-witness');
});

test('uncertified collision radius cannot understate a hitbox',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,
   collisionEligible:true,epoch:1});
 assert.equal(earliest(shot(),1/30,w).reason,'body-geometry');
 const s=shot();s.radiusCertified=false;
 assert.equal(earliest(s,1/30,world()).reason,'invalid-input');
});

test('contact at expiry boundary is uncertain, not a proven miss',()=>{
 const s=shot(),w=world();
 w.bodies.push({id:2,x:51,y:0,r:18,certifiedStationary:true,
  collisionEligible:true,radiusCertified:true,epoch:1});
 assert.equal(earliest(s,1/30,w).reason,'uncertain-contact');
 w.bodies[0].x=52;
 assert.equal(earliest(s,1/30,w).kind,'expiry');
});

test('destructible cover cannot be certified by static wall witness',()=>{
 const w=world();w.walls.push({id:9,time:.001,complete:true,solid:true,permanent:false});
 assert.equal(earliest(shot(),1/30,w).reason,'wall-witness');
});

test('newborn projectile cannot be backdated to frame start',()=>{
 const s=shot();s.frameStartEpoch=0;
 assert.equal(earliest(s,1/30,world()).reason,'invalid-input');
 const w=world();w.projectiles.push({id:9,time:.001,complete:true,hostile:true,frameStartEpoch:0});
 assert.equal(earliest(shot(),1/30,w).reason,'interception-witness');
});

test('piercing, previously-hit or unknown-owner shots abstain',()=>{
 const w=world();for(const [key,value] of [['pen',1],['hits',1],['ownerId',NaN]]){
  const s=shot();s[key]=value;
  assert.equal(earliest(s,1/30,w).reason,'invalid-input');
 }
});

test('unbounded world scans fail closed',()=>{
 const w=world();w.bodies=Array.from({length:193},(_,i)=>({id:i+1,x:1000,y:1000,r:10,
  certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1}));
 assert.equal(earliest(shot(),1/30,w).reason,'invalid-input');
});

test('wall and body at the same physical time abstain across event types',()=>{
 const w=world(),t=19/6000;
 w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,
  collisionEligible:true,radiusCertified:true,epoch:1});
 w.walls.push({id:9,time:t,complete:true,solid:true,permanent:true});
 assert.equal(earliest(shot(),1/30,w).reason,'tie');
});
test('hostile interception and body at the same physical time abstain',()=>{
 const w=world(),t=19/6000;
 w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,
  collisionEligible:true,radiusCertified:true,epoch:1});
 w.projectiles.push({id:9,time:t,complete:true,hostile:true,frameStartEpoch:1});
 assert.equal(earliest(shot(),1/30,w).reason,'tie');
});

test('certified remote movement cannot change an earlier local first event',()=>{
 let seed=0x147962;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<10000;i++){
  const s=shot(),w=world();
  const targetX=25+rnd()*25,targetY=(rnd()-.5)*10;
  w.bodies.push({id:2,x:targetX,y:targetY,r:18,certifiedStationary:true,
   collisionEligible:true,radiusCertified:true,epoch:1});
  const baseline=earliest(s,1/30,w);
  assert.equal(baseline.kind,'body','baseline '+i);
  const startX=200+rnd()*1500,startY=100+rnd()*1500,maxTravel=rnd()*40;
  w.bodies.push({id:3,startX,startY,maxTravel,r:18,collisionEligible:true,
   radiusCertified:true,epoch:1});
  assert.deepEqual(earliest(s,1/30,w),baseline,'remote exclusion changed first event '+i);
 }
});
test('uncertain nearby mover cannot be ignored even when local body contact is earlier',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true,
  collisionEligible:true,radiusCertified:true,epoch:1});
 w.bodies.push({id:3,startX:25,startY:25,maxTravel:10,r:18,
  collisionEligible:true,radiusCertified:true,epoch:1});
 assert.equal(earliest(shot(),1/30,w).reason,'moving-body-near-corridor');
});

test('frame-start exact tangency is uncertain rather than a certified hit',()=>{
 assert.equal(circleContact(0,21,6000,0,0,0,21,.005),undefined);
 assert.equal(circleContact(0,21,0,6000,0,0,21,.005),undefined);
 const w=world();w.bodies.push({id:2,x:0,y:21,r:18,
  certifiedStationary:true,collisionEligible:true,radiusCertified:true,epoch:1});
 assert.equal(earliest(shot(),1/30,w).reason,'uncertain-contact');
});
test('clear initial overlap is a real first event while clear separation remains a miss',()=>{
 assert.equal(circleContact(0,20,6000,0,0,0,21,.005),0);
 assert.equal(circleContact(0,22,6000,0,0,0,21,.005),null);
});

test('Cannon fuse rounds cannot masquerade as ordinary constant-velocity shots',()=>{
 const s=shot();s.__v17Cannon=true;
 assert.equal(earliest(s,1/30,world()).reason,'invalid-input');
});

test('Sniper rail identity cannot enter the ordinary first-event path',()=>{
 const s=shot();s.__novaRail=true;
 assert.equal(earliest(s,1/30,world()).reason,'invalid-input');
});

test('non-bullet entity cannot masquerade as a projectile',()=>{
 const s=shot();s.kind='shape';
 assert.equal(earliest(s,1/30,world()).reason,'invalid-input');
});
