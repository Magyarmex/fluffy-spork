import type { EntityId } from '../simulation/types';

export type EntityKind = 'tank' | 'drone' | 'projectile' | 'shape' | 'powerup';
export type EntityLifecycle = 'active' | 'destroyed' | 'despawned';

export interface Vector2State {
  readonly x: number;
  readonly y: number;
}

export interface TeamState {
  readonly teamId: string;
  readonly allegiance?: string;
}

export interface HealthState {
  readonly current: number;
  readonly max: number;
}

export interface EntityBaseState {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly lifecycle: EntityLifecycle;
  readonly position: Vector2State;
  readonly rotation: number;
  readonly team: TeamState;
  readonly health?: HealthState;
  readonly ownerId?: EntityId;
  readonly spawnedAtTick: number;
  readonly destroyedAtTick?: number;
  readonly despawnedAtTick?: number;
}

export interface TankState extends EntityBaseState {
  readonly kind: 'tank';
  readonly tankDefinitionId: string;
  readonly turretRotation: number;
}

export interface DroneState extends EntityBaseState {
  readonly kind: 'drone';
  readonly droneDefinitionId: string;
  readonly ownerId: EntityId;
}

export interface ProjectileState extends EntityBaseState {
  readonly kind: 'projectile';
  readonly projectileDefinitionId: string;
  readonly ownerId: EntityId;
  readonly velocity: Vector2State;
}

export interface ShapeState extends EntityBaseState {
  readonly kind: 'shape';
  readonly shapeType: string;
}

export interface PowerupState extends EntityBaseState {
  readonly kind: 'powerup';
  readonly powerupType: string;
}

export type EntityState = TankState | DroneState | ProjectileState | ShapeState | PowerupState;

type SpawnInputFor<T extends EntityState> = T extends EntityState
  ? Omit<T, 'lifecycle' | 'destroyedAtTick' | 'despawnedAtTick'>
  : never;

export type EntitySpawnInput = SpawnInputFor<EntityState>;

export interface EntitySnapshot {
  readonly version: 1;
  readonly entities: readonly EntityState[];
}

export interface EntityCounts {
  readonly total: number;
  readonly active: number;
  readonly destroyed: number;
  readonly despawned: number;
  readonly byKind: Readonly<Record<EntityKind, number>>;
}
