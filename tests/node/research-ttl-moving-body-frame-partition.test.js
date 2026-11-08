'use strict';
// Research-only physical first-contact oracle for issue #234. Away from exact\n// partition/tangency ties it checks temporal consistency. This is not a
// production collision owner and does not resolve terrain, piercing or damage.
const test = require('node:test');
const assert = require('node:assert/strict');

// Two discs travel linearly in continuous time. Return first strict overlap
// before both expiry and the observation horizon; abstain near tangency.
function contact(a, b, horizon) {
  const limit = Math.min(horizon, a.ttl, b.ttl);
  if (!(limit > 0) || !Number.isFinite(limit)) return null;
  const x = a.x-b.x, y = a.y-b.y;
  const vx = a.vx-b.vx, vy = a.vy-b.vy;
  const radius = a.r+b.r;
  const C = x*x+y*y-radius*radius;
  const A = vx*vx+vy*vy;
  const H = x*vx+y*vy;
  if (![C,A,H].every(Number.isFinite) || !(radius > 0)) return null;
  if (C < -1e-9*radius*radius) return 0;
  if (Math.abs(C) <= 1e-9*radius*radius || !(A > 0) || !(H < 0)) return null;
  const D = H*H-A*C;
  if (!(D > 64*Number.EPSILON*(Math.abs(H*H)+Math.abs(A*C)))) return null;
  const t = C/(-H+Math.sqrt(D));
  return t >= 0 && t < limit-1e-10 ? t : null;
}
function advance(s, dt) {
  return {...s,x:s.x+s.vx*dt,y:s.y+s.vy*dt,ttl:s.ttl-dt};
}
function splitContact(a,b,horizon,split) {
  const first=contact(a,b,split);
  if (first !== null) return first;
  if (split >= Math.min(a.ttl,b.ttl,horizon)) return null;
  const second=contact(advance(a,split),advance(b,split),horizon-split);
  return second === null ? null : split+second;
}
const bullet=(x,y,vx,vy,ttl,r=3)=>({x,y,vx,vy,ttl,r});

test('moving-body: physical first contact is invariant across frame partitions',()=>{
  const a=bullet(0,0,6000,0,.005), b=bullet(40,0,0,0,.005,18);
  const expected=19/6000;
  for(const hz of [30,60,120,240]) {
    const dt=1/hz;
    assert.ok(Math.abs(contact(a,b,dt)-expected)<1e-12);
    for(const split of [.0005,.002,.003,.004,.006,dt*.5]) {
      assert.ok(Math.abs(splitContact(a,b,dt,split)-expected)<1e-12);
    }
  }
});

test('moving-body: a contact after physical TTL cannot be revived by a split',()=>{
  const a=bullet(0,0,6000,0,.002),b=bullet(40,0,0,0,.02,18);
  for(const hz of [30,60,120,240]) {
    const dt=1/hz;
    assert.equal(contact(a,b,dt),null);
    for(const split of [.0005,.001,.002,.004,dt*.5])
      assert.equal(splitContact(a,b,dt,split),null);
  }
});

test('moving-body: translation, Galilean velocity and scale preserve contact time',()=>{
  const a=bullet(-30,5,6000,150,.01),b=bullet(30,5,-1000,150,.01,18);
  const t=contact(a,b,1/30);
  assert.ok(t!==null);
  for(const k of [.25,1,10]) {
    const A={...a,x:(a.x+123)*k,y:(a.y-75)*k,vx:(a.vx+700)*k,vy:(a.vy-90)*k,r:a.r*k};
    const B={...b,x:(b.x+123)*k,y:(b.y-75)*k,vx:(b.vx+700)*k,vy:(b.vy-90)*k,r:b.r*k};
    assert.ok(Math.abs(contact(A,B,1/30)-t)<1e-12);
  }
});

test('moving-body: seeded frame partitions agree with continuous first contact',()=>{
  let seed=0x20261108, compared=0, hits=0;
  const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  for(let i=0;i<20000;i++) {
    const a=bullet((rand()-.5)*100,(rand()-.5)*100,
      (rand()-.5)*12000,(rand()-.5)*12000,.001+rand()*.035,1+rand()*5);
    const b=bullet((rand()-.5)*100,(rand()-.5)*100,
      (rand()-.5)*12000,(rand()-.5)*12000,.001+rand()*.035,5+rand()*20);
    const dt=1/[30,60,120,240][i%4],split=dt*(.05+rand()*.9);
    const whole=contact(a,b,dt),parts=splitContact(a,b,dt,split);
    assert.equal(parts===null,whole===null,`trial ${i}: split=${split}`);
    if(whole!==null) { assert.ok(Math.abs(parts-whole)<1e-8,`trial ${i}`);hits++; }
    compared++;
  }
  assert.equal(compared,20000);
  assert.ok(hits>100);
});

test('moving-body: independent bisection agrees for constructed transverse contacts',()=>{
  let seed=0x15adbeef;
  const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  for(let i=0;i<5000;i++) {
    const radius=5+rand()*25, speed=3000+rand()*6000;
    const start=radius+1+rand()*80, tContact=(start-radius)/speed;
    const a=bullet(0,0,speed,0,tContact+.001+rand()*.02,3);
    const b=bullet(start,0,0,0,a.ttl,radius-3);
    const found=contact(a,b,1/30);
    assert.notEqual(found,null);
    // Independent signed-distance bisection: do not reuse the quadratic.
    let lo=0,hi=start/speed;
    for(let j=0;j<65;j++) {
      const mid=(lo+hi)*.5;
      if(Math.hypot(a.x+a.vx*mid-b.x,a.y-b.y)>radius)lo=mid;
      else hi=mid;
    }
    assert.ok(Math.abs(found-hi)<1e-10,`trial ${i}`);
    const split=tContact*(.1+rand()*.8);
    assert.ok(Math.abs(splitContact(a,b,1/30,split)-hi)<1e-10);
  }
});

test('moving-body: exact expiry, start tangency and near-tangency abstain',()=>{
  const a=bullet(0,0,1000,0,.01),b=bullet(31,0,0,0,.01,18);
  assert.equal(contact(a,b,1/30),null,'contact at exact expiry is not before expiry');
  assert.equal(contact({...a,ttl:.011},b,1/30),null,'other body expiry still vetoes');
  assert.equal(contact({...a,ttl:.011},{...b,ttl:.011},1/30),.01);
  assert.equal(contact(a,{...b,x:21},1/30),null,'start tangency is ambiguous');
  assert.equal(contact(a,{...b,x:40,y:21},1/30),null,'near tangent is not proof');
});

test('moving-body: contact exactly on a partition is conservatively ambiguous',()=>{
  const a=bullet(0,0,6000,0,.005),b=bullet(40,0,0,0,.005,18);
  const boundary=19/6000;
  assert.ok(Math.abs(contact(a,b,1/30)-boundary)<1e-12);
  // The research oracle abstains within 1e-10s of a segment boundary,
  // rather than inventing event order from floating-point noise.
  assert.equal(splitContact(a,b,1/30,boundary),null);
});
