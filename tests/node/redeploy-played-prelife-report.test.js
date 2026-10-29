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
      neutralXP:10,score:20,hp:80,alive:true,frontReached:null,
      blockedNearFrontSeconds:seed===1&&hz===30 ? .5 : 0};
    const returning={...fresh,postInsertion:{...postInsertion,enemyBodiesHash:'enemy-return'},
      neutralXP:16,score:25,hp:90,frontReached:4,
      blockedNearFrontSeconds:seed===1&&hz===30 ? 1.5 : .25};
    results.push({seed,hz,layout:'Crossfire',rotation:0,fresh,returning});
  }
  return {policy:'harvest_roam',preludeSeconds:8,seconds:12,
    protocolVersion:'terrain-clear-front-arrival-v2',results};
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
  assert.equal(summary.protocolVersion,'terrain-clear-front-arrival-v2');
  assert.equal(summary.frontArrivals.blockedNearFront.freshObservations,1);
  assert.equal(summary.frontArrivals.blockedNearFront.returnObservations,4);
  assert.equal(summary.frontArrivals.blockedNearFront.freshSeconds.mean,.125);
  assert.equal(summary.frontArrivals.blockedNearFront.returnSeconds.mean,.5625);
  assert.equal(summary.frontArrivals.blockedNearFront.returnMinusFreshSeconds.mean,.4375);
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
  assert.equal(summary.firstLife.independentNaturalDeathSeeds,2,
    'a death at either FPS is an exposed independent seed');
  assert.equal(summary.firstLife.independentNaturalDeathSeedsAtBothHz,1);
  assert.equal(summary.firstLife.independentForcedDeathSeeds,0);
  assert.equal(summary.firstLife.fpsDiscordantDeathSeeds,1,
    'a frame-rate-dependent natural death is evidence, not a fatal analysis error');
  assert.equal(summary.firstLife.naturalDeathExposureRate,1);
  assert.equal(summary.firstLife.bothHzNaturalDeathRate,.5);
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
  assert.equal(summary.firstLife.independentNaturalDeathSeedsAtBothHz,0);
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
  const s={policy:'harvest_roam',naturalExposurePilot:true,preludeSeconds:60,
    seconds:12,protocolVersion:'terrain-clear-front-arrival-v2',results};
  const summary=reportPlayedFirstLife(s,12);
  assert.equal(summary.independentSeeds,12);
  assert.equal(summary.firstLife.independentNaturalDeathSeeds,4);
  assert.equal(summary.firstLife.independentNaturalDeathSeedsAtBothHz,4);
  assert.equal(summary.firstLife.naturalDeathExposureRate,4/12);
  s.results[0].returning.deathTransitionTicks=0;
  assert.throws(()=>reportPlayedFirstLife(s,12),/Unmatched or skipped real death transition/);
  s.results[0].returning.deathTransitionTicks=s.results[0].fresh.deathTransitionTicks;
  s.preludeSeconds=8;
  assert.throws(()=>reportPlayedFirstLife(s,12),/predeclare 60s/);
});

test('FPS-discordant deaths are exposure, not zero-exposure censoring',()=>{
  const s=sample();
  for(const row of s.results) {
    row.fresh.prelude.naturalDeath =
      (row.seed===1&&row.hz===30)||(row.seed===2&&row.hz===60);
  }
  const summary=reportPlayedFirstLife(s,2);
  assert.equal(summary.firstLife.naturalDeaths,2);
  assert.equal(summary.firstLife.independentNaturalDeathSeeds,2);
  assert.equal(summary.firstLife.independentNaturalDeathSeedsAtBothHz,0);
  assert.equal(summary.firstLife.independentForcedDeathSeeds,0);
  assert.equal(summary.firstLife.fpsDiscordantDeathSeeds,2);
  assert.equal(summary.firstLife.naturalDeathExposureRate,1);
  assert.equal(summary.firstLife.bothHzNaturalDeathRate,0);
});
test('natural cohort refuses missing death flags and impossible elapsed times',()=>{
  const base=sample(),results=[];
  for(let seed=1;seed<=12;seed++)for(const hz of [30,60]){
    const row=base.results.find(r=>r.hz===hz);
    const prelude={...row.fresh.prelude,origin:{x:seed,y:hz},elapsed:60,
      ticks:60*hz,naturalDeath:false};
    const fresh={...row.fresh,prelude,origin:prelude.origin,
      fingerprintHash:'world-'+seed+'-'+hz,deathTransitionTicks:42};
    const returning={...row.returning,prelude,origin:prelude.origin,
      fingerprintHash:fresh.fingerprintHash,deathTransitionTicks:42};
    results.push({seed,hz,layout:'Crossfire',rotation:0,fresh,returning});
  }
  const s={policy:'harvest_roam',naturalExposurePilot:true,preludeSeconds:60,
    seconds:12,protocolVersion:'terrain-clear-front-arrival-v2',results};
  assert.equal(reportPlayedFirstLife(s,12).firstLife.independentForcedDeathSeeds,12);
  s.results[0].fresh.prelude.naturalDeath=undefined;
  assert.throws(()=>reportPlayedFirstLife(s,12),/Invalid natural-death exposure/);
  s.results[0].fresh.prelude.naturalDeath=false;
  s.results[0].fresh.prelude.elapsed=61;
  assert.throws(()=>reportPlayedFirstLife(s,12),/Invalid natural-death exposure/);
});

test('v2 rejects invalid blocked near-front exposure rather than inventing navigation evidence',()=>{
  const s=sample(),row=s.results[0];
  row.returning.blockedNearFrontSeconds=undefined;
  assert.throws(()=>reportPlayedFirstLife(s,2),/Invalid terrain-blocked/);
  row.returning.blockedNearFrontSeconds=-.1;
  assert.throws(()=>reportPlayedFirstLife(s,2),/Invalid terrain-blocked/);
  row.returning.blockedNearFrontSeconds=13;
  assert.throws(()=>reportPlayedFirstLife(s,2),/Invalid terrain-blocked/);
  row.returning.blockedNearFrontSeconds=1.5;
  row.returning.frontReached=NaN;
  assert.throws(()=>reportPlayedFirstLife(s,2),/Invalid terrain-clear arrival/);
  row.returning.frontReached=4;
  s.seconds=undefined;
  assert.throws(()=>reportPlayedFirstLife(s,2),/finite post-redeploy/);
});

test('natural-death v2 analysis refuses a legacy distance-only report',()=>{
  const s=sample();s.naturalExposurePilot=true;s.preludeSeconds=60;
  s.protocolVersion='legacy-distance-only';
  assert.throws(()=>reportPlayedFirstLife(s,12),/terrain-clear-front-arrival-v2/);
});
