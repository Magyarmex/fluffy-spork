'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {reportPlayedFirstLife} = require('../../scripts/redeploy-played-prelife-report.cjs');
function sample() {
  const results=[];
  for (const seed of [1,2]) for (const hz of [30,60]) {
    const prelude={origin:{x:seed,y:hz},elapsed:8,ticks:hz*8,naturalDeath:false,
      travelled:100,neutralXPEarned:5,changedShapes:3,changedEnemies:2,changedTerrain:0};
    const postInsertion={enemyClassesHash:'classes',enemyBodiesHash:'enemy-fresh',
      neutralBodiesHash:'neutral-fresh'};
    const fresh={fingerprintHash:'played-'+seed+'-'+hz,origin:prelude.origin,prelude,postInsertion,
      neutralXP:10,score:20,hp:80,alive:true,frontReached:null};
    const returning={...fresh,postInsertion:{...postInsertion,enemyBodiesHash:'enemy-return'},
      neutralXP:16,score:25,hp:90,frontReached:4};
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
  assert.equal(summary.postInsertionParity.sameEnemyClassSequence,4);
  assert.equal(summary.postInsertionParity.sameEnemyBodies,0);
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

test('natural-death exposure counts independent seeds and retains FPS disagreement',()=>{
  const s=sample();
  for(const row of s.results){
    if(row.seed===1 || (row.seed===2&&row.hz===30))
      row.fresh.prelude.naturalDeath=true;
  }
  const summary=reportPlayedFirstLife(s,2);
  assert.equal(summary.firstLife.naturalDeaths,3,'raw FPS observations are reported');
  assert.equal(summary.firstLife.independentNaturalDeathSeeds,1);
  assert.equal(summary.firstLife.independentForcedDeathSeeds,0);
  assert.equal(summary.firstLife.fpsDiscordantDeathSeeds,1,
    'a frame-rate-dependent natural death is evidence, not a fatal analysis error');
  assert.equal(summary.firstLife.naturalDeathExposureRate,.5);
  assert.equal(summary.firstLife.primary30Hz.naturalDeaths,2);
  assert.equal(summary.firstLife.technical60Hz.naturalDeaths,1);
  assert.equal(summary.firstLife.primary30Hz.meanNaturalDeathTime,8);
  assert.equal(summary.firstLife.technical60Hz.forcedDeaths,1);
  assert.match(summary.firstLife.censoringNote,/Forced-death/);
});
test('zero natural deaths is reported as zero rather than disguised as natural play',()=>{
  const summary=reportPlayedFirstLife(sample(),2);
  assert.equal(summary.firstLife.naturalDeaths,0);
  assert.equal(summary.firstLife.independentNaturalDeathSeeds,0);
  assert.equal(summary.firstLife.independentForcedDeathSeeds,2);
  assert.equal(summary.firstLife.fpsDiscordantDeathSeeds,0);
  assert.equal(summary.firstLife.naturalDeathExposureRate,0);
  assert.equal(summary.firstLife.primary30Hz.meanNaturalDeathTime,null);
  assert.equal(summary.firstLife.technical60Hz.naturalDeaths,0);
});

test('60s natural cohort refuses to treat an unplayed death transition as real redeploy',()=>{
  const original=sample(),results=[];
  for(let seed=1;seed<=12;seed++)for(const hz of [30,60]){
    const base=original.results.find(r=>r.hz===hz);
    const prelude={...base.fresh.prelude,origin:{x:seed,y:hz},elapsed:60,
      ticks:60*hz,naturalDeath:seed%3===0};
    const fresh={...base.fresh,prelude,origin:prelude.origin,
      fingerprintHash:'world-'+seed+'-'+hz,deathTransitionTicks:Math.ceil(1.4*hz)};
    const returning={...base.returning,prelude,origin:prelude.origin,
      fingerprintHash:fresh.fingerprintHash,deathTransitionTicks:fresh.deathTransitionTicks};
    results.push({seed,hz,layout:'Crossfire',rotation:0,fresh,returning});
  }
  const s={policy:'harvest_roam',naturalExposurePilot:true,preludeSeconds:60,results};
  assert.equal(reportPlayedFirstLife(s,12).independentSeeds,12);
  s.results[0].returning.deathTransitionTicks=0;
  assert.throws(()=>reportPlayedFirstLife(s,12),/Unmatched or skipped real death transition/);
  s.results[0].returning.deathTransitionTicks=s.results[0].fresh.deathTransitionTicks;
  s.preludeSeconds=8;
  assert.throws(()=>reportPlayedFirstLife(s,12),/predeclare 60s/);
});
