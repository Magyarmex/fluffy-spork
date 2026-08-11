# Canonical Entity Model

Mission 08 establishes renderer-independent entity state under `src/game/entities/`.

## Authority boundary

`EntityStore` is the canonical state/lifecycle container for the major runtime entity categories: tanks, base drones, projectiles, shapes and powerups. Every entity has a branded simulation `EntityId`, position/orientation, team/allegiance metadata, optional health, optional ownership, and explicit spawn/destroy/despawn timing.

Category-specific state remains intentionally small. Tanks identify their canonical tank definition and turret orientation; drones identify their drone definition and owner; projectiles identify their projectile definition, owner and current velocity; shapes and powerups carry only their category identity. Movement, collision, weapon resolution, AI doctrine, progression and presentation remain outside this layer for their assigned missions.

## Lifecycle

A spawn creates an `active` entity. Destroying an entity transitions it to `destroyed` and reduces health to zero when health exists. Despawning transitions either an active or destroyed entity to `despawned`. Despawned entities remain as deterministic diagnostic tombstones rather than silently disappearing from snapshots.

Owned entities require an already-active owner at spawn time. This prevents orphan drones/projectiles from entering authoritative state. Snapshot restore also rejects missing ownership references and duplicate IDs.

## Snapshot contract

`EntitySnapshot` version 1 contains a stable ID-sorted list of all entities, including destroyed/despawned tombstones. Values crossing the store boundary are cloned so callers cannot mutate authoritative state by retaining an object reference. The snapshot is plain-data/JSON serializable and can be restored into a fresh store.

## Deliberate non-goals

Mission 08 does not move live gameplay authority away from the materialized runtime yet. It does not implement movement, collision response, projectile stepping, damage rules, drone doctrine, AI tactics, rendering objects, audio or UI. Later missions consume this state model and replace those legacy authorities subsystem by subsystem.
