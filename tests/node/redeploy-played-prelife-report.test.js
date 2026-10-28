'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {reportPlayedFirstLife} = require('../../scripts/redeploy-played-prelife-report.cjs');
function sample() {
  const results=[];
  for (const seed of [1,2]) for (const hz of [30,60]) {
    const prelude={origin:{x:seed,y:hz},elapsed:8,ticks:hz*8,naturalDeath:false,
      travelled:100,neutralXPEarned:5,changedShapes:3,changedEnemies:2,changedTerrain:0};
    const fresh={fingerprintHash:'played-'+seed+'-'+hz,origin:prelude.origin,prelude,
      neutralXP:10,score:20,hp:80,alive:true,frontReached:null};
    const returning={...fresh,neutralXP:16,score:25,hp:90,frontReached:4};
    results.push({seed,hz,layout:'Crossfire',rotation:0,fresh,returning});
  }
  return {policy:'harvest_roam',preludeSeconds:8,results};
}
test('post-combat report clusters FPS repeats and reports measured world changes',()=>{
  const summary=reportPlayedFirstLife(sample(),2);
  assert.equal(summary.independentSeeds,2);
  assert.equal(summary.fpsPairedObservations,4);
  assert.equal(summary.firstLife.worldsWithPhysicalChange,4);
  assert.equal(summary.returnMinusFresh.neutralXP.mean,6);
  assert.deepEqual(summary.returnMinusFresh.neutralXP.seedClusterBootstrap95,[6,6]);
  assert.equal(summary.frontArrivals.return,4);
  assert.equal(summary.frontArrivals.fresh,0);
});
test('rejects unmatched first lives, repeated FPS observations and missing seeds',()=>{
  const s=sample();
  s.results[0].returning.prelude={...s.results[0].returning.prelude,elapsed:7};
  assert.throws(()=>reportPlayedFirstLife(s,2),/Unmatched played first life/);
  s.results[0].returning.prelude=s.results[0].fresh.prelude;
  s.results[1].hz=30;
  assert.throws(()=>reportPlayedFirstLife(s,2),/Duplicate played-first-life/);
  s.results[1].hz=60;
  s.results.pop();
  assert.throws(()=>reportPlayedFirstLife(s,2),/Missing independent seeds/);
});
test('rejects instant-death and nonfinite outcomes',()=>{
  const s=sample();s.preludeSeconds=0;
  assert.throws(()=>reportPlayedFirstLife(s,2),/played-first-life/);
  s.preludeSeconds=8;s.results[0].returning.hp=NaN;
  assert.throws(()=>reportPlayedFirstLife(s,2),/Nonfinite outcome/);
});
