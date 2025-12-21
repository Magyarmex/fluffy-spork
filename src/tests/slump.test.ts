import { describe, expect, it } from 'vitest';
import { createDefaultTerrain, createProject, materialIndex } from '@core/project';
import { indexFor } from '@core/grid';
import { MATERIALS } from '@core/materials';
import { runSlumpStep } from '@sim/slump';

function buildCliff(resolution = 32) {
  const project = createProject('Cliff');
  project.terrain = createDefaultTerrain(resolution);
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

describe('slump solver', () => {
  it('does not introduce NaNs', () => {
    const project = buildCliff();
    const result = runSlumpStep(project);
    expect(result.unstableCount).toBeGreaterThan(0);
    expect(result.grainsMoved).toBeGreaterThan(0);
    expect(project.terrain.heightGrid.some((v) => Number.isNaN(v))).toBe(false);
  });

  it('reduces a sharp cliff over iterations', () => {
    const project = buildCliff();
    const sampleIdx = indexFor(Math.floor(project.terrain.resolution / 2) - 1, Math.floor(project.terrain.resolution / 2), project.terrain.resolution);
    const startingHeight = project.terrain.heightGrid[sampleIdx];
    for (let i = 0; i < 6; i++) {
      runSlumpStep(project);
    }
    const endingHeight = project.terrain.heightGrid[sampleIdx];
    expect(endingHeight).toBeLessThan(startingHeight);
  });

  it('moves fine sand faster than coarse gravel', () => {
    const project = createProject('Materials');
    project.terrain = createDefaultTerrain(8);
    const { terrain } = project;
    const fineIdx = indexFor(1, 1, terrain.resolution);
    const gravelIdx = indexFor(6, 1, terrain.resolution);
    terrain.heightGrid[fineIdx] = 18;
    terrain.heightGrid[gravelIdx] = 18;
    terrain.materialGrid[fineIdx] = materialIndex(MATERIALS.FineSand.id);
    terrain.materialGrid[gravelIdx] = materialIndex(MATERIALS.Gravel.id);

    for (let i = 0; i < 8; i++) {
      runSlumpStep(project);
    }

    expect(terrain.heightGrid[fineIdx]).toBeLessThan(terrain.heightGrid[gravelIdx]);
    expect(terrain.heightGrid[fineIdx]).toBeGreaterThan(project.terrain.baseDepthCm);
  });
});
