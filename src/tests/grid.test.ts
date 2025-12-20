import { describe, expect, it } from 'vitest';
import { DEFAULT_TANK } from '@core/project';
import { gridToWorld, worldToGrid } from '@core/grid';

describe('world/grid mapping', () => {
  it('maps center correctly', () => {
    const res = 256;
    const centerX = DEFAULT_TANK.widthCm / 2;
    const centerZ = DEFAULT_TANK.depthCm / 2;
    const grid = worldToGrid(centerX, centerZ, res, DEFAULT_TANK);
    const world = gridToWorld(grid.i, grid.j, res, DEFAULT_TANK);
    expect(world.x).toBeCloseTo(centerX, 1);
    expect(world.z).toBeCloseTo(centerZ, 1);
  });

  it('clamps edges', () => {
    const res = 256;
    const grid = worldToGrid(1000, -10, res, DEFAULT_TANK);
    expect(grid.inBounds).toBe(false);
    expect(grid.i).toBe(res - 1);
    expect(grid.j).toBe(0);
  });
});
