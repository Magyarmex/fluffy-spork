import type { CombatantState, DamageResult, ProjectileSpawnSpec } from './types';
import { CombatSystem } from './CombatSystem';

export interface DroneContactHitRequest {
  readonly sourceId: string;
  readonly sourceTeamId: string;
  readonly position: CombatantState['position'];
  readonly damage: number;
  readonly target: CombatantState;
  readonly atSeconds: number;
}

/** Canonical combat-owned adapter for the melee/contact damage requested by DroneSystem intents. */
export class DroneContactCombat {
  constructor(private readonly combat: CombatSystem) {}

  resolve(request: DroneContactHitRequest): DamageResult {
    const projectile: ProjectileSpawnSpec = {
      id: `drone-contact:${request.sourceId}`,
      ownerId: request.sourceId,
      ownerTeamId: request.sourceTeamId,
      weaponId: 'drone-contact',
      position: request.position,
      angle: 0,
      damage: Math.max(0, request.damage),
      speed: 0,
      inheritedVelocity: { x: 0, y: 0 },
      radius: 1,
      penetrationRemaining: 1,
      ttlSeconds: 0,
      splashRadius: 0,
      splashDamageScale: 0,
      knockback: 0,
      clusterCount: 0,
      clusterDamage: 0,
      sourceProjectile: { damage: Math.max(0, request.damage), speed: 0, radius: 1, penetration: 1, reloadSeconds: 0 },
    };
    return this.combat.resolveDirectHit({ projectile, target: request.target, atSeconds: request.atSeconds });
  }
}
