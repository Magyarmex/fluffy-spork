import type { AbilityDefinition, WeaponDefinition } from '../../content/schema';
import type { Vec2 } from '../simulation/math';
import type {
  AbilityActivationRequest,
  AbilityActivationResult,
  CombatSemanticEvent,
  CombatStatusEffect,
  CombatantState,
  CoverDamagePort,
  DamageResult,
  DirectHitRequest,
  ProjectileSpawnSpec,
  SplashDamageResult,
  SplashTarget,
  WeaponFireRequest,
  WeaponFireResult,
} from './types';

const DEFAULT_PROJECTILE_TTL_SECONDS = 1.05;
const EPSILON = 1e-9;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative`);
  return value;
}

function activeEffects(effects: readonly CombatStatusEffect[], atSeconds: number): readonly CombatStatusEffect[] {
  return effects.filter((effect) => effect.expiresAtSeconds > atSeconds + EPSILON);
}

function product(effects: readonly CombatStatusEffect[], key: 'fireRateMultiplier' | 'damageDealtMultiplier' | 'damageTakenMultiplier'): number {
  return effects.reduce((value, effect) => value * (effect[key] ?? 1), 1);
}

function barrelMuzzle(origin: Vec2, aimRadians: number, barrel: WeaponDefinition['barrels'][number]): Vec2 {
  const forwardX = Math.cos(aimRadians);
  const forwardY = Math.sin(aimRadians);
  const rightX = -forwardY;
  const rightY = forwardX;
  return {
    x: origin.x + forwardX * (barrel.len + barrel.y) + rightX * barrel.x,
    y: origin.y + forwardY * (barrel.len + barrel.y) + rightY * barrel.x,
  };
}

function spreadOffset(index: number, count: number, totalSpread: number): number {
  if (count <= 1 || totalSpread === 0) return 0;
  return -totalSpread / 2 + totalSpread * (index / (count - 1));
}

function abilityEffect(actorId: string, ability: AbilityDefinition, atSeconds: number): CombatStatusEffect | null {
  const expiresAtSeconds = atSeconds + ability.durationSeconds;
  switch (ability.id) {
    case 'overheat':
      return { id: 'overheat', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds, fireRateMultiplier: 1.9 };
    case 'bulwark':
      return { id: 'bulwark', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds, invulnerable: true };
    case 'taunt':
      return { id: 'iron-will', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds, damageTakenMultiplier: 0.35, reflectFraction: 0.3 };
    case 'stampede':
      return { id: 'stampede', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds, moveSpeedMultiplier: 1.9, bodyDamageMultiplier: 2 };
    case 'supercharge':
      return { id: 'supercharge', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds: Number.POSITIVE_INFINITY, nextShotDamageMultiplier: 2.5, infinitePenetration: true };
    default:
      return null;
  }
}

export class CombatSystem {
  readonly #weaponReadyAt = new Map<string, number>();
  readonly #abilityReadyAt = new Map<string, number>();
  readonly #effects = new Map<string, CombatStatusEffect[]>();

  effectsFor(actorId: string, atSeconds: number): readonly CombatStatusEffect[] {
    const next = [...activeEffects(this.#effects.get(actorId) ?? [], atSeconds)];
    this.#effects.set(actorId, next);
    return next.map((effect) => ({ ...effect }));
  }

  setEffects(actorId: string, effects: readonly CombatStatusEffect[]): void {
    this.#effects.set(actorId, effects.map((effect) => ({ ...effect })));
  }

  weaponReadyAt(actorId: string, weaponId: string): number {
    return this.#weaponReadyAt.get(`${actorId}:${weaponId}`) ?? 0;
  }

  abilityReadyAt(actorId: string, abilityId: string): number {
    return this.#abilityReadyAt.get(`${actorId}:${abilityId}`) ?? 0;
  }

  fire(request: WeaponFireRequest): WeaponFireResult {
    const { shooter, weapon, atSeconds } = request;
    finiteNonNegative(atSeconds, 'atSeconds');
    if (!shooter.alive || shooter.health <= 0) return { fired: false, cooldownRemainingSeconds: 0, projectiles: [], events: [] };

    const key = `${shooter.id}:${weapon.id}`;
    const readyAt = this.#weaponReadyAt.get(key) ?? 0;
    if (atSeconds + EPSILON < readyAt) {
      return { fired: false, cooldownRemainingSeconds: readyAt - atSeconds, projectiles: [], events: [] };
    }

    const effects = this.effectsFor(shooter.id, atSeconds);
    const fireRateMultiplier = product(effects, 'fireRateMultiplier');
    const reloadMultiplier = request.reloadMultiplier ?? 1;
    if (!Number.isFinite(reloadMultiplier) || reloadMultiplier <= 0) throw new Error('reloadMultiplier must be positive');
    const cooldown = weapon.projectile.reloadSeconds * reloadMultiplier / Math.max(EPSILON, fireRateMultiplier);
    const nextReadyAt = atSeconds + cooldown;
    this.#weaponReadyAt.set(key, nextReadyAt);

    const oneShot = effects.find((effect) => effect.nextShotDamageMultiplier !== undefined || effect.infinitePenetration);
    const damageMultiplier = (request.damageMultiplier ?? 1) * product(effects, 'damageDealtMultiplier') * (oneShot?.nextShotDamageMultiplier ?? 1);
    const pelletCount = Math.max(1, Math.trunc(weapon.projectile.pellets ?? 1));
    const spread = weapon.projectile.spreadRadians ?? 0;
    const projectiles: ProjectileSpawnSpec[] = [];
    let ordinal = 0;

    for (const barrel of weapon.barrels) {
      const muzzle = barrelMuzzle(request.muzzleOrigin, request.aimRadians, barrel);
      for (let pellet = 0; pellet < pelletCount; pellet += 1) {
        const angle = request.aimRadians + barrel.off + spreadOffset(pellet, pelletCount, spread);
        projectiles.push({
          id: request.projectileId(ordinal++),
          ownerId: shooter.id,
          ownerTeamId: shooter.teamId,
          weaponId: weapon.id,
          position: muzzle,
          angle,
          damage: weapon.projectile.damage * damageMultiplier,
          speed: weapon.projectile.speed,
          radius: weapon.projectile.radius,
          penetrationRemaining: oneShot?.infinitePenetration ? Number.POSITIVE_INFINITY : weapon.projectile.penetration,
          ttlSeconds: weapon.projectile.ttlSeconds ?? DEFAULT_PROJECTILE_TTL_SECONDS,
          splashRadius: weapon.projectile.splashRadius ?? 0,
          splashDamageScale: weapon.projectile.splashDamageScale ?? 0,
          knockback: weapon.projectile.knockback ?? 0,
          clusterCount: weapon.projectile.clusterCount ?? 0,
          clusterDamage: weapon.projectile.clusterDamage ?? 0,
          sourceProjectile: weapon.projectile,
        });
      }
    }

    if (oneShot) this.#effects.set(shooter.id, effects.filter((effect) => effect !== oneShot));

    const events: CombatSemanticEvent[] = [
      { type: 'weapon-fired', atSeconds, actorId: shooter.id, weaponId: weapon.id, projectileIds: projectiles.map((projectile) => projectile.id) },
      { type: 'weapon-cooldown', atSeconds, actorId: shooter.id, weaponId: weapon.id, readyAtSeconds: nextReadyAt },
    ];
    return { fired: true, cooldownRemainingSeconds: cooldown, projectiles, events };
  }

  resolveDirectHit(request: DirectHitRequest): DamageResult {
    const { projectile, target, atSeconds } = request;
    const events: CombatSemanticEvent[] = [];
    if (!target.alive || target.health <= 0 || target.teamId === projectile.ownerTeamId) {
      return { target, rawDamage: 0, appliedDamage: 0, reflectedDamage: 0, remainingPenetration: projectile.penetrationRemaining, destroyed: false, events };
    }

    const effects = this.effectsFor(target.id, atSeconds);
    const rawDamage = projectile.damage;
    const invulnerable = effects.some((effect) => effect.invulnerable);
    const armor = Math.max(0, target.armor ?? 0);
    const effectiveArmor = Number.isFinite(projectile.penetrationRemaining) ? Math.max(0, armor - projectile.penetrationRemaining) : 0;
    const armorMultiplier = 100 / (100 + effectiveArmor);
    const baseReduction = clamp01(target.baseDamageReduction ?? 0);
    const takenMultiplier = product(effects, 'damageTakenMultiplier');
    const appliedDamage = invulnerable ? 0 : Math.min(target.health, Math.max(0, rawDamage * armorMultiplier * (1 - baseReduction) * takenMultiplier));
    const health = Math.max(0, target.health - appliedDamage);
    const destroyed = target.alive && health <= EPSILON;
    const reflectFraction = Math.max(0, ...effects.map((effect) => effect.reflectFraction ?? 0));
    const reflectedDamage = appliedDamage * reflectFraction;
    const nextTarget: CombatantState = { ...target, health, alive: !destroyed };
    const remainingPenetration = Number.isFinite(projectile.penetrationRemaining)
      ? Math.max(0, projectile.penetrationRemaining - 1)
      : projectile.penetrationRemaining;

    events.push({ type: 'projectile-hit', atSeconds, actorId: projectile.ownerId, targetId: target.id, projectileId: projectile.id, damage: appliedDamage });
    if (appliedDamage > 0) events.push({ type: 'combatant-damaged', atSeconds, actorId: projectile.ownerId, targetId: target.id, damage: appliedDamage, remainingHealth: health });
    if (destroyed) events.push({ type: 'combatant-destroyed', atSeconds, actorId: projectile.ownerId, targetId: target.id });
    if (reflectedDamage > 0) events.push({ type: 'damage-reflected', atSeconds, actorId: target.id, targetId: projectile.ownerId, damage: reflectedDamage });

    return { target: nextTarget, rawDamage, appliedDamage, reflectedDamage, remainingPenetration, destroyed, events };
  }

  resolveSplash(projectile: ProjectileSpawnSpec, targets: readonly SplashTarget[], atSeconds: number): SplashDamageResult {
    if (projectile.splashRadius <= 0 || projectile.splashDamageScale <= 0) return { results: [], events: [] };
    const scaledProjectile: ProjectileSpawnSpec = { ...projectile, damage: projectile.damage * projectile.splashDamageScale };
    const results: DamageResult[] = [];
    const events: CombatSemanticEvent[] = [];
    for (const entry of targets) {
      const exposure = clamp01(entry.exposure ?? 1);
      if (exposure <= 0) continue;
      const result = this.resolveDirectHit({ projectile: { ...scaledProjectile, damage: scaledProjectile.damage * exposure }, target: entry.combatant, atSeconds });
      results.push(result);
      events.push(...result.events);
    }
    events.push({ type: 'splash-resolved', atSeconds, actorId: projectile.ownerId, projectileId: projectile.id, targetIds: results.map((result) => result.target.id) });
    return { results, events };
  }

  damageCover(port: CoverDamagePort, terrainId: number, projectile: ProjectileSpawnSpec, atSeconds: number, multiplier = 1): readonly CombatSemanticEvent[] {
    const amount = finiteNonNegative(projectile.damage * multiplier, 'cover damage');
    const result = port.damageCover(terrainId, amount, atSeconds * 1000);
    return [{ type: 'cover-damaged', atSeconds, actorId: projectile.ownerId, terrainId, damage: result.applied, destroyed: result.destroyed }];
  }

  spawnCluster(parent: ProjectileSpawnSpec, atPosition: Vec2, projectileId: (ordinal: number) => string): readonly ProjectileSpawnSpec[] {
    const count = Math.max(0, Math.trunc(parent.clusterCount));
    if (count === 0 || parent.clusterDamage <= 0) return [];
    const children: ProjectileSpawnSpec[] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      children.push({
        ...parent,
        id: projectileId(index),
        position: { ...atPosition },
        angle,
        damage: parent.clusterDamage,
        speed: parent.speed * 0.55,
        radius: Math.max(2.5, parent.radius * 0.55),
        penetrationRemaining: 1,
        ttlSeconds: Math.min(0.75, parent.ttlSeconds),
        splashRadius: parent.splashRadius > 0 ? Math.max(24, parent.splashRadius * 0.7) : 0,
        splashDamageScale: parent.splashDamageScale,
        clusterCount: 0,
        clusterDamage: 0,
      });
    }
    return children;
  }

  activateAbility(request: AbilityActivationRequest): AbilityActivationResult {
    const { actor, ability, atSeconds } = request;
    if (!actor.alive || actor.health <= 0) return { activated: false, cooldownRemainingSeconds: 0, effects: [], events: [] };
    const key = `${actor.id}:${ability.id}`;
    const readyAt = this.#abilityReadyAt.get(key) ?? 0;
    if (atSeconds + EPSILON < readyAt) return { activated: false, cooldownRemainingSeconds: readyAt - atSeconds, effects: [], events: [] };

    const nextReadyAt = atSeconds + ability.cooldownSeconds;
    this.#abilityReadyAt.set(key, nextReadyAt);
    const effect = abilityEffect(actor.id, ability, atSeconds);
    const effects = effect ? [effect] : [];
    if (effect) this.#effects.set(actor.id, [...this.effectsFor(actor.id, atSeconds), effect]);
    const activeUntilSeconds = effect?.expiresAtSeconds ?? atSeconds + ability.durationSeconds;
    const events: CombatSemanticEvent[] = [
      { type: 'ability-activated', atSeconds, actorId: actor.id, abilityId: ability.id, activeUntilSeconds },
      { type: 'ability-cooldown', atSeconds, actorId: actor.id, abilityId: ability.id, readyAtSeconds: nextReadyAt },
    ];
    return { activated: true, cooldownRemainingSeconds: ability.cooldownSeconds, effects, events };
  }

  createAbilityShot(actorId: string, ability: AbilityDefinition, weapon: WeaponDefinition, baseDamageMultiplier = 1): { readonly damageMultiplier: number; readonly penetrationOverride?: number; readonly pelletsOverride?: number; readonly spreadOverride?: number } {
    switch (ability.id) {
      case 'ragnarok': return { damageMultiplier: 3 * baseDamageMultiplier };
      case 'pointblank': return { damageMultiplier: baseDamageMultiplier, pelletsOverride: 9, spreadOverride: Math.max(weapon.projectile.spreadRadians ?? 0, 0.42) };
      case 'supercharge': return { damageMultiplier: 2.5 * baseDamageMultiplier, penetrationOverride: Number.POSITIVE_INFINITY };
      default: return { damageMultiplier: baseDamageMultiplier };
    }
  }
}
