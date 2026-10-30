'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const census=require('../browser/projectile-density-audit.js');
function shot(id){return {id,x:0,y:0,vx:500,vy:0,r:3,dmg:12,ttl:1,pen:1,hits:0,dead:false};}
test('read-only census records necessary 3..8-shot gates and physical cover-break context',()=>{
 const g={bullets:[shot(1),shot(2),shot(3)],__novaBattlefield:{coverBroken:0},
  __novaShapeSweepActive:true,__novaFrameStartBulletEpoch:4,__novaShapeSweepEpoch:4,
  __novaFrameStartBulletIdCeiling:100,updateBullets(dt){
   assert.equal(this,g);
   assert.equal(dt,.01);
   this.__novaBattlefield.coverBroken++;
   return 42;
  }};
 const originalShots=JSON.stringify(g.bullets),a=census.install(g,census.create());
 assert.equal(g.updateBullets(.01),42);
 assert.equal(JSON.stringify(g.bullets),originalShots,'observer must not mutate projectiles');
 assert.equal(a.basicEligibleFrames,1);
 assert.equal(a.coverBreaksBasicEligible,1);
 g.bullets=Array.from({length:9},(_,i)=>shot(i+1));
 g.updateBullets(.01);
 assert.equal(a.coverBreaksAboveEight,1);
 g.bullets=[shot(1),{...shot(2),shell:true},shot(3)];
 g.updateBullets(.01);
 assert.equal(a.basicEligibleFrames,1,'special shots veto necessary gate');
 g.bullets=[];
 g.updateBullets(.01);
 assert.deepEqual(a.projectileCountBuckets,{
  zero:1,one:0,two:0,threeToEight:2,nineToSixteen:1,
  seventeenToThirtyTwo:0,thirtyThreePlus:0});
 assert.equal(a.bulletUpdateCalls,4);
 assert.equal(a.coverBreaks,4);
 assert.equal(a.coverBreaksAtThreeToEight,2);
 assert.equal(a.coverBreaksBasicEligible,1);
 assert.equal(a.peakProjectiles,9);
 assert.equal(a.projectileCountSum,15);
 assert.ok(Math.abs(a.simulatedBulletSeconds-.04)<1e-12);
});
test('the basic gate rejects newborn, expiring, invalid, and unwitnessed rounds',()=>{
 const g={bullets:[shot(1),shot(2),shot(3)],__novaBattlefield:{coverBroken:0},
  __novaShapeSweepActive:true,__novaFrameStartBulletEpoch:7,__novaShapeSweepEpoch:7,
  __novaFrameStartBulletIdCeiling:4};
 assert.equal(census.before(g,.01).eligible,true);
 g.bullets[2].ttl=.01;
 assert.equal(census.before(g,.01).eligible,false,'expiry within frame');
 g.bullets[2].ttl=1;g.__novaFrameStartBulletIdCeiling=3;
 assert.equal(census.before(g,.01).eligible,false,'newborn id');
 g.__novaFrameStartBulletIdCeiling=4;g.__novaShapeSweepActive=false;
 assert.equal(census.before(g,.01).eligible,false,'missing motion witness');
 g.__novaShapeSweepActive=true;g.bullets[1].vx=NaN;
 assert.equal(census.before(g,.01).eligible,false,'invalid trajectory');
});
test('counter resets are censored instead of fabricated as negative breaks',()=>{
 const g={bullets:[],__novaBattlefield:{coverBroken:5}};
 const a=census.create(),s=census.before(g,.01);
 g.__novaBattlefield.coverBroken=0;census.after(a,s,g);
 assert.equal(a.brokenCounterResets,1);
 assert.equal(a.coverBreaks,0);
});
