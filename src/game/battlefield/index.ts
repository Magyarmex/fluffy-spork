export { Battlefield } from './Battlefield';
export { createBattlefieldTemplate, BATTLEFIELD_TEMPLATE_IDS } from './templates';
export { isSolidTerrain, pointInsideTerrain, segmentTerrainHit, terrainBounds } from './geometry';
export { BATTLEFIELD_MAP_LIMIT, TERRAIN_CELL_SIZE } from './types';
export type {
  BattlefieldBounds,
  BattlefieldConfig,
  BattlefieldTemplate,
  BattlefieldTemplateId,
  CircleTerrainDefinition,
  RectTerrainDefinition,
  RubbleState,
  SegmentHit,
  SpawnZone,
  TerrainDamageResult,
  TerrainDefinition,
  TerrainGeometry,
  TerrainHit,
  TerrainState,
  TerrainType,
} from './types';
