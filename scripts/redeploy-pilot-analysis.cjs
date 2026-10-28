'use strict';
// Analyze FRESH/RETURN pilots without counting 30/60Hz repeats as independent
// worlds. This is a total-policy scripted-pilot comparison, NOT causal proof
// of isolated geography, human fun, or real-device performance.
const fs = require('node:fs');
function mean(a) {return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;}
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function clusteredBootstrap(values, iterations = 4000) {
  // values: one mean difference per independent seed; both FPS runs are in
  // the same cluster. Fixed seed makes CI reproducible, not magically powered.
  if (!values.length) return null;
  let rng = 0x431ad2b;
  function random() {rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296;}
  const draws = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) sum += values[Math.floor(random() * values.length)];
    draws.push(sum / values.length);
  }
  draws.sort((a, b) => a - b);
  return [quantile(draws, 0.025), quantile(draws, 0.975)];
}
function indexReport(report) {
  if (!report || !Array.isArray(report.results) || !report.policy) throw Error('Invalid pilot report');
  const map = new Map();
  for (const row of report.results) {
    const key = row.seed + '/' + row.hz;
    if (map.has(key)) throw Error('Duplicate pilot world: ' + key);
    if (row.fresh?.fingerprintHash !== row.returning?.fingerprintHash) throw Error('Unmatched pre-death world: ' + key);
    map.set(key, row);
  }
  return map;
}
function compareReports(baseline, treatment) {
  const a = indexReport(baseline), b = indexReport(treatment);
  if (a.size !== b.size) throw Error('Pilot sample sizes differ');
  const bySeed = new Map();
  const rows = [];
  for (const [key, old] of a) {
    const now = b.get(key);
    if (!now) throw Error('Missing matched world: ' + key);
    if (old.layout !== now.layout || old.rotation !== now.rotation ||
        old.mirrored !== now.mirrored || old.fresh.fingerprintHash !== now.fresh.fingerprintHash ||
        old.returning.fingerprintHash !== now.returning.fingerprintHash ||
        JSON.stringify(old.fresh.spawn) !== JSON.stringify(now.fresh.spawn) ||
        JSON.stringify(old.returning.spawn) !== JSON.stringify(now.returning.spawn)) {
      throw Error('World/spawn mismatch across policies: ' + key);
    }
    const delta = metric => (now.returning[metric] - now.fresh[metric]) -
      (old.returning[metric] - old.fresh[metric]);
    const row = {key, seed: old.seed, hz: old.hz,
      deltaNeutralXP: delta('neutralXP'), deltaScore: delta('score'),
      baselineNeutralGap: old.returning.neutralXP - old.fresh.neutralXP,
      roamingNeutralGap: now.returning.neutralXP - now.fresh.neutralXP,
      freshPostFrontTravel: now.fresh.postFrontTravelled,
      returnPostFrontTravel: now.returning.postFrontTravelled,
      freshPostFrontXP: now.fresh.postFrontNeutralXP,
      returnPostFrontXP: now.returning.postFrontNeutralXP,
      freshReached: now.fresh.frontReached !== null,
      returnReached: now.returning.frontReached !== null};
    if (!Number.isFinite(row.deltaNeutralXP) || !Number.isFinite(row.deltaScore))
      throw Error('Nonfinite outcome: ' + key);
    rows.push(row);
    if (!bySeed.has(old.seed)) bySeed.set(old.seed, []);
    bySeed.get(old.seed).push(row);
  }
  const cluster = key => [...bySeed.values()].map(group => mean(group.map(x => x[key])));
  const describe = key => ({mean: mean(rows.map(r => r[key])),
    seedClusterBootstrap95: clusteredBootstrap(cluster(key))});
  const nonNull = (key, filter) => rows.filter(filter).map(r => r[key]).filter(Number.isFinite);
  return {contract:'scripted total-policy effect; 30/60Hz paired within seed; not isolated geography or human skill',
    baselinePolicy: baseline.policy, treatmentPolicy: treatment.policy,
    scenarios: rows.length, independentSeeds: bySeed.size,
    differenceInDifferences: {neutralXP: describe('deltaNeutralXP'), score: describe('deltaScore')},
    neutralGap: {baseline: mean(rows.map(r => r.baselineNeutralGap)),
      roaming: mean(rows.map(r => r.roamingNeutralGap))},
    frontExposure: {freshReached: rows.filter(r => r.freshReached).length,
      returnReached: rows.filter(r => r.returnReached).length,
      freshPostFrontTravelMean: mean(rows.map(r => r.freshPostFrontTravel)),
      returnPostFrontTravelMean: mean(rows.map(r => r.returnPostFrontTravel)),
      freshPostFrontXPConditionalMean: mean(nonNull('freshPostFrontXP', r => r.freshReached)),
      returnPostFrontXPConditionalMean: mean(nonNull('returnPostFrontXP', r => r.returnReached)),
      warning:'Conditional post-front XP selects only successful arrivals; do not compare as an unbiased geography effect.'}};
}
if (require.main === module) {
  if (process.argv.length !== 4) throw Error('Usage: node scripts/redeploy-pilot-analysis.cjs results-harvest.json results-harvest_roam.json');
  console.log(JSON.stringify(compareReports(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')),
    JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))), null, 2));
}
module.exports = {compareReports, clusteredBootstrap};
