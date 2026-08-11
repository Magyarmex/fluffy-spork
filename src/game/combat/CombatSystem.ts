import type { AbilityDefinition, ProjectileDefinition, WeaponDefinition } from '../../content/schema';
import type { Vec2 } from '../simulation/math';
import type {
  AbilityActivationRequest,
  AbilityActivationResult,
  CombatAbilityAction,
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
const DEFAULT_BATTLEFIELD_HALF_EXTENT = 2250;
const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function clamp01(value: number): number { return clamp(value, 0, 1); }

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

function muzzle(origin: Vec2, angle: number, barrel: WeaponDefinition['barrels'][number], extraForward = 8): Vec2 {
  return {
    x: origin.x + Math.cos(angle) * (barrel.len + extraForward) - Math.sin(angle) * barrel.x,
    y: origin.y + Math.sin(angle) * (barrel.len + extraForward) + Math.cos(angle) * barrel.x,
  };
}

function abilityEffect(actorId: string, ability: AbilityDefinition, atSeconds: number): CombatStatusEffect | null {
  const expiresAtSeconds = atSeconds + ability.durationSeconds;
  switch (ability.id) {
    case 'overheat': return { id: 'overheat', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds, fireRateMultiplier: 1 / 0.52 };
    case 'bulwark': return { id: 'bulwark', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds, invulnerable: true };
    case 'taunt': return { id: 'iron-will', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds, damageTakenMultiplier: 0.35, reflectFraction: 0.3 };
    case 'stampede': return { id: 'stampede', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds, moveSpeedMultiplier: 1.9, bodyDamageMultiplier: 2 };
    case 'supercharge': return { id: 'supercharge', sourceId: actorId, startedAtSeconds: atSeconds, expiresAtSeconds: Number.POSITIVE_INFINITY, nextShotDamageMultiplier: 2.5, infinitePenetration: true };
    default: return null;
  }
}

function projectileSpec(
  request: WeaponFireRequest,
  id: string,
  barrel: WeaponDefinition['barrels'][number],
  angle: number,
  damageMultiplier: number,
  speedMultiplier: number,
  radiusMultiplier: number,
  penetration: number,
  oneShot?: CombatStatusEffect,
): ProjectileSpawnSpec {
  const { shooter, weapon } = request;
  const isBeam = weapon.fireMode === 'beam';
  const finalDamage = weapon.projectile.damage * damageMultiplier * (oneShot?.nextShotDamageMultiplier ?? 1);
  const sizeBonus = clamp(finalDamage * (isBeam ? 0.0038 : 0.0085), 0, isBeam ? 0.3 : 0.45);
  const speed = weapon.projectile.speed * (request.projectileSpeedMultiplier ?? 1) * speedMultiplier;
  const velocity = shooter.velocity ?? { x: 0, y: 0 };
  return {
    id,
    ownerId: shooter.id,
    ownerTeamId: shooter.teamId,
    weaponId: weapon.id,
    position: muzzle(request.muzzleOrigin, angle, barrel),
    angle,
    damage: finalDamage,
    speed,
    inheritedVelocity: { x: velocity.x * 0.22, y: velocity.y * 0.22 },
    radius: weapon.projectile.radius * radiusMultiplier * (1 + sizeBonus),
    penetrationRemaining: oneShot?.infinitePenetration ? Number.POSITIVE_INFINITY : penetration,
    ttlSeconds: weapon.projectile.ttlSeconds ?? DEFAULT_PROJECTILE_TTL_SECONDS,
    splashRadius: weapon.projectile.splashRadius ?? 0,
    splashDamageScale: weapon.projectile.splashDamageScale ?? 0,
    knockback: weapon.projectile.knockback ?? 0,
    clusterCount: weapon.projectile.clusterCount ?? 0,
    clusterDamage: weapon.projectile.clusterDamage ?? 0,
    sourceProjectile: weapon.projectile,
  };
}

function specialProjectile(
  actor: CombatantState,
  weapon: WeaponDefinition,
  id: string,
  angle: number,
  atOrigin: Vec2,
  definition: ProjectileDefinition,
  damage: number,
  speed: number,
  radius: number,
  penetration: number,
  ttlSeconds: number,
  splashRadius = 0,
  splashDamageScale = 0,
  knockback = 0,
): ProjectileSpawnSpec {
  const velocity = actor.velocity ?? { x: 0, y: 0 };
  return {
    id, ownerId: actor.id, ownerTeamId: actor.teamId, weaponId: weapon.id, position: atOrigin, angle,
    damage, speed, inheritedVelocity: { x: velocity.x * 0.22, y: velocity.y * 0.22 }, radius,
    penetrationRemaining: penetration, ttlSeconds, splashRadius, splashDamageScale, knockback,
    clusterCount: 0, clusterDamage: 0, sourceProjectile: definition,
  };
}

export class CombatSystem {
  readonly #weaponReadyAt = new Map<string, number>();
  readonly #abilityReadyAt = new Map<string, number>();
  readonly #effects = new Map<string, CombatStatusEffect[]>();
  readonly #barrelIndex = new Map<string, number>();

  effectsFor(actorId: string, atSeconds: number): readonly CombatStatusEffect[] {
    const next = [...activeEffects(this.#effects.get(actorId) ?? [], atSeconds)];
    this.#effects.set(actorId, next);
    return next.map((effect) => ({ ...effect }));
  }

  setEffects(actorId: string, effects: readonly CombatStatusEffect[]): void {
    this.#effects.set(actorId, effects.map((effect) => ({ ...effect })));
  }

  weaponReadyAt(actorId: string, weaponId: string): number { return this.#weaponReadyAt.get(`${actorId}:${weaponId}`) ?? 0; }
  abilityReadyAt(actorId: string, abilityId: string): number { return this.#abilityReadyAt.get(`${actorId}:${abilityId}`) ?? 0; }

  fire(request: WeaponFireRequest): WeaponFireResult {
    const { shooter, weapon, atSeconds } = request;
    finiteNonNegative(atSeconds, 'atSeconds');
    if (!shooter.alive || shooter.health <= 0) return { fired: false, cooldownRemainingSeconds: 0, projectiles: [], events: [] };

    const key = `${shooter.id}:${weapon.id}`;
    const readyAt = this.#weaponReadyAt.get(key) ?? 0;
    if (atSeconds + EPSILON < readyAt) return { fired: false, cooldownRemainingSeconds: readyAt - atSeconds, projectiles: [], events: [] };

    const effects = this.effectsFor(shooter.id, atSeconds);
    const reloadMultiplier = request.reloadMultiplier ?? 1;
    if (!Number.isFinite(reloadMultiplier) || reloadMultiplier <= 0) throw new Error('reloadMultiplier must be positive');
    let cooldown = weapon.projectile.reloadSeconds * reloadMultiplier / Math.max(EPSILON, product(effects, 'fireRateMultiplier'));
    if (weapon.fireMode === 'minigun') {
      const spin = clamp01(request.fireSpin ?? 1);
      cooldown = (cooldown * 0.72) / (0.3 + 0.7 * spin);
    }
    const nextReadyAt = atSeconds + cooldown;
    this.#weaponReadyAt.set(key, nextReadyAt);

    const oneShot = weapon.fireMode === 'beam' ? effects.find((effect) => effect.nextShotDamageMultiplier !== undefined || effect.infinitePenetration) : undefined;
    const baseDamageMultiplier = (request.damageMultiplier ?? 1) * product(effects, 'damageDealtMultiplier');
    const sample = request.spreadSample ?? (() => 0);
    const projectiles: ProjectileSpawnSpec[] = [];
    let ordinal = 0;
    const barrelIndex = this.#barrelIndex.get(key) ?? 0;
    const fire = (barrel: WeaponDefinition['barrels'][number], angle: number, damage = 1, speed = 1, radius = 1) => {
      projectiles.push(projectileSpec(request, request.projectileId(ordinal++), barrel, angle, baseDamageMultiplier * damage, speed, radius, weapon.projectile.penetration, oneShot));
    };

    switch (weapon.fireMode) {
      case 'twin': {
        const barrel = weapon.barrels[barrelIndex % weapon.barrels.length];
        this.#barrelIndex.set(key, barrelIndex + 1);
        fire(barrel, request.aimRadians + barrel.off);
        break;
      }
      case 'minigun': {
        const barrel = weapon.barrels[barrelIndex % weapon.barrels.length];
        this.#barrelIndex.set(key, barrelIndex + 1);
        const spin = clamp01(request.fireSpin ?? 1);
        const spread = (0.04 + (1 - spin) * 0.09) * clamp(sample(), -1, 1);
        fire(barrel, request.aimRadians + barrel.off + spread);
        break;
      }
      case 'shotgun': {
        const barrel = weapon.barrels[0];
        const pellets = Math.max(1, Math.trunc(weapon.projectile.pellets ?? 5));
        const totalSpread = weapon.projectile.spreadRadians ?? 0.2;
        for (let index = 0; index < pellets; index += 1) {
          const even = pellets === 1 ? 0 : -totalSpread / 2 + (index / (pellets - 1)) * totalSpread;
          fire(barrel, request.aimRadians + even + clamp(sample(), -1, 1) * 0.02, 1, 1.05, 0.95);
        }
        break;
      }
      case 'beam': {
        const damage = weapon.barrels.length > 1 ? 0.72 : 1;
        for (const barrel of weapon.barrels) fire(barrel, request.aimRadians + barrel.off, damage);
        break;
      }
      case 'shell':
      case 'single':
      default: {
        const barrel = weapon.barrels[0];
        fire(barrel, request.aimRadians + barrel.off);
        break;
      }
    }

    if (oneShot) this.#effects.set(shooter.id, effects.filter((effect) => effect.id !== oneShot.id));
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
    const appliedDamage = invulnerable ? 0 : Math.min(target.health, Math.max(0, rawDamage * armorMultiplier * (1 - baseReduction) * product(effects, 'damageTakenMultiplier')));
    const health = Math.max(0, target.health - appliedDamage);
    const destroyed = target.alive && health <= EPSILON;
    const reflectFraction = Math.max(0, ...effects.map((effect) => effect.reflectFraction ?? 0));
    // Legacy Iron Will reflects 30% of incoming pre-reduction damage, not 30% of the reduced damage.
    const reflectedDamage = invulnerable ? 0 : rawDamage * reflectFraction;
    const nextTarget: CombatantState = { ...target, health, alive: !destroyed };
    const remainingPenetration = Number.isFinite(projectile.penetrationRemaining) ? Math.max(0, projectile.penetrationRemaining - 1) : projectile.penetrationRemaining;

    events.push({ type: 'projectile-hit', atSeconds, actorId: projectile.ownerId, targetId: target.id, projectileId: projectile.id, damage: appliedDamage });
    if (appliedDamage > 0) events.push({ type: 'combatant-damaged', atSeconds, actorId: projectile.ownerId, targetId: target.id, damage: appliedDamage, remainingHealth: health });
    if (destroyed) events.push({ type: 'combatant-destroyed', atSeconds, actorId: projectile.ownerId, targetId: target.id });
    if (reflectedDamage > 0) events.push({ type: 'damage-reflected', atSeconds, actorId: target.id, targetId: projectile.ownerId, damage: reflectedDamage });
    return { target: nextTarget, rawDamage, appliedDamage, reflectedDamage, remainingPenetration, destroyed, events };
  }

  resolveSplash(projectile: ProjectileSpawnSpec, targets: readonly SplashTarget[], atSeconds: number): SplashDamageResult {
    if (projectile.splashRadius <= 0 || projectile.splashDamageScale <= 0) return { results: [], events: [] };
    const results: DamageResult[] = [];
    const events: CombatSemanticEvent[] = [];
    for (const entry of targets) {
      const exposure = clamp01(entry.exposure ?? 1);
      if (exposure <= 0) continue;
      const result = this.resolveDirectHit({ projectile: { ...projectile, damage: projectile.damage * projectile.splashDamageScale * exposure }, target: entry.combatant, atSeconds });
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
      children.push({ ...parent, id: projectileId(index), position: { ...atPosition }, angle, damage: parent.clusterDamage,
        speed: parent.speed * 0.55, inheritedVelocity: { x: 0, y: 0 }, radius: Math.max(2.5, parent.radius * 0.55), penetrationRemaining: 1,
        ttlSeconds: Math.min(0.75, parent.ttlSeconds), splashRadius: parent.splashRadius > 0 ? Math.max(24, parent.splashRadius * 0.7) : 0,
        splashDamageScale: parent.splashDamageScale, clusterCount: 0, clusterDamage: 0 });
    }
    return children;
  }

  activateAbility(request: AbilityActivationRequest): AbilityActivationResult {
    const { actor, ability, atSeconds } = request;
    if (!actor.alive || actor.health <= 0) return { activated: false, cooldownRemainingSeconds: 0, effects: [], actions: [], events: [] };
    const key = `${actor.id}:${ability.id}`;
    const readyAt = this.#abilityReadyAt.get(key) ?? 0;
    if (atSeconds + EPSILON < readyAt) return { activated: false, cooldownRemainingSeconds: readyAt - atSeconds, effects: [], actions: [], events: [] };

    const nextReadyAt = atSeconds + ability.cooldownSeconds;
    this.#abilityReadyAt.set(key, nextReadyAt);
    const effect = abilityEffect(actor.id, ability, atSeconds);
    const effects = effect ? [effect] : [];
    const actions: CombatAbilityAction[] = [];
    if (effect) {
      this.#effects.set(actor.id, [...this.effectsFor(actor.id, atSeconds), effect]);
      actions.push({ type: 'status-effect', effect });
    }

    const angle = request.aimRadians ?? 0;
    if (ability.id === 'ragnarok' || ability.id === 'pointblank') {
      if (!request.weapon || !request.projectileId) throw new Error(`${ability.id} requires weapon and projectileId inputs`);
      const weapon = request.weapon;
      const baseDamage = weapon.projectile.damage * (request.damageMultiplier ?? 1);
      const baseSpeed = weapon.projectile.speed * (request.projectileSpeedMultiplier ?? 1);
      if (ability.id === 'ragnarok') {
        const origin = { x: actor.position.x + Math.cos(angle) * 46, y: actor.position.y + Math.sin(angle) * 46 };
        const damage = baseDamage * 3;
        const radius = 13 * (1 + clamp(damage * 0.0085, 0, 0.45));
        actions.push({ type: 'spawn-projectiles', projectiles: [specialProjectile(actor, weapon, request.projectileId(0), angle, origin, weapon.projectile, damage, baseSpeed * 0.9, radius, 2, 1.4, 160, 0.8, 540)] });
      } else {
        const pellets: ProjectileSpawnSpec[] = [];
        for (let index = 0; index < 9; index += 1) {
          const pelletAngle = angle - 0.26 + (index / 8) * 0.52;
          const origin = { x: actor.position.x + Math.cos(pelletAngle) * 34, y: actor.position.y + Math.sin(pelletAngle) * 34 };
          pellets.push(specialProjectile(actor, weapon, request.projectileId(index), pelletAngle, origin, weapon.projectile, baseDamage * 0.95, baseSpeed * 1.25, 5, 1, 0.45));
        }
        actions.push({ type: 'spawn-projectiles', projectiles: pellets, weaponLockSeconds: 0.45 });
      }
    } else if (ability.id === 'phase') {
      const limit = request.battlefieldHalfExtent ?? DEFAULT_BATTLEFIELD_HALF_EXTENT;
      actions.push({ type: 'blink', destination: {
        x: clamp(actor.position.x + Math.cos(angle) * 420, -limit + 30, limit - 30),
        y: clamp(actor.position.y + Math.sin(angle) * 420, -limit + 30, limit - 30),
      }, cloakSeconds: 0.7 });
    } else if (ability.id === 'swarm') {
      actions.push({ type: 'temporary-drone-capacity', additionalDrones: 2, durationSeconds: 8, frenzy: true });
    }

    const activeUntilSeconds = effect?.expiresAtSeconds ?? atSeconds + ability.durationSeconds;
    const events: CombatSemanticEvent[] = [
      { type: 'ability-activated', atSeconds, actorId: actor.id, abilityId: ability.id, activeUntilSeconds },
      { type: 'ability-cooldown', atSeconds, actorId: actor.id, abilityId: ability.id, readyAtSeconds: nextReadyAt },
    ];
    return { activated: true, cooldownRemainingSeconds: ability.cooldownSeconds, effects, actions, events };
  }
}
