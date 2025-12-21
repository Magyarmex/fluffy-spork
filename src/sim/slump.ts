import { neighbors8, indexFor, gridToWorld, worldToGrid } from '@core/grid';
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
  collisionsResolved: number;
  grainCount: number;
}

const MIN_GRAIN_CM = 0.05;
const MAX_GRAINS = 8000;
const SUBSTEPS = 12;
const BASE_DT = 0.012;
const RESTITUTION = 0.35;
const DAMPING = 0.985;
const MAX_HORIZONTAL_SPEED = 120;

interface Grain {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  mass: number;
  matIdx: number;
}

interface GrainBuildResult {
  grains: Grain[];
  estimatedVolume: number;
  dropCount: number;
  totalGrainSizeMm: number;
  grainCount: number;
}

interface PhysicsDiagnostics {
  collisions: number;
  peakSpeed: number;
  grainsTouchedFloor: number;
}

function createRng(seed = 1337) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function sphereVolume(radius: number) {
  return (4 / 3) * Math.PI * radius * radius * radius;
}

function sampleHeight(heightGrid: Float32Array, i: number, j: number, res: number) {
  const clampedI = Math.max(0, Math.min(res - 1, i));
  const clampedJ = Math.max(0, Math.min(res - 1, j));
  return heightGrid[indexFor(clampedI, clampedJ, res)];
}

function sampleHeightWorld(heightGrid: Float32Array, x: number, z: number, project: ProjectModel) {
  const { terrain, tank } = project;
  const grid = worldToGrid(x, z, terrain.resolution, tank);
  return sampleHeight(heightGrid, grid.i, grid.j, terrain.resolution);
}

function buildGrainsFromTerrain(project: ProjectModel, maxGrains: number): GrainBuildResult {
  const { terrain, tank } = project;
  const { resolution, heightGrid, materialGrid, baseDepthCm } = terrain;
  const dx = tank.widthCm / (resolution - 1);
  const dz = tank.depthCm / (resolution - 1);
  const cellArea = dx * dz;
  const rand = createRng();

  let estimatedGrains = 0;
  let totalVolume = 0;
  let totalGrainSizeMm = 0;
  let grainCount = 0;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = indexFor(i, j, resolution);
      const height = heightGrid[idx];
      if (!Number.isFinite(height) || height <= baseDepthCm) continue;
      const mat = MATERIALS[materialFromIndex(materialGrid[idx])];
      const columnHeight = Math.max(0, height - baseDepthCm);
      const volume = columnHeight * cellArea;
      const radius = Math.max(mat.grainSizeMm / 20, MIN_GRAIN_CM / 2);
      const volPerGrain = sphereVolume(radius);
      const count = Math.max(1, Math.floor(volume / Math.max(volPerGrain, 1e-6)));
      estimatedGrains += count;
      totalVolume += volume;
      totalGrainSizeMm += count * mat.grainSizeMm;
      grainCount += count;
    }
  }

  const scaling = Math.min(1, maxGrains / Math.max(1, estimatedGrains));
  const grains: Grain[] = [];

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = indexFor(i, j, resolution);
      const height = heightGrid[idx];
      if (!Number.isFinite(height) || height <= baseDepthCm) continue;
      const matIdx = materialGrid[idx];
      const mat = MATERIALS[materialFromIndex(matIdx)];
      const columnHeight = Math.max(0, height - baseDepthCm);
      const volume = columnHeight * cellArea;
      const radius = Math.max(mat.grainSizeMm / 20, MIN_GRAIN_CM / 2);
      const volPerGrain = sphereVolume(radius);
      const count = Math.max(1, Math.floor((volume / Math.max(volPerGrain, 1e-6)) * scaling));
      for (let k = 0; k < count; k++) {
        const base = gridToWorld(i, j, resolution, tank);
        const jitterX = (rand() - 0.5) * dx * 0.8;
        const jitterZ = (rand() - 0.5) * dz * 0.8;
        const y = baseDepthCm + rand() * columnHeight;
        grains.push({
          x: base.x + jitterX,
          z: base.z + jitterZ,
          y,
          vx: (rand() - 0.5) * 5,
          vy: 0,
          vz: (rand() - 0.5) * 5,
          radius,
          mass: Math.max(0.001, mat.density * sphereVolume(radius) * 0.01),
          matIdx
        });
        grainCount++;
      }
    }
  }

  if (grains.length === 0) {
    recordDebug('warn', 'No grains produced for settle', `estimated:${estimatedGrains}`);
  }

  recordDebug(
    'info',
    'Generated grain cloud',
    `grains:${grains.length} scaling:${scaling.toFixed(2)} est:${estimatedGrains} volume:${totalVolume.toFixed(
      2
    )}cm3 avgSize:${grainCount === 0 ? 0 : (totalGrainSizeMm / grainCount).toFixed(2)}mm`
  );

  return { grains, estimatedVolume: totalVolume, dropCount: estimatedGrains, totalGrainSizeMm, grainCount };
}

function applyTerrainRoll(grain: Grain, project: ProjectModel, originalHeights: Float32Array) {
  const { terrain, tank } = project;
  const { resolution } = terrain;
  const grid = worldToGrid(grain.x, grain.z, resolution, tank);
  const centerH = sampleHeight(originalHeights, grid.i, grid.j, resolution);
  const right = sampleHeight(originalHeights, grid.i + 1, grid.j, resolution);
  const forward = sampleHeight(originalHeights, grid.i, grid.j + 1, resolution);
  const dx = tank.widthCm / (resolution - 1);
  const dz = tank.depthCm / (resolution - 1);
  const gradX = (right - centerH) / dx;
  const gradZ = (forward - centerH) / dz;
  const slopeMag = Math.hypot(gradX, gradZ);
  if (slopeMag < 1e-5) return;
  const rollAccel = 12 * slopeMag;
  grain.vx -= (gradX / Math.max(0.001, slopeMag)) * rollAccel;
  grain.vz -= (gradZ / Math.max(0.001, slopeMag)) * rollAccel;
}

function simulateGrains(grains: Grain[], project: ProjectModel, originalHeights: Float32Array): PhysicsDiagnostics {
  const { terrain, tank } = project;
  const { baseDepthCm } = terrain;
  const g = 980; // cm/s^2
  let collisions = 0;
  let peakSpeed = 0;
  let touchedFloor = 0;

  const cellSize = Math.max(0.5, Math.min(tank.widthCm, tank.depthCm) / terrain.resolution);

  for (let step = 0; step < SUBSTEPS; step++) {
    const spatial = new Map<string, number[]>();
    for (let idx = 0; idx < grains.length; idx++) {
      const g0 = grains[idx];
      const key = `${Math.floor(g0.x / cellSize)}|${Math.floor(g0.y / cellSize)}|${Math.floor(g0.z / cellSize)}`;
      const bucket = spatial.get(key) ?? [];
      bucket.push(idx);
      spatial.set(key, bucket);
    }

    for (let i = 0; i < grains.length; i++) {
      const gr = grains[i];
      gr.vy -= g * BASE_DT;
      applyTerrainRoll(gr, project, originalHeights);
      gr.vx *= DAMPING;
      gr.vy *= DAMPING;
      gr.vz *= DAMPING;

      gr.x += gr.vx * BASE_DT;
      gr.y += gr.vy * BASE_DT;
      gr.z += gr.vz * BASE_DT;

      if (gr.x - gr.radius < 0) {
        gr.x = gr.radius;
        gr.vx *= -RESTITUTION;
      }
      if (gr.x + gr.radius > tank.widthCm) {
        gr.x = tank.widthCm - gr.radius;
        gr.vx *= -RESTITUTION;
      }
      if (gr.z - gr.radius < 0) {
        gr.z = gr.radius;
        gr.vz *= -RESTITUTION;
      }
      if (gr.z + gr.radius > tank.depthCm) {
        gr.z = tank.depthCm - gr.radius;
        gr.vz *= -RESTITUTION;
      }

      const floorHeight = Math.max(baseDepthCm, sampleHeightWorld(originalHeights, gr.x, gr.z, project));
      if (gr.y - gr.radius < floorHeight) {
        gr.y = floorHeight + gr.radius;
        if (gr.vy < 0) gr.vy *= -RESTITUTION;
        touchedFloor++;
      }
    }

    for (let idx = 0; idx < grains.length; idx++) {
      const a = grains[idx];
      const gx = Math.floor(a.x / cellSize);
      const gy = Math.floor(a.y / cellSize);
      const gz = Math.floor(a.z / cellSize);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const key = `${gx + dx}|${gy + dy}|${gz + dz}`;
            const bucket = spatial.get(key);
            if (!bucket) continue;
            for (const j of bucket) {
              if (j <= idx) continue;
              const b = grains[j];
              const dxv = b.x - a.x;
              const dyv = b.y - a.y;
              const dzv = b.z - a.z;
              const distSq = dxv * dxv + dyv * dyv + dzv * dzv;
              const minDist = a.radius + b.radius;
              if (distSq > minDist * minDist || distSq === 0) continue;
              const dist = Math.sqrt(distSq);
              const nx = dxv / dist;
              const ny = dyv / dist;
              const nz = dzv / dist;
              const penetration = minDist - dist;
              const totalMass = a.mass + b.mass;
              a.x -= (nx * penetration * (b.mass / totalMass)) / 2;
              a.y -= (ny * penetration * (b.mass / totalMass)) / 2;
              a.z -= (nz * penetration * (b.mass / totalMass)) / 2;
              b.x += (nx * penetration * (a.mass / totalMass)) / 2;
              b.y += (ny * penetration * (a.mass / totalMass)) / 2;
              b.z += (nz * penetration * (a.mass / totalMass)) / 2;

              const rvx = b.vx - a.vx;
              const rvy = b.vy - a.vy;
              const rvz = b.vz - a.vz;
              const relVel = rvx * nx + rvy * ny + rvz * nz;
              if (relVel < 0) {
                const impulse = -(1 + RESTITUTION) * relVel / Math.max(0.001, 1 / a.mass + 1 / b.mass);
                const ix = impulse * nx;
                const iy = impulse * ny;
                const iz = impulse * nz;
                a.vx -= ix / a.mass;
                a.vy -= iy / a.mass;
                a.vz -= iz / a.mass;
                b.vx += ix / b.mass;
                b.vy += iy / b.mass;
                b.vz += iz / b.mass;
              }
              collisions++;
            }
          }
        }
      }
    }

    for (const gr of grains) {
      const speed = Math.hypot(gr.vx, gr.vy, gr.vz);
      peakSpeed = Math.max(peakSpeed, speed);
      if (speed > MAX_HORIZONTAL_SPEED) {
        const scale = MAX_HORIZONTAL_SPEED / speed;
        gr.vx *= scale;
        gr.vy *= scale;
        gr.vz *= scale;
      }
    }
  }

  return { collisions, peakSpeed, grainsTouchedFloor: touchedFloor };
}

function bakeGrainsToTerrain(grains: Grain[], project: ProjectModel) {
  const { terrain, tank } = project;
  const { resolution, baseDepthCm } = terrain;
  const dx = tank.widthCm / (resolution - 1);
  const dz = tank.depthCm / (resolution - 1);
  const cellArea = dx * dz;
  const volumeGrid = new Float32Array(resolution * resolution);

  for (const g of grains) {
    const grid = worldToGrid(g.x, g.z, resolution, tank);
    const idx = indexFor(grid.i, grid.j, resolution);
    volumeGrid[idx] += sphereVolume(g.radius);
  }

  let minH = Number.POSITIVE_INFINITY;
  let maxH = Number.NEGATIVE_INFINITY;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = indexFor(i, j, resolution);
      const h = baseDepthCm + volumeGrid[idx] / cellArea;
      const clamped = Math.min(project.tank.tankHeightCm, Math.max(baseDepthCm, h));
      terrain.heightGrid[idx] = clamped;
      minH = Math.min(minH, clamped);
      maxH = Math.max(maxH, clamped);
    }
  }
  recordDebug('info', 'Baked grains into terrain', `range:${minH.toFixed(2)}-${maxH.toFixed(2)}cm`);
}

export function runSlumpStep(project: ProjectModel): SlumpDiagnostics {
  const originalHeights = new Float32Array(project.terrain.heightGrid);
  const { grains, estimatedVolume, dropCount, totalGrainSizeMm, grainCount } = buildGrainsFromTerrain(project, MAX_GRAINS);
  const { collisions, peakSpeed, grainsTouchedFloor } = simulateGrains(grains, project, originalHeights);
  bakeGrainsToTerrain(grains, project);

  let peakSlope = 0;
  let unstableCount = 0;
  const { heightGrid, resolution } = project.terrain;
  const dx = Math.max(0.001, (project.tank.widthCm + project.tank.depthCm) / 2 / (resolution - 1));
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const idx = indexFor(i, j, resolution);
      const h = heightGrid[idx];
      const nbrs = neighbors8(i, j, resolution);
      for (const n of nbrs) {
        const drop = h - heightGrid[indexFor(n.i, n.j, resolution)];
        if (drop > 0) {
          peakSlope = Math.max(peakSlope, (Math.atan(drop / dx) * 180) / Math.PI);
          unstableCount++;
        }
      }
    }
  }

  return {
    iterationsRun: 1,
    peakSlope,
    unstableCount,
    grainsMoved: grainsTouchedFloor,
    totalTransferCm: estimatedVolume,
    averageGrainSizeMm: grainCount === 0 ? 0 : totalGrainSizeMm / Math.max(1, grainCount),
    collisionsResolved: collisions,
    grainCount: grains.length
  };
}

export function runSlumpAsync(project: ProjectModel, config: SlumpConfig) {
  let remaining = config.maxIterations;
  let totalGrains = 0;
  let totalTransfer = 0;
  let peakSlope = 0;
  let maxUnstable = 0;
  let totalCollisions = 0;
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
      totalCollisions += diag.collisionsResolved;
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
        `iters:${config.maxIterations} grains:${Math.round(totalGrains)} transferCm:${totalTransfer.toFixed(
          2
        )} peakSlope:${peakSlope.toFixed(2)} unstableMax:${maxUnstable} collisions:${totalCollisions}`
      );
      config.onFinish?.();
    }
  };
  loop();
}
