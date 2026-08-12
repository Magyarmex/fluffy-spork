import type { AbilityDefinition, ProjectileDefinition, WeaponDefinition } from '../../content/schema';
import type { Vec2 } from '../simulation/math';

export interface CombatantState {
  readonly id: string;
  readonly teamId: string;
  readonly position: Vec2;
  readonly velocity?: Vec2;
  readonly radius: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly armor?: number;
  readonly baseDamageReduction?: number;
  readonly alive: boolean;
}

export interface CombatStatusEffect {
  readonly id: string;
  readonly sourceId: string;
  readonly startedAtSeconds: number;
  readonly expiresAtSeconds: number;
  readonly fireRateMultiplier?: number;
  readonly damageDealtMultiplier?: number;
  readonly damageTakenMultiplier?: number;
  readonly reflectFraction?: number;
  readonly invulnerable?: boolean;
  readonly moveSpeedMultiplier?: number;
  readonly bodyDamageMultiplier?: number;
  readonly nextShotDamageMultiplier?: number;
  readonly infinitePenetration?: boolean;
}

export interface ProjectileSpawnSpec {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerTeamId: string;
  readonly weaponId: string;
  readonly position: Vec2;
  readonly angle: number;
  readonly damage: number;
  readonly speed: number;
  readonly inheritedVelocity: Vec2;
  readonly radius: number;
  readonly penetrationRemaining: number;
  readonly ttlSeconds: number;
  readonly splashRadius: number;
  readonly splashDamageScale: number;
  readonly knockback: number;
  readonly clusterCount: number;
  readonly clusterDamage: number;
  readonly sourceProjectile: ProjectileDefinition;
}

export interface WeaponFireRequest {
  readonly shooter: CombatantState;
  readonly weapon: WeaponDefinition;
  readonly muzzleOrigin: Vec2;
  readonly aimRadians: number;
  readonly atSeconds: number;
  readonly projectileId: (ordinal: number) => string;
  readonly reloadMultiplier?: number;
  readonly damageMultiplier?: number;
  readonly projectileSpeedMultiplier?: number;
  /** Minigun spool, 0..1. The legacy spread narrows as this approaches 1. */
  readonly fireSpin?: number;
  /** Deterministic replacement for legacy rnd(-1, 1); callers may inject the world RNG. */
  readonly spreadSample?: () => number;
}

export interface WeaponFireResult {
  readonly fired: boolean;
  readonly cooldownRemainingSeconds: number;
  readonly projectiles: readonly ProjectileSpawnSpec[];
  readonly events: readonly CombatSemanticEvent[];
}

export interface DirectHitRequest {
  readonly projectile: ProjectileSpawnSpec;
  readonly target: CombatantState;
  readonly atSeconds: number;
}

export interface DamageResult {
  readonly target: CombatantState;
  readonly rawDamage: number;
  readonly appliedDamage: number;
  readonly reflectedDamage: number;
  readonly remainingPenetration: number;
  readonly destroyed: boolean;
  readonly events: readonly CombatSemanticEvent[];
}

export interface SplashTarget {
  readonly combatant: CombatantState;
  /** 0..1 hull exposure after blast/cover sampling. */
  readonly exposure?: number;
}

export interface SplashDamageResult {
  readonly results: readonly DamageResult[];
  readonly events: readonly CombatSemanticEvent[];
}

export interface CoverDamagePort {
  damageCover(terrainId: number, amount: number, atMs: number): {
    readonly applied: number;
    readonly destroyed: boolean;
    readonly remainingHealth: number;
  };
}

export interface AbilityActivationRequest {
  readonly actor: CombatantState;
  readonly ability: AbilityDefinition;
  readonly atSeconds: number;
  readonly aimRadians?: number;
  readonly weapon?: WeaponDefinition;
  readonly projectileId?: (ordinal: number) => string;
  readonly damageMultiplier?: number;
  readonly projectileSpeedMultiplier?: number;
  readonly battlefieldHalfExtent?: number;
}

export type CombatAbilityAction =
  | { readonly type: 'spawn-projectiles'; readonly projectiles: readonly ProjectileSpawnSpec[]; readonly weaponLockSeconds?: number }
  | { readonly type: 'blink'; readonly destination: Vec2; readonly cloakSeconds: number }
  | { readonly type: 'temporary-drone-capacity'; readonly additionalDrones: number; readonly durationSeconds: number; readonly frenzy: boolean }
  | { readonly type: 'status-effect'; readonly effect: CombatStatusEffect };

export interface AbilityActivationResult {
  readonly activated: boolean;
  readonly cooldownRemainingSeconds: number;
  readonly effects: readonly CombatStatusEffect[];
  readonly actions: readonly CombatAbilityAction[];
  readonly events: readonly CombatSemanticEvent[];
}

export type CombatSemanticEvent =
  | { readonly type: 'weapon-fired'; readonly atSeconds: number; readonly actorId: string; readonly weaponId: string; readonly projectileIds: readonly string[] }
  | { readonly type: 'weapon-cooldown'; readonly atSeconds: number; readonly actorId: string; readonly weaponId: string; readonly readyAtSeconds: number }
  | { readonly type: 'projectile-hit'; readonly atSeconds: number; readonly actorId: string; readonly targetId: string; readonly projectileId: string; readonly damage: number }
  | { readonly type: 'combatant-damaged'; readonly atSeconds: number; readonly actorId: string; readonly targetId: string; readonly damage: number; readonly remainingHealth: number }
  | { readonly type: 'combatant-destroyed'; readonly atSeconds: number; readonly actorId: string; readonly targetId: string }
  | { readonly type: 'damage-reflected'; readonly atSeconds: number; readonly actorId: string; readonly targetId: string; readonly damage: number }
  | { readonly type: 'splash-resolved'; readonly atSeconds: number; readonly actorId: string; readonly projectileId: string; readonly targetIds: readonly string[] }
  | { readonly type: 'cover-damaged'; readonly atSeconds: number; readonly actorId: string; readonly terrainId: number; readonly damage: number; readonly destroyed: boolean }
  | { readonly type: 'ability-activated'; readonly atSeconds: number; readonly actorId: string; readonly abilityId: string; readonly activeUntilSeconds: number }
  | { readonly type: 'ability-cooldown'; readonly atSeconds: number; readonly actorId: string; readonly abilityId: string; readonly readyAtSeconds: number };
