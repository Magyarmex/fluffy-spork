'use strict';
// Research-only atomic initial-overlap chronology model. The PR intentionally
// remains RED because its separate shipping TTL acceptance tests are unresolved.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
test('initial-overlap event groups remain invariant under six frame schedules', () => {
  const script = path.resolve(__dirname, '../research/chronology-initial-overlap-atomic.js');
  const result = JSON.parse(execFileSync(process.execPath, [script], {encoding:'utf8',timeout:30000}));
  assert.equal(result.worlds, 6000);
  assert.equal(result.comparisons, 36000);
  assert.equal(result.disagreements, 0);
  assert.equal(result.deterministic.length, 6);
  assert.ok(result.ambiguous > 0, 'simultaneous unaffordable contacts must be observed');
});
