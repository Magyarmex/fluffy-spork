const test = require('node:test');
const assert = require('node:assert');
const { createProject } = require('../../runtime/core/project');
const { exportProject, importProject } = require('../../runtime/core/serialization');

test('serialization roundtrip preserves arrays', () => {
  const project = createProject('Roundtrip');
  project.terrain.heightGrid[0] = 12.34;
  project.terrain.materialGrid[1] = 2;
  project.terrain.lateralOffsetX[2] = 1.5;
  project.terrain.lateralOffsetZ[2] = -0.75;
  project.terrain.baseDepthCm = -10;
  const exported = exportProject(project);
  const imported = importProject(exported);
  assert.ok(Math.abs(imported.terrain.heightGrid[0] - 12.34) < 1e-3);
  assert.equal(imported.terrain.materialGrid[1], 2);
  assert.ok(Math.abs(imported.terrain.lateralOffsetX[2] - 1.5) < 1e-3);
  assert.ok(Math.abs(imported.terrain.lateralOffsetZ[2] + 0.75) < 1e-3);
  assert.equal(imported.terrain.baseDepthCm, -10);
});
