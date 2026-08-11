export type LineageId = 'origin' | 'gunner' | 'cannon' | 'sniper' | 'controller' | 'guardian';
export type CombatLineageId = Exclude<LineageId, 'origin'>;
export type Tier = 0 | 1 | 2 | 3;
export type FireMode = 'single' | 'twin' | 'minigun' | 'shotgun' | 'shell' | 'beam';
export type DroneRole = 'escort' | 'hunter';
export type TerrainShape = 'rect' | 'circle';
export type TerrainType = 'wall' | 'pillar' | 'cover';

export interface BarrelDefinition {
  readonly off: number;
  readonly len: number;
  readonly w: number;
  readonly x: number;
  readonly y: number;
}

export interface ProjectileDefinition {
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly penetration: number;
  readonly reloadSeconds: number;
  readonly ttlSeconds?: number;
  readonly splashRadius?: number;
  readonly splashDamageScale?: number;
  readonly knockback?: number;
  readonly pellets?: number;
  readonly spreadRadians?: number;
  readonly clusterCount?: number;
  readonly clusterDamage?: number;
}

export interface WeaponDefinition {
  readonly id: string;
  readonly ownerTankId: string;
  readonly fireMode: FireMode;
  readonly barrels: readonly BarrelDefinition[];
  readonly projectile: ProjectileDefinition;
  readonly audioCue?: string;
}

export interface DroneDefinition {
  readonly id: string;
  readonly ownerTankId: string;
  readonly role: DroneRole;
  readonly count: number;
  readonly damage: number;
  readonly hp: number;
  readonly speed: number;
  readonly leash: number;
  readonly respawnMultiplier?: number;
}

export interface TankDefinition {
  readonly id: string;
  readonly name: string;
  readonly tier: Tier;
  readonly parentId?: string;
  readonly lineage: LineageId;
  readonly description: string;
  readonly color: string;
  readonly icon: string;
  readonly size: number;
  readonly hpMultiplier: number;
  readonly moveMultiplier: number;
  readonly bodyMultiplier: number;
  readonly aura?: number;
  readonly abilityId?: string;
  readonly weapon: Omit<WeaponDefinition, 'id' | 'ownerTankId'>;
  readonly drone: Omit<DroneDefinition, 'id' | 'ownerTankId'>;
}

export interface LineageDefinition {
  readonly id: LineageId;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly classIds: readonly string[];
}

export interface AbilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly cooldownSeconds: number;
  readonly durationSeconds: number;
  readonly description: string;
}

export interface GeneDefinition {
  readonly id: CombatLineageId;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly description: string;
  readonly tradeoff: string;
}

export interface MasteryPerkDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
}

export interface EvolutionDefinition {
  readonly fromTankId: string;
  readonly toTankIds: readonly string[];
  readonly level: number;
}

export interface TerrainPrimitiveDefinition {
  readonly shape: TerrainShape;
  readonly x: number;
  readonly y: number;
  readonly type: TerrainType;
  readonly width?: number;
  readonly height?: number;
  readonly radius?: number;
  readonly hp?: number;
}

export interface BattlefieldDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly mapLimit: number;
  readonly terrainCell: number;
  readonly terrain: readonly TerrainPrimitiveDefinition[];
}

export interface BalanceDefinition {
  readonly arenaHalfExtent: number;
  readonly defaultProjectileTtlSeconds: number;
  readonly escortDefaults: Readonly<Pick<DroneDefinition, 'role' | 'damage' | 'hp' | 'speed' | 'leash'>>;
  readonly evolutionLevels: Readonly<{ tier1: number; tier2: number; gene: number; apex: number; mastery: number }>;
}
