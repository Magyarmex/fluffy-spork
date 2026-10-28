'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {compareReports, clusteredBootstrap} = require('../../scripts/redeploy-pilot-analysis.cjs');
function report(policy, gap = 0) {
  const rows = [];
  for (const seed of [1, 2]) for (const hz of [30, 60]) {
    const base = {fingerprintHash: 'world' + seed, spawn: {x: seed, y: hz},
      neutralXP: 10, score: 20, hp: 100, alive: true, postFrontTravelled: 100, postFrontNeutralXP: 4,
      frontReached: 4};
    rows.push({seed, hz, layout: 'A', rotation: 0, mirrored: false,
      fresh: {...base}, returning: {...base, neutralXP: 10 + gap, score: 20 + gap}});
  }
  return {policy, results: rows};
}
test('difference-in-differences is paired by world and clustered by seed', () => {
  const result = compareReports(report('harvest', -5), report('harvest_roam', 3));
  assert.equal(result.scenarios, 4);
  assert.equal(result.independentSeeds, 2);
  assert.equal(result.differenceInDifferences.survival.mean, 0);
  assert.equal(result.differenceInDifferences.neutralXP.mean, 8);
  assert.deepEqual(result.differenceInDifferences.neutralXP.seedClusterBootstrap95, [8, 8]);
});
test('rejects duplicate, missing and mismatched physical worlds', () => {
  const old = report('harvest'), now = report('harvest_roam');
  now.results[0].fresh.spawn.x = 99;
  assert.throws(() => compareReports(old, now), /World\/spawn mismatch/);
  now.results[0].fresh.spawn.x = 1;
  now.results.pop();
  assert.throws(() => compareReports(old, now), /sample sizes differ/);
});
test('bootstrap is deterministic, finite and does not treat FPS as independent', () => {
  assert.deepEqual(clusteredBootstrap([5, 5, 5]), [5, 5]);
  assert.equal(clusteredBootstrap([]), null);
});
