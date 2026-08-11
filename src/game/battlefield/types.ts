import type { Vec2 } from '../simulation/math';

export const BATTLEFIELD_MAP_LIMIT = 2250;
export const TERRAIN_CELL_SIZE = 360;

export type BattlefieldTemplateId = 'crossfire' | 'split-horizon' | 'four-gates';
export type TerrainType = 'wall' | 'pillar' | 'cover';

export interface BattlefieldBounds { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number; }
export interface RectTerrainDefinition { readonly shape: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface CircleTerrainDefinition { readonly shape: 'circle'; readonly x: number; readonly y: number; readonly radius: number; }
export type TerrainGeometry = RectTerrainDefinition | CircleTerrainDefinition;

export interface TerrainDefinition {
  readonly id: number;
  readonly type: TerrainType;
  readonly geometry: TerrainGeometry;
  readonly destructible: boolean;
  readonly maxHealth: number;
}

export interface TerrainState extends TerrainDefinition { health: number; solid: boolean; brokenAtMs: number | null; }
export interface RubbleState { readonly terrainId: number; readonly geometry: TerrainGeometry; readonly createdAtMs: number; }

export interface BattlefieldTemplate {
  readonly id: BattlefieldTemplateId;
  readonly name: string;
  readonly description: string;
  readonly terrain: readonly TerrainDefinition[];
}

export interface BattlefieldConfig {
  readonly template: BattlefieldTemplateId;
  readonly rotationQuarterTurns?: 0 | 1 | 2 | 3;
  readonly mirrored?: boolean;
  readonly bounds?: BattlefieldBounds;
}

export interface SegmentHit { readonly t: number; readonly point: Vec2; readonly normal: Vec2; }
export interface TerrainHit extends SegmentHit { readonly terrain: Readonly<TerrainState>; }
export interface TerrainDamageResult { readonly applied: number; readonly destroyed: boolean; readonly remainingHealth: number; }

export interface SpawnZone {
  readonly id: 'player' | 'general';
  readonly center: Vec2;
  readonly minRadius: number;
  readonly maxRadius: number;
  readonly defaultClearance: number;
}
