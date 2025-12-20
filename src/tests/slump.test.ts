import { describe, expect, it } from 'vitest';
import { createProject } from '@core/project';
import { runSlumpStep } from '@sim/slump';

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

describe('slump solver', () => {
  it('does not introduce NaNs', () => {
    const project = buildCliff();
    const result = runSlumpStep(project);
    expect(result.unstableCount).toBeGreaterThan(0);
    expect(project.terrain.heightGrid.some((v) => Number.isNaN(v))).toBe(false);
  });

  it('reduces violations over iterations', () => {
    const project = buildCliff();
    let lastUnstable = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 5; i++) {
      const diag = runSlumpStep(project);
      expect(diag.unstableCount).toBeLessThanOrEqual(lastUnstable);
      lastUnstable = diag.unstableCount;
    }
  });
});
