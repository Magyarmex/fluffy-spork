import { vec2, type Vec2 } from '../simulation/math';
import { isSolidTerrain, pointInsideTerrain, segmentTerrainHit, terrainBounds } from './geometry';
import { createBattlefieldTemplate } from './templates';
import {
  BATTLEFIELD_MAP_LIMIT,
  TERRAIN_CELL_SIZE,
  type BattlefieldBounds,
  type BattlefieldConfig,
  type RubbleState,
  type SpawnZone,
  type TerrainDamageResult,
  type TerrainHit,
  type TerrainState,
} from './types';

const DEFAULT_BOUNDS: BattlefieldBounds = {
  minX: -BATTLEFIELD_MAP_LIMIT,
  maxX: BATTLEFIELD_MAP_LIMIT,
  minY: -BATTLEFIELD_MAP_LIMIT,
  maxY: BATTLEFIELD_MAP_LIMIT,
};

const DEFAULT_SPAWN_ZONES: readonly SpawnZone[] = [
  { id: 'player', center: vec2(), minRadius: 700, maxRadius: 1800, defaultClearance: 75 },
  { id: 'general', center: vec2(), minRadius: 0, maxRadius: BATTLEFIELD_MAP_LIMIT, defaultClearance: 75 },
];

interface CellIndex {
  readonly cells: Map<string, TerrainState[]>;
}

export class Battlefield {
  readonly bounds: BattlefieldBounds;
  readonly template;
  readonly spawnZones: readonly SpawnZone[] = DEFAULT_SPAWN_ZONES;
  private readonly terrainState: TerrainState[];
  private readonly terrainById = new Map<number, TerrainState>();
  private readonly index: CellIndex;
  private readonly rubbleState: RubbleState[] = [];

  constructor(config: BattlefieldConfig) {
    this.bounds = config.bounds ?? DEFAULT_BOUNDS;
    this.template = createBattlefieldTemplate(config.template, config.rotationQuarterTurns ?? 0, config.mirrored ?? false);
    this.terrainState = this.template.terrain.map((definition) => ({
      ...definition,
      health: definition.maxHealth,
      solid: true,
      brokenAtMs: null,
    }));
    for (const terrain of this.terrainState) this.terrainById.set(terrain.id, terrain);
    this.index = this.buildIndex();
  }

  get terrain(): readonly Readonly<TerrainState>[] { return this.terrainState; }
  get rubble(): readonly RubbleState[] { return this.rubbleState; }
  get coverTotal(): number { return this.terrainState.filter((terrain) => terrain.destructible).length; }
  get coverBroken(): number { return this.terrainState.filter((terrain) => terrain.destructible && !terrain.solid).length; }

  contains(point: Vec2, padding = 0): boolean {
    return point.x >= this.bounds.minX + padding && point.x <= this.bounds.maxX - padding
      && point.y >= this.bounds.minY + padding && point.y <= this.bounds.maxY - padding;
  }

  isOccupied(point: Vec2, padding = 0): boolean {
    if (!this.contains(point, padding)) return true;
    return this.candidates(point, point, padding).some((terrain) => pointInsideTerrain(terrain, point, padding));
  }

  isSpawnSafe(point: Vec2, clearance = 40): boolean {
    return this.contains(point, clearance) && !this.isOccupied(point, clearance);
  }

  isInsideSpawnZone(zoneId: SpawnZone['id'], point: Vec2): boolean {
    const zone = this.spawnZones.find((candidate) => candidate.id === zoneId);
    if (!zone) return false;
    const dx = point.x - zone.center.x;
    const dy = point.y - zone.center.y;
    const radiusSquared = dx * dx + dy * dy;
    return radiusSquared >= zone.minRadius * zone.minRadius && radiusSquared <= zone.maxRadius * zone.maxRadius;
  }

  hasLineOfSight(start: Vec2, end: Vec2, padding = 1): boolean {
    for (const terrain of this.candidates(start, end, padding)) {
      const hit = segmentTerrainHit(terrain, start, end, padding);
      if (hit && hit.t > 0.015 && hit.t < 1.01) return false;
    }
    return true;
  }

  firstTerrainHit(start: Vec2, end: Vec2, padding = 0): TerrainHit | null {
    let best: TerrainHit | null = null;
    for (const terrain of this.candidates(start, end, padding)) {
      const hit = segmentTerrainHit(terrain, start, end, padding);
      if (!hit || (best && hit.t >= best.t)) continue;
      best = { ...hit, terrain };
    }
    return best;
  }

  damageCover(terrainId: number, amount: number, atMs: number): TerrainDamageResult {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('terrain damage must be a finite non-negative number');
    const terrain = this.terrainById.get(terrainId);
    if (!terrain || !terrain.destructible || terrain.health <= 0) return { applied: 0, destroyed: false, remainingHealth: terrain?.health ?? 0 };
    const previous = terrain.health;
    terrain.health = Math.max(0, terrain.health - amount);
    const applied = previous - terrain.health;
    const destroyed = previous > 0 && terrain.health === 0;
    if (destroyed) {
      terrain.solid = false;
      terrain.brokenAtMs = atMs;
      this.rubbleState.push({ terrainId: terrain.id, geometry: terrain.geometry, createdAtMs: atMs });
    }
    return { applied, destroyed, remainingHealth: terrain.health };
  }

  querySolids(start: Vec2, end: Vec2 = start, padding = 0): readonly Readonly<TerrainState>[] {
    return this.candidates(start, end, padding).filter(isSolidTerrain);
  }

  private buildIndex(): CellIndex {
    const cells = new Map<string, TerrainState[]>();
    for (const terrain of this.terrainState) {
      const box = terrainBounds(terrain.geometry);
      const minCellX = Math.floor(box.minX / TERRAIN_CELL_SIZE);
      const maxCellX = Math.floor(box.maxX / TERRAIN_CELL_SIZE);
      const minCellY = Math.floor(box.minY / TERRAIN_CELL_SIZE);
      const maxCellY = Math.floor(box.maxY / TERRAIN_CELL_SIZE);
      for (let x = minCellX; x <= maxCellX; x += 1) {
        for (let y = minCellY; y <= maxCellY; y += 1) {
          const key = `${x}:${y}`;
          const bucket = cells.get(key) ?? [];
          if (!cells.has(key)) cells.set(key, bucket);
          bucket.push(terrain);
        }
      }
    }
    return { cells };
  }

  private candidates(start: Vec2, end: Vec2, padding: number): TerrainState[] {
    const minCellX = Math.floor((Math.min(start.x, end.x) - padding) / TERRAIN_CELL_SIZE);
    const maxCellX = Math.floor((Math.max(start.x, end.x) + padding) / TERRAIN_CELL_SIZE);
    const minCellY = Math.floor((Math.min(start.y, end.y) - padding) / TERRAIN_CELL_SIZE);
    const maxCellY = Math.floor((Math.max(start.y, end.y) + padding) / TERRAIN_CELL_SIZE);
    if ((maxCellX - minCellX + 1) * (maxCellY - minCellY + 1) > 80) return this.terrainState;
    const seen = new Set<number>();
    const result: TerrainState[] = [];
    for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let y = minCellY; y <= maxCellY; y += 1) {
        for (const terrain of this.index.cells.get(`${x}:${y}`) ?? []) {
          if (seen.has(terrain.id)) continue;
          seen.add(terrain.id);
          result.push(terrain);
        }
      }
    }
    return result;
  }
}
