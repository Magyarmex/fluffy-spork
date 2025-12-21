import { describe, expect, it } from 'vitest';
import { createProject } from '@core/project';
import { exportProject, importProject } from '@core/serialization';

describe('serialization roundtrip', () => {
  it('preserves terrain arrays', () => {
    const project = createProject('Roundtrip');
    project.terrain.heightGrid[0] = 12.34;
    project.terrain.materialGrid[1] = 2;
    const exported = exportProject(project);
    const imported = importProject(exported);
    expect(imported.terrain.heightGrid[0]).toBeCloseTo(12.34);
    expect(imported.terrain.materialGrid[1]).toBe(2);
  });
});
