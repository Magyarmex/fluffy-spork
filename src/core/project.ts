import { DEFAULT_MATERIAL, MaterialId } from './materials';
import { generateId } from './id';
import { recordDebug } from './debug';

export interface TankDimensions {
  widthCm: number;
  depthCm: number;
  tankHeightCm: number;
  waterlineCm: number;
}

export interface TerrainData {
  resolution: number;
  heightGrid: Float32Array;
  materialGrid: Uint8Array;
  lateralOffsetX: Float32Array;
  lateralOffsetZ: Float32Array;
  baseDepthCm: number;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectModel extends ProjectMetadata {
  tank: TankDimensions;
  terrain: TerrainData;
  camera: CameraState;
  settings: {
    showWater: boolean;
    showMaterialTint: boolean;
    falloff: 'linear' | 'smoothstep';
    autoSettle: boolean;
    brushRadiusCm: number;
    brushStrengthMm: number;
    flattenAbsoluteHeightCm: number;
    selectedMaterial: MaterialId;
  };
}

export const DEFAULT_TANK: TankDimensions = {
  widthCm: 78,
  depthCm: 33,
  tankHeightCm: 44,
  waterlineCm: 22
};

export const DEFAULT_RESOLUTION = 256;

export function createDefaultTerrain(resolution = DEFAULT_RESOLUTION): TerrainData {
  const size = resolution * resolution;
  const heightGrid = new Float32Array(size);
  const materialGrid = new Uint8Array(size);
  const lateralOffsetX = new Float32Array(size);
  const lateralOffsetZ = new Float32Array(size);
  materialGrid.fill(materialIndex(DEFAULT_MATERIAL.id));
  return { resolution, heightGrid, materialGrid, lateralOffsetX, lateralOffsetZ, baseDepthCm: -6 };
}

export function ensureTerrainIntegrity(terrain: TerrainData): TerrainData {
  const resolution = terrain?.resolution ?? DEFAULT_RESOLUTION;
  const size = resolution * resolution;
  const safeHeight =
    terrain?.heightGrid && terrain.heightGrid.length === size ? terrain.heightGrid : new Float32Array(size);
  const safeMaterial =
    terrain?.materialGrid && terrain.materialGrid.length === size ? terrain.materialGrid : new Uint8Array(size);
  if (safeHeight !== terrain.heightGrid || safeMaterial !== terrain.materialGrid) {
    recordDebug('warn', 'Repaired terrain arrays missing or incorrect size', `expected:${size}`);
  }
  return {
    resolution,
    heightGrid: safeHeight,
    materialGrid: safeMaterial,
    lateralOffsetX: terrain.lateralOffsetX,
    lateralOffsetZ: terrain.lateralOffsetZ,
    baseDepthCm: terrain.baseDepthCm
  };
}

export function ensureTerrainVolumetric(terrain: TerrainData): TerrainData {
  const base = ensureTerrainIntegrity(terrain);
  const { resolution, heightGrid } = base;
  const size = terrain.heightGrid?.length ?? terrain.resolution * terrain.resolution;
  const safeLateralX =
    base.lateralOffsetX && base.lateralOffsetX.length === size ? base.lateralOffsetX : new Float32Array(size);
  const safeLateralZ =
    base.lateralOffsetZ && base.lateralOffsetZ.length === size ? base.lateralOffsetZ : new Float32Array(size);
  const baseDepthCm = base.baseDepthCm ?? -6;
  if (safeLateralX !== base.lateralOffsetX || safeLateralZ !== base.lateralOffsetZ || base.baseDepthCm === undefined) {
    recordDebug('warn', 'Filled missing volumetric offsets', `size:${size}`);
  }
  return { ...base, heightGrid, lateralOffsetX: safeLateralX, lateralOffsetZ: safeLateralZ, baseDepthCm };
}

export function materialIndex(material: MaterialId): number {
  const order: MaterialId[] = ['FineSand', 'CoarseSand', 'Gravel', 'Soil'];
  return order.indexOf(material);
}

export function materialFromIndex(idx: number): MaterialId {
  const order: MaterialId[] = ['FineSand', 'CoarseSand', 'Gravel', 'Soil'];
  return order[Math.max(0, Math.min(order.length - 1, idx))];
}

export function createProject(name = 'Aquascape'): ProjectModel {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    tank: { ...DEFAULT_TANK },
    terrain: createDefaultTerrain(),
    camera: {
      position: [60, 60, 90],
      target: [DEFAULT_TANK.widthCm / 2, 0, DEFAULT_TANK.depthCm / 2]
    },
    settings: {
      showWater: true,
      showMaterialTint: false,
      falloff: 'smoothstep',
      autoSettle: false,
      brushRadiusCm: 12,
      brushStrengthMm: 18,
      flattenAbsoluteHeightCm: 8,
      selectedMaterial: DEFAULT_MATERIAL.id
    }
  };
}
