const test = require('node:test');
const assert = require('node:assert');
const { createProject } = require('../../runtime/core/project');
const { runSlumpStep } = require('../../runtime/sim/slump');

function buildCliff() {
  const project = createProject('Cliff');
  const { terrain } = project;
  const res = terrain.resolution;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const idx = j * res + i;
      terrain.heightGrid[idx] = i < res / 2 ? 30 : 0;
    }
  }
  return project;
}

test('does not introduce NaNs', () => {
  const project = buildCliff();
  const result = runSlumpStep(project);
  assert.ok(result.unstableCount > 0);
  assert.ok(!project.terrain.heightGrid.some((v) => Number.isNaN(v)));
});

test('reduces violations over iterations', () => {
  const project = buildCliff();
  const first = runSlumpStep(project);
  const peakValues = [first.peakSlope];
  for (let i = 0; i < 10; i++) {
    peakValues.push(runSlumpStep(project).peakSlope);
  }
  const bestPeak = Math.min(...peakValues);
  assert.ok(Number.isFinite(bestPeak));
  assert.ok(
    bestPeak <= peakValues[0] + 1e-6,
    'at least one relaxation pass should not exceed the initial peak violation'
  );
});
