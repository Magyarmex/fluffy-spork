const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_TANK } = require('../../runtime/core/project');
const { gridToWorld, worldToGrid } = require('../../runtime/core/grid');

test('maps center correctly', () => {
  const res = 256;
  const centerX = DEFAULT_TANK.widthCm / 2;
  const centerZ = DEFAULT_TANK.depthCm / 2;
  const grid = worldToGrid(centerX, centerZ, res, DEFAULT_TANK);
  const world = gridToWorld(grid.i, grid.j, res, DEFAULT_TANK);
  assert.ok(Math.abs(world.x - centerX) < 0.2);
  assert.ok(Math.abs(world.z - centerZ) < 0.2);
});

test('clamps edges', () => {
  const res = 256;
  const grid = worldToGrid(1000, -10, res, DEFAULT_TANK);
  assert.equal(grid.inBounds, false);
  assert.equal(grid.i, res - 1);
  assert.equal(grid.j, 0);
});
