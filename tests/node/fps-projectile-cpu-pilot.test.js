'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run,suite}=require('../research/fps-projectile-cpu-pilot.cjs');
test('CPU instrumentation is physically and RNG transparent in actual composed game',()=>{
 for(const extraShots of [0,160]){
  const base=run({seed:1517800,hz:60,seconds:2,extraShots,instrument:false});
  const timed=run({seed:1517800,hz:60,seconds:2,extraShots,instrument:true});
  assert.equal(base.physicalHash,timed.physicalHash);
  assert.equal(base.rngDraws,timed.rngDraws);
  assert.equal(base.peakProjectiles,timed.peakProjectiles);
  assert.equal(base.playerVolleys,timed.playerVolleys);
  assert.equal(base.playerEmittedProjectiles,timed.playerEmittedProjectiles);
  assert.ok(timed.playerVolleys>0);
  assert.equal(base.terrainQueries,timed.terrainQueries);
  assert.ok(timed.updateMs>0&&timed.bulletsMs>=timed.collisionMs);
  assert.equal(base.meanRails,timed.meanRails,'read-only timing must not change live rail occupancy');
  assert.equal(base.peakRails,timed.peakRails);
  assert.equal(base.railEmitted,timed.railEmitted);
  assert.ok(Number.isFinite(timed.meanRails)&&timed.meanRails>=0);
  assert.ok(timed.peakRails<=timed.peakProjectiles);
 }
});
test('repeated seeded pilot produces identical state at 30Hz and 60Hz',()=>{
 for(const hz of [30,60]){
  const a=run({seed:1517802,hz,seconds:2,extraShots:0});
  const b=run({seed:1517802,hz,seconds:2,extraShots:0});
  assert.equal(a.physicalHash,b.physicalHash);
  assert.equal(a.rngDraws,b.rngDraws);
  assert.equal(a.ticks,2*hz);
 }
});
test('pilot rejects invalid or unbounded workloads',()=>{
 for(const input of [{hz:0},{seconds:31},{extraShots:601},{seed:0},{instrument:1},{prechargeRail:true}])
  assert.throws(()=>run(input),/invalid FPS projectile pilot/);
});
test('suite carries explicit research limits and unambiguous stress metadata',()=>{
 const s=suite({seeds:[1517800],hzs:[30],seconds:1,extras:[0]});
 assert.equal(s.schema,1);assert.equal(s.observations.length,1);
 assert.equal(s.observations[0].extraShots,0);
 assert.ok(s.limitations.some(x=>x.includes('not device')));
 const mixed=suite({seeds:[1517800],hzs:[60],seconds:2,extras:[0],classes:['tempest','railgun']});
 assert.deepEqual(mixed.observations.map(x=>x.cls),['tempest','railgun']);
 assert.equal(mixed.classes.length,2);
 assert.ok(mixed.observations[1].playerRailEmitted>0);
 console.log('NOVA_RAIL_DENSITY '+JSON.stringify(mixed.observations.map(({cls,meanProjectiles,meanRails,peakRails,playerVolleys,railEmitted,playerRailEmitted})=>({cls,meanProjectiles,meanRails,peakRails,playerVolleys,railEmitted,playerRailEmitted}))));
});

test('rail occupancy is measured from actual composed projectile objects',()=>{
 const a=run({seed:1517800,hz:60,seconds:3,extraShots:0,cls:'railgun',prechargeRail:true});
 const b=run({seed:1517800,hz:60,seconds:3,extraShots:0,cls:'railgun',prechargeRail:true});
 assert.ok(a.playerVolleys>0,'real railgun firing must occur');
 assert.equal(a.prechargeRail,true,'wall-clock focus is a declared synthetic research control');
 assert.ok(a.playerRailEmitted>0,'the shipping rail marker must be observed at actual shot creation');
 assert.ok(a.railEmitted>=a.playerRailEmitted);
 assert.ok(a.meanRails>=0&&a.meanRails<=a.peakRails,
  'same-tick rail death may legitimately leave zero pre-update occupancy');
 assert.equal(a.peakRails,b.peakRails);
 assert.equal(a.meanRails,b.meanRails);
 assert.equal(a.physicalHash,b.physicalHash);
});
