'use strict';
// Report paired total-policy effects after actual first-life play. Repeated
// 30/60Hz observations are *not* independent seeds. Do not compare these
// outcomes with instant-death runs as if they share a physical world.
const fs = require('node:fs');
const {clusteredBootstrap} = require('./redeploy-pilot-analysis.cjs');
function mean(a) {return a.reduce((s, x) => s + x, 0) / a.length;}
function reportPlayedFirstLife(report, expectedSeeds = 36) {
  if (!report || !(report.preludeSeconds > 0) ||
      !Array.isArray(report.results) || !report.results.length)
    throw Error('Expected nonempty played-first-life pilot');
  if(report.naturalExposurePilot && (report.preludeSeconds!==60 || expectedSeeds!==12))
    throw Error('Natural-death cohort must predeclare 60s and 12 independent seeds');
  const seen = new Set(), bySeed = new Map(), layouts = new Set(), rows = [];
  for (const row of report.results) {
    const key = row.seed + '/' + row.hz;
    if (seen.has(key)) throw Error('Duplicate played-first-life world: ' + key);
    seen.add(key);
    if (![30, 60].includes(row.hz)) throw Error('Unexpected frame rate: ' + key);
    const a = row.fresh, b = row.returning;
    if (!a?.prelude || !b?.prelude || !a.fingerprintHash ||
        a.fingerprintHash !== b.fingerprintHash ||
        JSON.stringify(a.prelude) !== JSON.stringify(b.prelude) ||
        JSON.stringify(a.origin) !== JSON.stringify(a.prelude.origin) ||
        JSON.stringify(b.origin) !== JSON.stringify(a.prelude.origin))
      throw Error('Unmatched played first life: ' + key);
    if (!a.postInsertion || !b.postInsertion ||
        !a.postInsertion.enemyClassesHash || !b.postInsertion.enemyClassesHash ||
        !a.postInsertion.enemyBodiesHash || !b.postInsertion.enemyBodiesHash ||
        !a.postInsertion.neutralBodiesHash || !b.postInsertion.neutralBodiesHash)
      throw Error('Missing read-only post-insertion fingerprints: ' + key);
    if(report.naturalExposurePilot && (!Number.isInteger(a.deathTransitionTicks) ||
        a.deathTransitionTicks<=0 || a.deathTransitionTicks!==b.deathTransitionTicks))
      throw Error('Unmatched or skipped real death transition: '+key);
    if (a.prelude.elapsed <= 0 || a.prelude.ticks <= 0)
      throw Error('Missing real first-life ticks: ' + key);
    if (!Number.isFinite(a.neutralXP) || !Number.isFinite(b.neutralXP) ||
        !Number.isFinite(a.hp) || !Number.isFinite(b.hp) ||
        !Number.isFinite(a.score) || !Number.isFinite(b.score))
      throw Error('Nonfinite outcome: ' + key);
    layouts.add(row.layout + '/' + row.rotation);
    const p = a.prelude;
    if(report.naturalExposurePilot &&
       (typeof p.naturalDeath !== 'boolean' ||
        !(p.elapsed <= report.preludeSeconds + 1 / row.hz + 1e-6)))
      throw Error('Invalid natural-death exposure/censoring record: ' + key);
    const entry = {seed:row.seed, hz:row.hz, naturalDeath:p.naturalDeath,
      preludeElapsed:p.elapsed, preludeTravel:p.travelled,
      preludeNeutralXP:p.neutralXPEarned, preludeChangedShapes:p.changedShapes,
      preludeChangedEnemies:p.changedEnemies, preludeChangedTerrain:p.changedTerrain,
      sameEnemyClasses:a.postInsertion.enemyClassesHash===b.postInsertion.enemyClassesHash,
      sameEnemyBodies:a.postInsertion.enemyBodiesHash===b.postInsertion.enemyBodiesHash,
      sameNeutralBodies:a.postInsertion.neutralBodiesHash===b.postInsertion.neutralBodiesHash,
      neutralGap:b.neutralXP-a.neutralXP, scoreGap:b.score-a.score,
      hpGap:b.hp-a.hp, survivalGap:Number(b.alive)-Number(a.alive),
      freshReached:a.frontReached!==null, returnReached:b.frontReached!==null};
    rows.push(entry);
    if (!bySeed.has(row.seed)) bySeed.set(row.seed, []);
    bySeed.get(row.seed).push(entry);
  }
  if (bySeed.size !== expectedSeeds || rows.length !== 2 * expectedSeeds ||
      [...bySeed.values()].some(group => group.length !== 2 ||
        new Set(group.map(r => r.hz)).size !== 2))
    throw Error('Missing independent seeds or FPS repeats');
  const clustered = field => [...bySeed.values()].map(group => mean(group.map(x => x[field])));
  const metric = field => ({mean:mean(rows.map(x => x[field])),
    seedClusterBootstrap95:clusteredBootstrap(clustered(field))});
  // The two frame rates are repeated observations of the SAME seed, not
  // independent trials. A seed dying at either rate is exposed; dying at
  // both rates is a stricter reproducibility measure, not the exposure rate.
  const anyNaturalSeeds = [...bySeed.values()].filter(group =>
    group.some(x => x.naturalDeath)).length;
  const bothNaturalSeeds = [...bySeed.values()].filter(group =>
    group.every(x => x.naturalDeath)).length;
  const discordantSeeds = anyNaturalSeeds - bothNaturalSeeds;
  const primary30 = rows.filter(x => x.hz===30);
  const technical60 = rows.filter(x => x.hz===60);
  const deathTimes = group => group.filter(x => x.naturalDeath).map(x => x.preludeElapsed);
  const meanOrNull = values => values.length?mean(values):null;
  const changed = rows.filter(x => x.preludeChangedShapes > 0 ||
    x.preludeChangedEnemies > 0 || x.preludeChangedTerrain > 0).length;
  return {
    contract:'played-first-life total-policy effect, NOT isolated geography, natural human play or fun',
    policy:report.policy, preludeSeconds:report.preludeSeconds,
    independentSeeds:bySeed.size, fpsPairedObservations:rows.length,
    layouts:[...layouts].sort(),
    firstLife:{naturalDeaths:rows.filter(x => x.naturalDeath).length,
      independentNaturalDeathSeeds:anyNaturalSeeds,
      independentNaturalDeathSeedsAtBothHz:bothNaturalSeeds,
      independentForcedDeathSeeds:bySeed.size-anyNaturalSeeds,
      fpsDiscordantDeathSeeds:discordantSeeds,
      naturalDeathExposureRate:anyNaturalSeeds/bySeed.size,
      bothHzNaturalDeathRate:bothNaturalSeeds/bySeed.size,
      primary30Hz:{naturalDeaths:deathTimes(primary30).length,
        forcedDeaths:primary30.length-deathTimes(primary30).length,
        meanNaturalDeathTime:meanOrNull(deathTimes(primary30)),
        meanObservedTime:mean(primary30.map(x=>x.preludeElapsed))},
      technical60Hz:{naturalDeaths:deathTimes(technical60).length,
        forcedDeaths:technical60.length-deathTimes(technical60).length,
        meanNaturalDeathTime:meanOrNull(deathTimes(technical60)),
        meanObservedTime:mean(technical60.map(x=>x.preludeElapsed))},
      censoringNote:'Natural-death exposure counts independent seeds dying at EITHER frame rate; both-Hz deaths measure reproducibility. Forced-death seeds are retained, not reclassified as naturally dead; do not estimate causal strategy effects from them.',
      worldsWithPhysicalChange:changed,
      meanElapsed:mean(rows.map(x => x.preludeElapsed)),
      meanTravel:mean(rows.map(x => x.preludeTravel)),
      meanNeutralXP:mean(rows.map(x => x.preludeNeutralXP)),
      meanChangedShapes:mean(rows.map(x => x.preludeChangedShapes)),
      meanChangedEnemies:mean(rows.map(x => x.preludeChangedEnemies)),
      meanChangedTerrain:mean(rows.map(x => x.preludeChangedTerrain))},
    postInsertionParity:{sameEnemyClassSequence:rows.filter(x => x.sameEnemyClasses).length,
      sameEnemyBodies:rows.filter(x => x.sameEnemyBodies).length,
      sameNeutralBodies:rows.filter(x => x.sameNeutralBodies).length,
      denominator:rows.length,
      warning:'These are observed consequences of different insertion paths, not a claim of unfair spawning.'},
    returnMinusFresh:{neutralXP:metric('neutralGap'),score:metric('scoreGap'),
      hp:metric('hpGap'),survival:metric('survivalGap')},
    frontArrivals:{fresh:rows.filter(x => x.freshReached).length,
      return:rows.filter(x => x.returnReached).length},
    limitations:['Enemy/neutral RNG and spawn placement remain coupled to redeploy choice.',
      'The first-life policy is automated and capped at a scripted window.',
      'A repeated FPS result does not double the independent sample size.',
      'The experiment cannot establish human fun, skill or device performance.',
      'Natural-death exposure is a descriptive count, not a causal estimate; non-death seeds were forced to redeploy.']
  };
}
if (require.main === module) {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/redeploy-played-prelife-report.cjs results-harvest_roam.json');
  const expectedSeeds = Number(process.env.NOVA_REDEPLOY_EXPECTED_SEEDS || 36);
  if(!Number.isInteger(expectedSeeds)||expectedSeeds<1||expectedSeeds>36)
    throw Error('Expected seeds must be an integer between 1 and 36');
  const summary = reportPlayedFirstLife(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')),expectedSeeds);
  const output = process.argv[2].replace(/\.json$/, '-summary.json');
  fs.writeFileSync(output, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
module.exports = {reportPlayedFirstLife};
