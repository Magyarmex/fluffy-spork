# NOVA Movement, Collision & Projectile Kinematics

Mission 09 establishes the headless physical-motion layer used by later gameplay systems. It does not cut the shipping legacy runtime over yet.

## Preserved movement behavior

The canonical tank mover preserves the effective legacy response curve: desired planar velocity is approached with `min(1, dt * 9)`. Base movement speed is `124 * moveMult * (1 + 0.045 * speedUpgradeLevel)`, with explicit situational multipliers supplied by higher-level systems rather than hidden inside physics. Aim rotation uses the legacy `dt * 13` angular response. Class mobility multipliers remain content-owned.

Tank movement is independent of aim. `hullRotation` follows actual translation while `turretRotation` follows the aim command; this makes the old overloaded angle semantics explicit without changing the underlying control feel.

## Collision ownership

`src/game/collision/terrainCollision.ts` owns swept circle-versus-terrain motion, battlefield boundary clamping and simple wall sliding. It consumes Mission 07's `Battlefield.firstTerrainHit()` spatial query rather than duplicating battlefield geometry.

`src/game/collision/entityCollision.ts` owns deterministic circle-pair separation primitives. It deliberately does not apply health loss, knockback damage, penetration or weapon rules; those belong to Mission 10.

## Projectile kinematics

`src/game/entities/projectiles/ProjectileKinematics.ts` advances projectiles using swept terrain queries so high-speed rounds cannot tunnel through thin battlefield geometry. It owns lifetime, optional maximum range and battlefield exit expiry. A terrain impact is reported as a kinematic stop with a terrain ID; damage and penetration consequences remain outside this subsystem.

## Drone primitive

`src/game/movement/DroneMovement.ts` exposes only a low-level desired-direction-to-velocity step with collision. It contains no pathfinding, target selection, tactics, formation logic or routing policy.

## Migration boundary

The materialized runtime and `nova-updates/` remain the active shipping implementation until later cutover missions. Mission 09 provides canonical, deterministic mechanics for later world/combat/input/AI integration without creating a second live game loop.
