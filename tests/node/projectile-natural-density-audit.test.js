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

test('pen=1 census records witnessed canonical ordinary shots and expiry separately',()=>{
 const b=(id,ttl=1)=>({...shot(id),kind:'bullet',ownerId:9,ttl});
 const g={bullets:[b(1,.005),b(2,.5),{...b(3),shell:true},
  {...b(4),hits:1},{...b(5),pen:2}],
  __novaShapeSweepActive:true,__novaFrameStartBulletEpoch:7,
  __novaShapeSweepEpoch:7,__novaFrameStartBulletIdCeiling:10,
  updateBullets(){return 'untouched';}};
 const original=JSON.stringify(g.bullets);
 const a=census.install(g,census.create());
 assert.equal(g.updateBullets(.01),'untouched');
 assert.equal(JSON.stringify(g.bullets),original);
 assert.equal(a.penOneShotInputs,2);
 assert.equal(a.penOneExpiringInputs,1);
 assert.equal(a.penOneRawExpiringInputs,1);
 assert.equal(a.penOneFramesWithInputs,1);
 assert.equal(a.penOneUnknownKindInputs,0);
 assert.equal(a.penOneWithoutEpochInputs,0);
 assert.equal(a.penOneScanCensoredFrames,0);
});

test('pen=1 census distinguishes missing kind, missing witness, newborn and overload',()=>{
 const b=(id)=>({...shot(id),kind:'bullet',ownerId:9});
 const g={bullets:[b(1)],__novaShapeSweepActive:true,
  __novaFrameStartBulletEpoch:5,__novaShapeSweepEpoch:5,
  __novaFrameStartBulletIdCeiling:4,updateBullets(){}};
 const a=census.install(g,census.create());
 g.bullets=[{...b(1),kind:undefined}];g.updateBullets(.01);
 assert.equal(a.penOneUnknownKindInputs,1);
 assert.equal(a.penOneShotInputs,0);
 g.bullets=[b(1)];g.__novaShapeSweepActive=false;g.updateBullets(.01);
 assert.equal(a.penOneWithoutEpochInputs,1);
 g.__novaShapeSweepActive=true;g.bullets=[b(4)];g.updateBullets(.01);
 assert.equal(a.penOneWithoutEpochInputs,2,'newborn is not witnessed');
 g.bullets=[{...b(1),vx:NaN}];g.updateBullets(.01);
 assert.equal(a.penOneShotInputs,0,'invalid velocity is excluded');
 g.bullets=Array.from({length:257},(_,i)=>b(i));g.updateBullets(.01);
 assert.equal(a.penOneScanCensoredFrames,1,'oversized scans are reported');
 assert.equal(a.penOneShotInputs,0);
});

test('pen=1 census never claims a certified hit from a necessary shot-local input',()=>{
 const g={bullets:[{...shot(1),kind:'bullet',ownerId:4}],
  __novaShapeSweepActive:true,__novaFrameStartBulletEpoch:1,
  __novaShapeSweepEpoch:1,__novaFrameStartBulletIdCeiling:2};
 const s=census.before(g,.01);
 assert.equal(s.penOne,1);
 assert.equal(s.penOneExpiring,0);
 assert.equal(Object.hasOwn(s,'certifiedHit'),false);
});

test('raw pen-one prevalence remains visible when strict dead witness is missing',()=>{
 const g={bullets:[{...shot(1),kind:'bullet',ownerId:2,dead:undefined}],
  __novaShapeSweepActive:true,__novaFrameStartBulletEpoch:1,
  __novaShapeSweepEpoch:1,__novaFrameStartBulletIdCeiling:2};
 const a=census.create(),sample=census.before(g,.01);
 census.after(a,sample,g);
 assert.equal(a.penOneRawInputs,1);
 assert.equal(a.penOneRawExpiringInputs,0);
 assert.equal(a.penOneMissingDeadInputs,1);
 assert.equal(a.penOneShotInputs,0,'unknown death state cannot be certified');
});

test('pen-one audit is injected only in research and survives natural-match serialization',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.resolve(__dirname,'../..');
 const natural=fs.readFileSync(path.join(root,'tests/browser/frontlines-natural-match-ab.cjs'),'utf8');
 const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(natural,/g\.__novaProjectileDensityAudit=density\.install\(g,density\.create\(\)\)/);
 assert.match(natural,/projectileDensityAudit:g\.__novaProjectileDensityAudit/);
 assert.doesNotMatch(shipping,/projectile-density-audit\.js/);
});
