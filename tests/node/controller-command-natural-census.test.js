'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const census=require('../research/controller-command-natural-census.cjs');
function drone(epoch=7){
 return {id:4,ownerId:2,hp:30,r:8,x:20,y:0,
  __novaChronoDroneEpoch:epoch,__novaChronoDronePrevX:20,
  __novaChronoDronePrevY:0,__novaChronoCommandRawEpoch:epoch,
  __novaChronoCommandBoundedEpoch:epoch,__novaChronoCommandRawDt:.016,
  __novaChronoCommandRawX:20,__novaChronoCommandRawY:0,
  __novaChronoCommandRawEndX:20,__novaChronoCommandRawEndY:0,
  __novaChronoCommandSpeedBound:200};
}
function bullet(x=0){
 return {id:9,ownerId:1,x,y:0,vx:2500,vy:0,r:3,ttl:.004,
  dead:false,shell:false,beam:false,splash:0,pen:0,hits:0};
}
test('read-only witness identifies certified positive-time overlap without awarding damage',()=>{
 const d=drone(),b=bullet(),g={__novaShapeSweepEpoch:7,__novaShapeSweepActive:true,
  __novaFrameStartBulletEpoch:7,__novaFrameStartBulletIdCeiling:10,drones:[d],
  bullets:[b],updateBullets(){return 42;}};
 const a=census.install(g,census.create()),original=JSON.stringify({d,b});
 assert.equal(g.updateBullets(.016),42);
 assert.equal(JSON.stringify({d,b}),original,'observer mutated bodies');
 assert.equal(a.frames,1);assert.equal(a.commandCertifiedDrones,1);
 assert.equal(a.expiringShots,1);assert.equal(a.witnessedExpiringShots,1);
 assert.equal(a.rawPenZeroHitsZero,1);assert.equal(a.possiblePairs,1);
 assert.equal(a.geometricGuarantees,1);
 assert.equal(a.eligiblePenZero,1);assert.equal(a.eligiblePenOne,0);
 assert.equal(a.possiblePenZero,1);assert.equal(a.guaranteedPenZero,1);
 assert.equal(a.certifiedDroneHpLossEvents,0);
 assert.equal(a.observerErrors,0);
});
test('expired, friendly and unbounded drones cannot become certified contacts',()=>{
 const d=drone(),b=bullet(),g={__novaShapeSweepEpoch:7,__novaShapeSweepActive:true,
  __novaFrameStartBulletEpoch:7,__novaFrameStartBulletIdCeiling:10,drones:[d],
  bullets:[b],updateBullets(){}},a=census.install(g,census.create());
 b.ownerId=d.ownerId;g.updateBullets(.016);
 assert.equal(a.possiblePairs,0);
 b.ownerId=1;d.__novaChronoCommandBoundedEpoch=6;g.updateBullets(.016);
 assert.equal(a.commandCertifiedDrones,1,'only first frame certified');
 b.ttl=-1;d.__novaChronoCommandBoundedEpoch=7;g.updateBullets(.016);
 assert.equal(a.expiringShots,2);
 assert.equal(a.geometricGuarantees,0);
});
test('observer records damage from actual projectile owner but does not modify it',()=>{
 const d=drone(),g={__novaShapeSweepEpoch:7,__novaShapeSweepActive:true,
  __novaFrameStartBulletEpoch:7,__novaFrameStartBulletIdCeiling:10,drones:[d],bullets:[bullet()],
  updateBullets(){d.hp-=7;return 'damage';}};
 const a=census.install(g,census.create());
 assert.equal(g.updateBullets(.016),'damage');
 assert.equal(d.hp,23);assert.equal(a.certifiedDroneHpLossEvents,1);
 assert.equal(a.certifiedDroneHpLost,7);
});
test('geometry is finite and conservative outside reachable corridor',()=>{
 assert.equal(census.distanceSegment(10,0,0,0,20,0),0);
 assert.equal(census.distanceSegment(10,10,0,0,20,0),10);
 assert.equal(census.distanceSegment(40,0,0,0,20,0),20);
 const d=drone(),b=bullet(100),g={__novaShapeSweepEpoch:7,__novaShapeSweepActive:true,
  __novaFrameStartBulletEpoch:7,__novaFrameStartBulletIdCeiling:10,
  drones:[d],bullets:[b]};
 assert.equal(census.before(g,.016).possible,0);
 b.x=0;b.id=10;
 assert.equal(census.before(g,.016).witnessed,0,
  'newborn projectile is not falsely counted as pre-frame, but may still be a valid geometric candidate');
});

test('one-penetration TTL shots enter the actual eligibility census, higher penetration stays excluded',()=>{
 const d=drone(),b=bullet();b.pen=1;
 const g={__novaShapeSweepEpoch:7,__novaShapeSweepActive:true,
  __novaFrameStartBulletEpoch:7,__novaFrameStartBulletIdCeiling:10,
  drones:[d],bullets:[b],updateBullets(){}};
 const a=census.install(g,census.create());
 g.updateBullets(.016);
 assert.equal(a.eligiblePenOne,1);assert.equal(a.eligiblePenZero,0);
 assert.equal(a.expiringShots,1);assert.equal(a.possiblePenOne,1);
 assert.equal(a.guaranteedPenOne,1);
 assert.equal(a.possiblePairs,a.possiblePenZero+a.possiblePenOne);
 assert.equal(a.geometricGuarantees,a.guaranteedPenZero+a.guaranteedPenOne);
 b.pen=2;g.updateBullets(.016);
 assert.equal(a.expiringShots,1,'higher penetration must not inherit pen=1 certificate');
 assert.equal(a.rawPenPositiveHitsZero,2,'raw observer retains excluded shots');
 assert.equal(a.observerErrors,0);
});
