'use strict';
// Read-only research certificate for projectile interception before TTL.
// Does not change combat; deliberately abstains without complete obstacle data.
const test = require('node:test');
const assert = require('node:assert/strict');
const {firstContact}=require('../research/projectile-first-event-certificate.cjs');
const shot=(x,vx,ownerId,ttl=.005,y=0,vy=0)=>({kind:'bullet',x,y,vx,vy,ownerId,ttl,r:3,pen:0,hits:0,dead:false,shell:false,beam:false});
const a=()=>shot(-20,6000,1), b=()=>shot(20,-6000,2), complete={
  allied:false,complete:true,unscanned:false,aTerrain:null,bTerrain:null,
  aBody:null,bBody:null,aOtherProjectile:null,bOtherProjectile:null
};
test('30/60/120/240Hz preserve same certified first-contact time',()=>{
  for(const fps of [30,60,120,240]) assert.ok(Math.abs(firstContact(a(),b(),1/fps,complete)-32.5/12000)<1e-12);
});
test('earlier terrain, body or third projectile veto certification',()=>{
  for(const key of ['aTerrain','bTerrain','aBody','bBody','aOtherProjectile','bOtherProjectile'])
    assert.equal(firstContact(a(),b(),1/30,{...complete,[key]:.002}),null);
});
test('later obstacles cannot erase earlier contact',()=>{
  assert.ok(firstContact(a(),b(),1/30,{...complete,aTerrain:.004,bBody:.0045})>0);
});
test('ties abstain rather than choosing an arbitrary collision',()=>{
  assert.equal(firstContact(a(),b(),1/30,{...complete,aTerrain:32.5/12000}),null);
});
test('unknown allegiance or incomplete obstacle scan abstains',()=>{
  assert.equal(firstContact(a(),b(),1/30,{allied:false}),null);
  assert.equal(firstContact(a(),b(),1/30,{complete:true}),null);
  assert.equal(firstContact(a(),b(),1/30,{...complete,unscanned:true}),null);
  assert.equal(firstContact(a(),b(),1/30,{...complete,allied:null}),null);
  assert.equal(firstContact(a(),b(),1/30,{...complete,complete:false}),null);
  const {aBody,...incomplete}=complete;
  assert.equal(firstContact(a(),b(),1/30,incomplete),null);
});
test('allied and same-owner shots do not intercept',()=>{
  assert.equal(firstContact(a(),b(),1/30,{...complete,allied:true}),null);
  assert.equal(firstContact(a(),{...b(),ownerId:1},1/30,complete),null);
});
test('shell, dead, expired, nonfinite and malformed shots abstain',()=>{
  for(const patch of [{kind:'shape'},{shell:true},{beam:true},{splash:true},{__v17Cannon:true},{__novaRail:true},{pen:1},{hits:1},{dead:true},{dead:undefined},{shell:undefined},{beam:undefined},{hits:NaN},{ttl:0},{vx:NaN},{r:-1},{ownerId:undefined}])
    assert.equal(firstContact({...a(),...patch},b(),1/30,complete),null);
});
test('first contact beyond TTL or frame is not certified',()=>{
  assert.equal(firstContact({...a(),ttl:.001},b(),1/30,complete),null);
  assert.equal(firstContact(a(),b(),.001,complete),null);
});
test('arena exit before contact vetoes certification',()=>{
  assert.equal(firstContact(shot(2225,6000,1),shot(2265,-6000,2),1/30,complete),null);
  assert.equal(firstContact(shot(2200,6000,1,.05),shot(2220,5000,2,.05),1/30,complete),null);
});
test('physical near miss remains a miss',()=>{
  assert.equal(firstContact(a(),{...b(),y:8},1/30,complete),null);
});
test('partitioning preserves the same absolute first-contact time',()=>{
  const x=a(),y=b(),before=firstContact(x,y,1/30,complete),dt=.002;
  const x2={...x,x:x.x+x.vx*dt,ttl:x.ttl-dt},y2={...y,x:y.x+y.vx*dt,ttl:y.ttl-dt};
  assert.ok(Math.abs(before-dt-firstContact(x2,y2,1/30-dt,complete))<1e-12);
});
test('classification never mutates the supplied projectile state',()=>{
  const x=a(),y=b(),before=JSON.stringify([x,y]);
  firstContact(x,y,1/30,complete);
  assert.equal(JSON.stringify([x,y]),before);
});

test('10,000 seeded certificates have physical contact before all known cutoffs',()=>{
  let seed=0x1a2b3c4d;
  const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  let certified=0;
  for(let i=0;i<10000;i++){
    const x=shot(-100+rand()*100,200+rand()*1000,1,.003+rand()*.06,-100+rand()*200,-1000+rand()*2000);
    const y=shot(rand()*100,-200-rand()*1000,2,.003+rand()*.06,-100+rand()*200,-1000+rand()*2000);
    const dt=[.004,1/240,1/120,1/60,1/30][i%5];
    const t=firstContact(x,y,dt,complete);
    if(t===null)continue;
    certified++;
    const dx=x.x+x.vx*t-y.x-y.vx*t,dy=x.y+x.vy*t-y.y-y.vy*t;
    assert.ok(Math.abs(Math.hypot(dx,dy)-x.r-y.r-1.5)<1e-5);
    assert.ok(t<Math.min(dt,x.ttl,y.ttl));
  }
  assert.ok(certified>10,'seed must exercise real interceptions');
});
