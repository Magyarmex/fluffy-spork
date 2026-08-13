import { TankDimensions } from './project';

export interface GridCoord {
  i: number;
  j: number;
  inBounds: boolean;
}

export function worldToGrid(
  x: number,
  z: number,
  resolution: number,
  tank: TankDimensions
): GridCoord {
  const clampedX = Math.min(Math.max(x, 0), tank.widthCm);
  const clampedZ = Math.min(Math.max(z, 0), tank.depthCm);
  const i = Math.floor((clampedX / tank.widthCm) * (resolution - 1));
  const j = Math.floor((clampedZ / tank.depthCm) * (resolution - 1));
  const inBounds = x >= 0 && x <= tank.widthCm && z >= 0 && z <= tank.depthCm;
  return { i, j, inBounds };
}

export function gridToWorld(
  i: number,
  j: number,
  resolution: number,
  tank: TankDimensions
): { x: number; z: number } {
  const x = (i / (resolution - 1)) * tank.widthCm;
  const z = (j / (resolution - 1)) * tank.depthCm;
  return { x, z };
}

export function indexFor(i: number, j: number, resolution: number): number {
  return j * resolution + i;
}

export function neighbors8(
  i: number,
  j: number,
  resolution: number
): Array<{ i: number; j: number; di: number; dj: number }> {
  const res: Array<{ i: number; j: number; di: number; dj: number }> = [];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      const ni = i + di;
      const nj = j + dj;
      if (ni >= 0 && nj >= 0 && ni < resolution && nj < resolution) {
        res.push({ i: ni, j: nj, di, dj });
      }
    }
  }
  return res;
}

export function safeSample(
  heightGrid: Float32Array,
  i: number,
  j: number,
  resolution: number
): number {
  const clampedI = Math.max(0, Math.min(resolution - 1, i));
  const clampedJ = Math.max(0, Math.min(resolution - 1, j));
  return heightGrid[indexFor(clampedI, clampedJ, resolution)];
}
