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
  assert.equal(base.terrainQueries,timed.terrainQueries);
  assert.ok(timed.updateMs>0&&timed.bulletsMs>=timed.collisionMs);
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
 for(const input of [{hz:0},{seconds:31},{extraShots:601},{seed:0},{instrument:1}])
  assert.throws(()=>run(input),/invalid FPS projectile pilot/);
});
test('suite carries explicit research limits and unambiguous stress metadata',()=>{
 const s=suite({seeds:[1517800],hzs:[30],seconds:1,extras:[0]});
 assert.equal(s.schema,1);assert.equal(s.observations.length,1);
 assert.equal(s.observations[0].extraShots,0);
 assert.ok(s.limitations.some(x=>x.includes('not device')));
});
