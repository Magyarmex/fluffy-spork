import type { EntityId } from '../simulation/types';
import type {
  EntityCounts,
  EntityKind,
  EntityLifecycle,
  EntitySnapshot,
  EntitySpawnInput,
  EntityState,
  HealthState,
} from './types';

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) result[key] = cloneValue(entry);
  return result as T;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function validateHealth(health: HealthState | undefined): void {
  if (!health) return;
  assertFinite(health.current, 'health.current');
  assertFinite(health.max, 'health.max');
  if (health.max <= 0) throw new Error('health.max must be greater than zero');
  if (health.current < 0 || health.current > health.max) {
    throw new Error('health.current must be between zero and health.max');
  }
}

function validateState(entity: EntityState): void {
  assertFinite(entity.position.x, 'position.x');
  assertFinite(entity.position.y, 'position.y');
  assertFinite(entity.rotation, 'rotation');
  if (!Number.isInteger(entity.spawnedAtTick) || entity.spawnedAtTick < 0) {
    throw new Error('spawnedAtTick must be a non-negative integer');
  }
  if (!entity.team.teamId.trim()) throw new Error('team.teamId must be non-empty');
  if (entity.ownerId === entity.id) throw new Error('An entity cannot own itself');
  validateHealth(entity.health);
  if (entity.lifecycle === 'destroyed' && entity.health && entity.health.current !== 0) {
    throw new Error('Destroyed entities with health must have zero current health');
  }
  if (entity.destroyedAtTick !== undefined && (!Number.isInteger(entity.destroyedAtTick) || entity.destroyedAtTick < entity.spawnedAtTick)) {
    throw new Error('destroyedAtTick must be an integer at or after spawnedAtTick');
  }
  if (entity.despawnedAtTick !== undefined && (!Number.isInteger(entity.despawnedAtTick) || entity.despawnedAtTick < entity.spawnedAtTick)) {
    throw new Error('despawnedAtTick must be an integer at or after spawnedAtTick');
  }
}

function lifecycleAt(entity: EntityState, lifecycle: EntityLifecycle, tick: number): EntityState {
  const next = cloneValue(entity) as EntityState & {
    lifecycle: EntityLifecycle;
    destroyedAtTick?: number;
    despawnedAtTick?: number;
    health?: HealthState;
  };
  next.lifecycle = lifecycle;
  if (lifecycle === 'destroyed') {
    next.destroyedAtTick = tick;
    if (next.health) next.health = { ...next.health, current: 0 };
  }
  if (lifecycle === 'despawned') next.despawnedAtTick = tick;
  return next;
}

export class EntityStore {
  readonly #entities = new Map<EntityId, EntityState>();

  spawn(input: EntitySpawnInput): EntityState {
    const entity = { ...cloneValue(input), lifecycle: 'active' } as EntityState;
    if (this.#entities.has(entity.id)) throw new Error(`Entity already exists: ${entity.id}`);
    validateState(entity);

    if (entity.ownerId !== undefined) {
      const owner = this.#entities.get(entity.ownerId);
      if (!owner || owner.lifecycle !== 'active') {
        throw new Error(`Active owner is required before spawning ${entity.kind}: ${entity.ownerId}`);
      }
    }

    this.#entities.set(entity.id, cloneValue(entity));
    return cloneValue(entity);
  }

  has(id: EntityId): boolean {
    return this.#entities.has(id);
  }

  get(id: EntityId): EntityState | undefined {
    const entity = this.#entities.get(id);
    return entity ? cloneValue(entity) : undefined;
  }

  require(id: EntityId): EntityState {
    const entity = this.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    return entity;
  }

  list(options: { lifecycle?: EntityLifecycle; kind?: EntityKind } = {}): readonly EntityState[] {
    return [...this.#entities.values()]
      .filter((entity) => options.lifecycle === undefined || entity.lifecycle === options.lifecycle)
      .filter((entity) => options.kind === undefined || entity.kind === options.kind)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((entity) => cloneValue(entity));
  }

  destroy(id: EntityId, tick: number): EntityState {
    const entity = this.#entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    if (entity.lifecycle === 'despawned') throw new Error(`Cannot destroy despawned entity: ${id}`);
    if (entity.lifecycle === 'destroyed') return cloneValue(entity);
    if (!Number.isInteger(tick) || tick < entity.spawnedAtTick) throw new Error('destroy tick is invalid');

    const destroyed = lifecycleAt(entity, 'destroyed', tick);
    validateState(destroyed);
    this.#entities.set(id, destroyed);
    return cloneValue(destroyed);
  }

  despawn(id: EntityId, tick: number): EntityState {
    const entity = this.#entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    if (entity.lifecycle === 'despawned') return cloneValue(entity);
    if (!Number.isInteger(tick) || tick < entity.spawnedAtTick) throw new Error('despawn tick is invalid');

    const despawned = lifecycleAt(entity, 'despawned', tick);
    validateState(despawned);
    this.#entities.set(id, despawned);
    return cloneValue(despawned);
  }

  snapshot(): EntitySnapshot {
    return { version: 1, entities: this.list() };
  }

  restore(snapshot: EntitySnapshot): void {
    if (snapshot.version !== 1) throw new Error(`Unsupported EntitySnapshot version: ${snapshot.version}`);
    const next = new Map<EntityId, EntityState>();
    for (const candidate of snapshot.entities) {
      const entity = cloneValue(candidate);
      validateState(entity);
      if (next.has(entity.id)) throw new Error(`Duplicate entity in snapshot: ${entity.id}`);
      next.set(entity.id, entity);
    }
    for (const entity of next.values()) {
      if (entity.ownerId !== undefined && !next.has(entity.ownerId)) {
        throw new Error(`Snapshot owner is missing for ${entity.id}: ${entity.ownerId}`);
      }
    }
    this.#entities.clear();
    for (const [id, entity] of next) this.#entities.set(id, entity);
  }

  counts(): EntityCounts {
    const byKind: Record<EntityKind, number> = { tank: 0, drone: 0, projectile: 0, shape: 0, powerup: 0 };
    let active = 0;
    let destroyed = 0;
    let despawned = 0;
    for (const entity of this.#entities.values()) {
      byKind[entity.kind] += 1;
      if (entity.lifecycle === 'active') active += 1;
      else if (entity.lifecycle === 'destroyed') destroyed += 1;
      else despawned += 1;
    }
    return { total: this.#entities.size, active, destroyed, despawned, byKind: { ...byKind } };
  }
}
