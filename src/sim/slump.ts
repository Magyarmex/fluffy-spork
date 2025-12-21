import { neighbors8, indexFor } from '@core/grid';
import { MATERIALS } from '@core/materials';
import { ProjectModel, materialFromIndex } from '@core/project';
import { recordDebug } from '@core/debug';

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
  grainsMoved: number;
  totalTransferCm: number;
  averageGrainSizeMm: number;
}

const MIN_GRAIN_CM = 0.05;

export function runSlumpStep(project: ProjectModel): SlumpDiagnostics {
  const { heightGrid, materialGrid, resolution, baseDepthCm } = project.terrain;
  const dx = Math.max(0.001, (project.tank.widthCm + project.tank.depthCm) / 2 / (resolution - 1));
  let peakSlope = 0;
  let unstableCount = 0;
  let grainsMoved = 0;
  let totalTransferCm = 0;
  let accumulatedGrainSize = 0;

  const transfers = new Float32Array(heightGrid.length);

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = indexFor(i, j, resolution);
      const baseHeight = heightGrid[idx];
      if (!Number.isFinite(baseHeight)) {
        recordDebug('error', 'Non-finite terrain height detected', `idx:${idx} value:${baseHeight}`);
        heightGrid[idx] = baseDepthCm;
        continue;
      }
      const mat = MATERIALS[materialFromIndex(materialGrid[idx])];
      const grainHeightCm = Math.max(mat.grainSizeMm / 10, MIN_GRAIN_CM);
      accumulatedGrainSize += mat.grainSizeMm;
      const nbrs = neighbors8(i, j, resolution);
      const candidates: Array<{ idx: number; drop: number; weight: number }> = [];
      for (const n of nbrs) {
        const nIdx = indexFor(n.i, n.j, resolution);
        const neighborHeight = heightGrid[nIdx];
        const drop = baseHeight - neighborHeight;
        const slopeDeg = (Math.atan(Math.max(0, drop) / dx) * 180) / Math.PI;
        peakSlope = Math.max(peakSlope, slopeDeg);
        if (drop <= grainHeightCm * 0.75) continue;
        const grainsOverThreshold = Math.min(Math.floor(drop / grainHeightCm) - 1, 6);
        if (grainsOverThreshold <= 0) continue;
        const weight = drop * (1 + mat.cohesion);
        candidates.push({ idx: nIdx, drop, weight });
      }

      if (!candidates.length) continue;
      const weightSum = candidates.reduce((sum, c) => sum + c.weight, 0);
      if (weightSum <= 0) continue;

      const maxTransferGrains = Math.min(
        candidates.reduce((sum, c) => sum + Math.max(1, Math.floor(c.drop / grainHeightCm) - 1), 0),
        candidates.length * 5
      );

      for (const candidate of candidates) {
        const portion = candidate.weight / weightSum;
        const mobility = MIN_GRAIN_CM / grainHeightCm;
        const grainsForNeighbor = Math.max(1, Math.round(portion * maxTransferGrains * mobility));
        const transfer = grainsForNeighbor * grainHeightCm * 0.85 * mobility;
        transfers[idx] -= transfer;
        transfers[candidate.idx] += transfer;
        grainsMoved += grainsForNeighbor;
        totalTransferCm += transfer;
        unstableCount++;
      }
    }
  }

  for (let k = 0; k < heightGrid.length; k++) {
    const nh = heightGrid[k] + transfers[k];
    const stableHeight = Number.isFinite(nh) ? nh : baseDepthCm;
    if (!Number.isFinite(nh)) {
      recordDebug('warn', 'Clamped non-finite terrain height during settle', `idx:${k} value:${nh}`);
    }
    heightGrid[k] = Math.min(project.tank.tankHeightCm, Math.max(baseDepthCm, stableHeight));
  }

  return {
    iterationsRun: 1,
    peakSlope,
    unstableCount,
    grainsMoved,
    totalTransferCm,
    averageGrainSizeMm: accumulatedGrainSize / Math.max(1, resolution * resolution)
  };
}

export function runSlumpAsync(project: ProjectModel, config: SlumpConfig) {
  let remaining = config.maxIterations;
  let totalGrains = 0;
  let totalTransfer = 0;
  let peakSlope = 0;
  let maxUnstable = 0;
  const loop = () => {
    if (config.cancelSignal?.()) {
      recordDebug('warn', 'Grain settle cancelled by user');
      config.onFinish?.();
      return;
    }
    for (let i = 0; i < config.iterationsPerFrame && remaining > 0; i++) {
      const diag = runSlumpStep(project);
      totalGrains += diag.grainsMoved;
      totalTransfer += diag.totalTransferCm;
      peakSlope = Math.max(peakSlope, diag.peakSlope);
      maxUnstable = Math.max(maxUnstable, diag.unstableCount);
      remaining -= 1;
    }
    config.onProgress?.(config.maxIterations - remaining, config.maxIterations);
    if (remaining > 0) {
      requestAnimationFrame(loop);
    } else {
      if (totalGrains === 0) {
        recordDebug('warn', 'Grain settle completed without movement', `transferCm:${totalTransfer.toFixed(2)}`);
      }
      recordDebug(
        'info',
        'Grain settle complete',
        `iters:${config.maxIterations} grains:${Math.round(totalGrains)} transferCm:${totalTransfer.toFixed(2)} peakSlope:${peakSlope.toFixed(2)} unstableMax:${maxUnstable}`
      );
      config.onFinish?.();
    }
  };
  loop();
}
