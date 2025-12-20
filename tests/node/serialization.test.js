const test = require('node:test');
const assert = require('node:assert');
const { createProject } = require('../../runtime/core/project');
const { exportProject, importProject } = require('../../runtime/core/serialization');

test('serialization roundtrip preserves arrays', () => {
  const project = createProject('Roundtrip');
  project.terrain.heightGrid[0] = 12.34;
  project.terrain.materialGrid[1] = 2;
  const exported = exportProject(project);
  const imported = importProject(exported);
  assert.ok(Math.abs(imported.terrain.heightGrid[0] - 12.34) < 1e-3);
  assert.equal(imported.terrain.materialGrid[1], 2);
});
