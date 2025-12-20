import { neighbors8, indexFor } from '@core/grid';
import { MATERIALS, materialFromIndex } from '@core/materials';
import { ProjectModel } from '@core/project';

export interface SlumpConfig {
  maxIterations: number;
  iterationsPerFrame: number;
  onProgress?: (done: number, total: number) => void;
  onFinish?: () => void;
  cancelSignal?: () => boolean;
}

export interface SlumpDiagnostics {
  iterationsRun: number;
  peakSlope: number;
  unstableCount: number;
}

export function runSlumpStep(project: ProjectModel): SlumpDiagnostics {
  const { heightGrid, materialGrid, resolution } = project.terrain;
  const dx = (project.tank.widthCm + project.tank.depthCm) / 2 / (resolution - 1);
  let maxViolation = 0;
  let unstableCount = 0;

  const transfers = new Float32Array(heightGrid.length);

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = indexFor(i, j, resolution);
      const baseHeight = heightGrid[idx];
      const mat = MATERIALS[materialFromIndex(materialGrid[idx])];
      const allowedDh = Math.tan((mat.reposeAngleDeg * Math.PI) / 180) * dx * (1 + mat.cohesion);
      const nbrs = neighbors8(i, j, resolution);
      for (const n of nbrs) {
        const nIdx = indexFor(n.i, n.j, resolution);
        const dh = baseHeight - heightGrid[nIdx];
        if (dh > allowedDh) {
          const transfer = (dh - allowedDh) * 0.25;
          transfers[idx] -= transfer;
          transfers[nIdx] += transfer;
          maxViolation = Math.max(maxViolation, dh - allowedDh);
          unstableCount++;
        }
      }
    }
  }

  for (let k = 0; k < heightGrid.length; k++) {
    const nh = heightGrid[k] + transfers[k];
    heightGrid[k] = Number.isFinite(nh) ? nh : 0;
  }

  return {
    iterationsRun: 1,
    peakSlope: maxViolation,
    unstableCount
  };
}

export function runSlumpAsync(project: ProjectModel, config: SlumpConfig) {
  let remaining = config.maxIterations;
  const loop = () => {
    if (config.cancelSignal?.()) {
      config.onFinish?.();
      return;
    }
    for (let i = 0; i < config.iterationsPerFrame && remaining > 0; i++) {
      runSlumpStep(project);
      remaining -= 1;
    }
    config.onProgress?.(config.maxIterations - remaining, config.maxIterations);
    if (remaining > 0) {
      requestAnimationFrame(loop);
    } else {
      config.onFinish?.();
    }
  };
  loop();
}
