import { indexFor, gridToWorld, worldToGrid, neighbors8 } from '@core/grid';
import { ProjectModel } from '@core/project';

export type Falloff = 'linear' | 'smoothstep';

export function getFalloff(weight: number, mode: Falloff): number {
  const t = Math.max(0, Math.min(1, weight));
  if (mode === 'smoothstep') {
    const s = t * t * (3 - 2 * t);
    return 1 - s;
  }
  return 1 - t;
}

export function applyBrush(
  project: ProjectModel,
  centerX: number,
  centerZ: number,
  radiusCm: number,
  strengthMmPerSec: number,
  dt: number,
  mode: 'raise' | 'lower' | 'smooth' | 'flattenTo' | 'ramp',
  options: {
    targetHeight?: number;
    rampStart?: [number, number];
    rampEnd?: [number, number];
    rampStartHeight?: number;
    rampEndHeight?: number;
  },
  falloff: Falloff
) {
  const { terrain, tank } = project;
  const { resolution, heightGrid } = terrain;
  const radius = Math.max(1, radiusCm);
  const linearStrengthCm = (strengthMmPerSec / 10) * dt;
  const spacing = tank.widthCm / (resolution - 1);

  const { i: centerI, j: centerJ } = worldToGrid(centerX, centerZ, resolution, tank);
  const radiusCells = Math.ceil(radius / spacing);

  for (let dj = -radiusCells; dj <= radiusCells; dj++) {
    for (let di = -radiusCells; di <= radiusCells; di++) {
      const i = centerI + di;
      const j = centerJ + dj;
      if (i < 0 || j < 0 || i >= resolution || j >= resolution) continue;
      const idx = indexFor(i, j, resolution);
      const { x, z } = gridToWorld(i, j, resolution, tank);
      const dist = Math.hypot(x - centerX, z - centerZ);
      if (dist > radius) continue;
      const weight = getFalloff(dist / radius, falloff);

      if (mode === 'raise' || mode === 'lower') {
        const delta = linearStrengthCm * weight * (mode === 'raise' ? 1 : -1);
        heightGrid[idx] += delta;
      } else if (mode === 'smooth') {
        const nbrs = neighbors8(i, j, resolution);
        let acc = heightGrid[idx];
        for (const n of nbrs) {
          acc += heightGrid[indexFor(n.i, n.j, resolution)];
        }
        const avg = acc / (nbrs.length + 1);
        heightGrid[idx] = heightGrid[idx] + (avg - heightGrid[idx]) * weight * 0.6;
      } else if (mode === 'flattenTo' && options.targetHeight !== undefined) {
        const target = options.targetHeight;
        const delta = target - heightGrid[idx];
        heightGrid[idx] += delta * weight;
      } else if (mode === 'ramp' && options.rampStart && options.rampEnd) {
        const [ax, az] = options.rampStart;
        const [bx, bz] = options.rampEnd;
        const abx = bx - ax;
        const abz = bz - az;
        const abLenSq = Math.max(1e-6, abx * abx + abz * abz);
        const tProj = ((x - ax) * abx + (z - az) * abz) / abLenSq;
        if (tProj >= 0 && tProj <= 1) {
          const heightA = options.rampStartHeight ?? heightGrid[idx];
          const heightB = options.rampEndHeight ?? heightGrid[idx];
          const rampHeight = heightA + (heightB - heightA) * tProj;
          const delta = rampHeight - heightGrid[idx];
          heightGrid[idx] += delta * weight;
        }
      }
    }
  }
}
