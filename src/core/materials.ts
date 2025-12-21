export type MaterialId = 'FineSand' | 'CoarseSand' | 'Gravel' | 'Soil';

export interface MaterialPreset {
  id: MaterialId;
  name: string;
  reposeAngleDeg: number;
  cohesion: number;
  grainSizeMm: number;
  density: number;
  tint: string;
}

export const MATERIALS: Record<MaterialId, MaterialPreset> = {
  FineSand: {
    id: 'FineSand',
    name: 'Fine Sand',
    reposeAngleDeg: 28,
    cohesion: 0.08,
    grainSizeMm: 0.3,
    density: 1.6,
    tint: '#e2d9b7'
  },
  CoarseSand: {
    id: 'CoarseSand',
    name: 'Coarse Sand',
    reposeAngleDeg: 32,
    cohesion: 0.12,
    grainSizeMm: 0.8,
    density: 1.55,
    tint: '#c7b890'
  },
  Gravel: {
    id: 'Gravel',
    name: 'Gravel',
    reposeAngleDeg: 38,
    cohesion: 0.16,
    grainSizeMm: 2.5,
    density: 1.7,
    tint: '#a89678'
  },
  Soil: {
    id: 'Soil',
    name: 'Soil',
    reposeAngleDeg: 34,
    cohesion: 0.22,
    grainSizeMm: 1.2,
    density: 1.4,
    tint: '#7a5a3a'
  }
};

export const DEFAULT_MATERIAL: MaterialPreset = MATERIALS.FineSand;

export const materialList = Object.values(MATERIALS);
