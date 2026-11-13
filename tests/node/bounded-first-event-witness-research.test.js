'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {circleContact,earliestOrdinaryEvent:earliest}=require('../research/bounded-first-event-witness.cjs');
const shot=()=>({x:0,y:0,vx:6000,vy:0,r:3,ttl:.005,dead:false,shell:false,beam:false,splash:false});
const world=()=>({complete:true,bounds:{minX:-2230,maxX:2230,minY:-2230,maxY:2230},bodies:[],walls:[],projectiles:[]});
for(const fps of [30,60,120,240])test('physical body before TTL at '+fps+'Hz',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true});
 const event=earliest(shot(),1/fps,w);assert.equal(event.kind,'body');assert.equal(event.id,2);
 assert.ok(Math.abs(event.time-19/6000)<1e-12);
});
test('body beyond TTL cannot win',()=>{const w=world();w.bodies.push({id:2,x:100,y:0,r:18,certifiedStationary:true});assert.equal(earliest(shot(),1/30,w).kind,'expiry');});
test('permanent wall before body wins',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true});w.walls.push({id:9,time:.001,complete:true});assert.deepEqual(earliest(shot(),1/30,w),{kind:'wall',id:9,time:.001});});
test('wall after body cannot steal body',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true});w.walls.push({id:9,time:.004,complete:true});assert.equal(earliest(shot(),1/30,w).kind,'body');});
test('interception before body wins',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true});w.projectiles.push({id:9,time:.002,complete:true});assert.equal(earliest(shot(),1/30,w).kind,'interception');});
test('simultaneous body contacts abstain',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true},{id:3,x:40,y:0,r:18,certifiedStationary:true});assert.equal(earliest(shot(),1/30,w).reason,'tie');});
test('unknown movement abstains even far away',()=>{const w=world();w.bodies.push({id:2,x:1000,y:1000,r:18,certifiedStationary:false});assert.equal(earliest(shot(),1/30,w).reason,'body-motion');});
test('certified remote moving body does not veto local body',()=>{
 const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true});
 w.bodies.push({id:3,startX:500,startY:300,r:18,maxTravel:50});
 assert.equal(earliest(shot(),1/30,w).kind,'body');
});
test('bounded moving body near corridor abstains',()=>{
 const w=world();w.bodies.push({id:3,startX:40,startY:40,r:18,maxTravel:30});
 assert.equal(earliest(shot(),1/30,w).reason,'moving-body-near-corridor');
});
test('invalid cover/interception witness abstains',()=>{const w=world();w.walls.push({id:9,time:NaN,complete:true});assert.equal(earliest(shot(),1/30,w).reason,'wall-witness');w.walls=[];w.projectiles.push({id:8,time:0,complete:false});assert.equal(earliest(shot(),1/30,w).reason,'interception-witness');});
test('earlier arena exit wins',()=>{const w=world();const s=shot();s.x=2220;w.bodies.push({id:2,x:2300,y:0,r:18,certifiedStationary:true});assert.equal(earliest(s,1/30,w).kind,'exit');});
test('comparator never mutates game objects',()=>{const w=world();w.bodies.push({id:2,x:40,y:0,r:18,certifiedStationary:true});const s=shot(),before=JSON.stringify([s,w]);for(let i=0;i<20;i++)earliest(s,1/30,w);assert.equal(JSON.stringify([s,w]),before);});
test('tangent abstains rather than certifying',()=>{assert.equal(circleContact(0,21,6000,0,40,0,21,.005),null);});
test('seeded independent closest-approach differential',()=>{
 let seed=0x147234;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<10000;i++){
  const s=shot();s.vx=100+rnd()*9000;s.vy=(rnd()-.5)*5000;s.ttl=.001+rnd()*.02;
  const w=world(),x=(rnd()-.2)*170,y=(rnd()-.5)*90,r=8+rnd()*20;
  w.bodies.push({id:2,x,y,r,certifiedStationary:true});
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
  w.bodies.push({id:3,startX:cx,startY:cy,r,maxTravel});
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
