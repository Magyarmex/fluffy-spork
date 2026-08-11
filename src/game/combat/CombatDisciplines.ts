import type { Vec2 } from '../simulation/math';
import type { ProjectileSpawnSpec } from './types';

const TAU = Math.PI * 2;
const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function clamp01(value: number): number { return clamp(value, 0, 1); }
function angleDelta(target: number, current: number): number {
  let delta = (target - current + Math.PI) % TAU;
  if (delta < 0) delta += TAU;
  return delta - Math.PI;
}

export type CombatLineage = 'scout' | 'gunner' | 'cannon' | 'controller' | 'sniper' | 'guardian';
export type GunnerFireMode = 'single' | 'twin' | 'minigun' | 'shotgun' | 'beam' | 'shell';

export interface GunnerDisciplineState {
  readonly heat: number;
  readonly stability: number;
  readonly lastShotAngle?: number;
  readonly shotIndex: number;
}

export interface GunnerFireContext {
  readonly classId: string;
  readonly fireMode: GunnerFireMode;
  readonly angle: number;
  readonly velocity: Vec2;
  readonly maxSpeed: number;
  readonly projectiles: readonly ProjectileSpawnSpec[];
  readonly state: GunnerDisciplineState;
}

export interface GunnerFireOutcome {
  readonly state: GunnerDisciplineState;
  readonly projectiles: readonly ProjectileSpawnSpec[];
  readonly recoilVelocityDelta: Vec2;
  readonly cooldownMultiplier: number;
  readonly recoverySeconds: number;
  readonly redlinePenaltySeconds: number;
  readonly apexMeter: number;
}

export interface CannonDisciplineProfile {
  readonly heavy: boolean;
  readonly cluster: boolean;
  readonly structureMultiplier: number;
}

export interface CannonProgram {
  readonly depth: number;
  readonly range: number;
  readonly fuseDistance: number;
  readonly fuseArmed: boolean;
  readonly profile: CannonDisciplineProfile;
}

export interface CannonApexOutcome {
  readonly projectile: ProjectileSpawnSpec;
  readonly cooldownMultiplier: number;
  readonly structureMultiplier: number;
  readonly apexMeter: number;
  readonly commitmentSeconds: number;
}

export interface GuardianProfile {
  readonly arcRadians: number;
  readonly passiveReduction: number;
  readonly activeReduction: number;
  readonly perfectWindowSeconds: number;
  readonly counterCoefficient: number;
}

export interface GuardianDamageRequest {
  readonly classId: string;
  readonly tankAngle: number;
  readonly incomingBearing: number;
  readonly rawDamage: number;
  readonly activeDefense: boolean;
  readonly withinPerfectGuardWindow: boolean;
  readonly anchor?: number;
}

export interface GuardianDamageOutcome {
  readonly appliedDamage: number;
  readonly perfectGuard: boolean;
  readonly counterCharge: number;
  readonly frontal: boolean;
}

export interface GuardianCountershotOutcome {
  readonly projectile: ProjectileSpawnSpec;
  readonly consumedCharge: boolean;
}

export interface ChargeStepRequest {
  readonly classId: 'juggernaut' | 'meteor' | 'ravager';
  readonly charge: number;
  readonly velocity: Vec2;
  readonly maxSpeed: number;
  readonly previousMoveAngle?: number;
  readonly dtSeconds: number;
  readonly terrainBump?: boolean;
}

export interface ChargeStepOutcome {
  readonly charge: number;
  readonly moveAngle: number;
}

export function gunSweet(heat: number): number { return clamp(1 - Math.abs(clamp(heat, 0, 1.2) - 0.56) / 0.30, 0, 1); }
export function tempestBand(heat: number): number { return clamp(1 - Math.abs(clamp(heat, 0, 1.2) - 0.56) / 0.36, 0, 1); }
export function needleGate(heat: number, stability: number): number {
  return clamp(1 - Math.abs(clamp(heat, 0, 1.2) - 0.56) / 0.105, 0, 1) * clamp((clamp01(stability) - 0.70) / 0.25, 0, 1);
}
export function flakDiscipline(heat: number, stability: number): number {
  return clamp(1 - Math.abs(clamp(heat, 0, 1.2) - 0.43) / 0.34, 0, 1) * clamp((clamp01(stability) - 0.58) / 0.34, 0, 1);
}
export function clusterSectorWidth(depth: number): number { return 1.92 - clamp01(depth) * 0.88; }

function heatAdd(classId: string, fireMode: GunnerFireMode, projectileCount: number): number {
  let base = fireMode === 'minigun' ? 0.046 : fireMode === 'shotgun' ? 0.24 : 0.13;
  if (classId === 'tempest') base *= 0.82;
  if (classId === 'needlestorm') base *= 1.05;
  return base * Math.max(1, fireMode === 'shotgun' ? 1 : Math.min(2, projectileCount));
}

function rotateProjectile(projectile: ProjectileSpawnSpec, delta: number, speedMultiplier = 1): ProjectileSpawnSpec {
  return { ...projectile, angle: projectile.angle + delta, speed: projectile.speed * speedMultiplier };
}
function aimProjectile(projectile: ProjectileSpawnSpec, targetAngle: number, factor: number, speedMultiplier = 1): ProjectileSpawnSpec {
  return rotateProjectile(projectile, angleDelta(targetAngle, projectile.angle) * factor, speedMultiplier);
}

/** Applies v1.7.0 Gunner discipline and the v1.7.1 Gunner apex layer to an already-spawned volley. */
export function applyGunnerFireDiscipline(context: GunnerFireContext): GunnerFireOutcome {
  const { classId, fireMode, angle, velocity, maxSpeed, projectiles } = context;
  const prior = context.state;
  const lastAngle = prior.lastShotAngle ?? angle;
  const turn = Math.abs(angleDelta(angle, lastAngle));
  const speed = Math.hypot(velocity.x, velocity.y);
  const settle = clamp(1 - turn / 0.22, 0, 1) * clamp(1 - (speed / Math.max(1, maxSpeed)) * 0.22, 0, 1);
  const stability = clamp01(prior.stability * 0.45 + settle * 0.55);
  const heat = clamp(prior.heat + heatAdd(classId, fireMode, projectiles.length), 0, 1.18);
  const shotIndex = prior.shotIndex + 1;
  const sweet = gunSweet(heat);
  const over = clamp((heat - 0.78) / 0.30, 0, 1);

  let transformed = projectiles.map((projectile, index) => {
    const pattern = Math.sin((shotIndex + index * 0.61) * 2.399963 + Number.parseInt(context.projectiles[0]?.ownerId ?? '0', 10) * 0.173 || 0);
    if (fireMode === 'shotgun') {
      const tighten = clamp(0.08 + stability * 0.28 - over * 0.10, 0, 0.34);
      const aimed = aimProjectile(projectile, angle, tighten, 1 + sweet * stability * 0.025);
      return sweet > 0.62 && stability > 0.56 ? { ...aimed, damage: aimed.damage * 1.045 } : aimed;
    }
    const spread = (1 - stability) * 0.028 + over * 0.075;
    const rotated = rotateProjectile(projectile, pattern * spread, 1 + sweet * stability * 0.045);
    return sweet > 0.62 && stability > 0.56 ? { ...rotated, damage: rotated.damage * 1.045 } : rotated;
  });

  const kick = (fireMode === 'shotgun' ? 11 : 3 + transformed.length * 0.55) * (0.72 + heat * 0.52);
  let cooldownMultiplier = 1;
  let recoverySeconds = 0;
  let redlinePenaltySeconds = 0;
  let apexMeter = 0;

  if (classId === 'tempest') {
    const band = tempestBand(heat); apexMeter = band;
    if (band > 0.58 && stability > 0.52) cooldownMultiplier *= 0.88;
    if (heat > 0.90) { cooldownMultiplier *= 1.16; redlinePenaltySeconds = 0.22; }
  } else if (classId === 'needlestorm') {
    const gate = needleGate(heat, stability); apexMeter = gate;
    if (gate > 0.64) transformed = transformed.map((p) => ({ ...p, speed: p.speed * 1.08, damage: p.damage * 1.04, penetrationRemaining: Number.isFinite(p.penetrationRemaining) ? p.penetrationRemaining + 1 : p.penetrationRemaining }));
  } else if (classId === 'breachlord') {
    const braced = heat < 0.54 && stability > 0.72; apexMeter = braced ? 1 : 0;
    if (braced) { transformed = transformed.map((p) => ({ ...aimProjectile(p, angle, 0.12, 1.035), damage: p.damage * 1.055 })); recoverySeconds = 0.30; }
  } else if (classId === 'flakmaster') {
    const discipline = flakDiscipline(heat, stability); apexMeter = discipline;
    if (discipline > 0.48) transformed = transformed.map((p) => ({ ...aimProjectile(p, angle, 0.08 + 0.06 * discipline, 1 + 0.08 * discipline), ttlSeconds: p.ttlSeconds * (1 + 0.10 * discipline) }));
  }

  return {
    state: { heat, stability, lastShotAngle: angle, shotIndex }, projectiles: transformed,
    recoilVelocityDelta: { x: -Math.cos(angle) * kick, y: -Math.sin(angle) * kick },
    cooldownMultiplier, recoverySeconds, redlinePenaltySeconds, apexMeter,
  };
}

export function coolGunnerDiscipline(state: GunnerDisciplineState, fireMode: GunnerFireMode, dtSeconds: number): GunnerDisciplineState {
  const cool = fireMode === 'minigun' ? 0.48 : 0.62;
  return { ...state, heat: Math.max(0, state.heat - Math.max(0, dtSeconds) * cool), stability: clamp01(state.stability + Math.max(0, dtSeconds) * 0.7) };
}

export function cannonProfile(classId: string): CannonDisciplineProfile {
  const heavy = classId === 'siegebomber' || classId === 'annihilator' || classId === 'quakecannon';
  const cluster = classId === 'bomber' || classId === 'clusterking' || classId === 'siegebomber';
  const structureMultiplier = classId === 'annihilator' || classId === 'quakecannon' ? 1.9 : classId === 'siegebomber' ? 1.75 : classId === 'demolisher' ? 1.55 : 1.35;
  return { heavy, cluster, structureMultiplier };
}

export function programCannonFuse(classId: string, depth: number, weaponRange: number): CannonProgram {
  const normalized = clamp(depth, 0.08, 1);
  const range = Math.max(1, weaponRange);
  const fuseDistance = clamp(range * (0.20 + 0.78 * normalized), 150, range * 0.965);
  return { depth: normalized, range, fuseDistance, fuseArmed: fuseDistance > 210, profile: cannonProfile(classId) };
}

export function applyCannonApex(classId: string, projectile: ProjectileSpawnSpec, depth: number): CannonApexOutcome {
  const normalized = clamp01(depth);
  let next = projectile;
  let cooldownMultiplier = 1;
  let structureMultiplier = cannonProfile(classId).structureMultiplier;
  let apexMeter = normalized;
  let commitmentSeconds = 0;
  if (classId === 'siegebomber') structureMultiplier = Math.max(structureMultiplier, 2.35);
  else if (classId === 'annihilator') {
    const commitment = clamp((normalized - 0.46) / 0.42, 0, 1); apexMeter = commitment;
    if (commitment > 0.15) {
      next = { ...next, damage: next.damage * (1 + 0.10 * commitment), splashRadius: next.splashRadius * (1 + 0.13 * commitment), knockback: next.knockback * (1 + 0.12 * commitment) };
      cooldownMultiplier *= 1 + 0.22 * commitment;
      commitmentSeconds = 0.18 + 0.18 * commitment;
    }
  } else if (classId === 'quakecannon') {
    next = { ...next, knockback: next.knockback * (1 + 0.62 * normalized), splashRadius: next.splashRadius * (1 + 0.10 * normalized) };
  }
  return { projectile: next, cooldownMultiplier, structureMultiplier, apexMeter, commitmentSeconds };
}

export function clusterSectorAngles(centerRadians: number, childCount: number, depth: number): readonly number[] {
  const count = Math.max(0, Math.trunc(childCount));
  if (count === 0) return [];
  const width = clusterSectorWidth(depth);
  return Array.from({ length: count }, (_, index) => centerRadians - width * 0.5 + width * (count === 1 ? 0.5 : index / (count - 1)));
}

export function structuralCoverDamage(baseDamage: number, structureMultiplier: number, shell: boolean): number {
  return Math.max(0, baseDamage) * (shell ? 1.35 : 1) * Math.max(0, structureMultiplier - 1);
}

export function guardianProfile(classId: string): GuardianProfile {
  if (classId === 'bastion') return { arcRadians: 1.52, passiveReduction: 0.30, activeReduction: 0.80, perfectWindowSeconds: 0.34, counterCoefficient: 0.48 };
  if (classId === 'aegis') return { arcRadians: 2.36, passiveReduction: 0.26, activeReduction: 0.86, perfectWindowSeconds: 0.42, counterCoefficient: 0.42 };
  if (classId === 'fortress') return { arcRadians: 1.82, passiveReduction: 0.25, activeReduction: 0.78, perfectWindowSeconds: 0.32, counterCoefficient: 0.44 };
  if (classId === 'juggernaut') return { arcRadians: 1.62, passiveReduction: 0.16, activeReduction: 0.62, perfectWindowSeconds: 0.25, counterCoefficient: 0.34 };
  if (classId === 'meteor') return { arcRadians: 1.72, passiveReduction: 0.18, activeReduction: 0.64, perfectWindowSeconds: 0.26, counterCoefficient: 0.36 };
  if (classId === 'ravager') return { arcRadians: 1.66, passiveReduction: 0.17, activeReduction: 0.64, perfectWindowSeconds: 0.24, counterCoefficient: 0.38 };
  return { arcRadians: 1.96, passiveReduction: 0.20, activeReduction: 0.72, perfectWindowSeconds: 0.32, counterCoefficient: 0.40 };
}

export function resolveGuardianDirectionalDamage(request: GuardianDamageRequest): GuardianDamageOutcome {
  const profile = guardianProfile(request.classId);
  const difference = Math.abs(angleDelta(request.incomingBearing, request.tankAngle));
  const frontal = difference <= profile.arcRadians * 0.5;
  if (request.activeDefense && frontal && request.withinPerfectGuardWindow) return { appliedDamage: 0, perfectGuard: true, counterCharge: 1, frontal };
  let factor = 1;
  if (frontal) factor *= 1 - profile.passiveReduction;
  else if (difference < profile.arcRadians * 0.72) factor *= 1 - profile.passiveReduction * 0.32;
  if (request.activeDefense && frontal) factor *= 1 - profile.activeReduction;
  else if (request.activeDefense && difference < profile.arcRadians * 0.72) factor *= 0.86;
  if (request.classId === 'bastion' && (request.anchor ?? 0) > 0.88 && difference <= 0.62) factor *= 0.82;
  const counterCharge = request.activeDefense && frontal ? clamp(profile.counterCoefficient * (1 - factor), 0, 1) : 0;
  return { appliedDamage: Math.max(0, request.rawDamage) * factor, perfectGuard: false, counterCharge, frontal };
}

export function applyGuardianCountershot(projectile: ProjectileSpawnSpec, counterCharge: number): GuardianCountershotOutcome {
  const charge = clamp01(counterCharge);
  if (charge <= EPSILON) return { projectile, consumedCharge: false };
  return { projectile: { ...projectile, damage: projectile.damage * (1 + 0.34 * charge), speed: projectile.speed * (1 + 0.08 * charge), penetrationRemaining: charge > 0.82 && Number.isFinite(projectile.penetrationRemaining) ? projectile.penetrationRemaining + 1 : projectile.penetrationRemaining }, consumedCharge: true };
}

export function stepGuardianCharge(request: ChargeStepRequest): ChargeStepOutcome {
  const dt = Math.max(0, request.dtSeconds);
  const speed = Math.hypot(request.velocity.x, request.velocity.y);
  const ratio = speed / Math.max(1, request.maxSpeed);
  const moveAngle = speed > 8 ? Math.atan2(request.velocity.y, request.velocity.x) : (request.previousMoveAngle ?? 0);
  const turn = request.previousMoveAngle === undefined ? 0 : Math.abs(angleDelta(moveAngle, request.previousMoveAngle));
  let charge = clamp01(request.charge);
  if (request.classId === 'meteor') {
    if (speed > 55 && turn < 0.15) charge = clamp01(charge + dt * 0.24);
    else if (turn > 0.20) charge = Math.max(0, charge - dt * (0.55 + turn * 1.8));
  } else if (request.classId === 'ravager') {
    if (speed > 48 && turn < 0.42) charge = clamp01(charge + dt * 0.10);
    else if (turn > 0.58) charge = Math.max(0, charge - dt * (0.30 + turn * 0.72));
  } else {
    if (ratio > 0.56 && turn < 0.25) charge = clamp01(charge + dt * (0.48 + ratio * 0.24));
    else charge = Math.max(0, charge - dt * (0.75 + turn * 1.5));
  }
  if (request.terrainBump && speed > 55 && charge > 0.18) charge *= 0.22;
  return { charge, moveAngle };
}

export function guardianBodyDamageMultiplier(classId: string, charge: number): number {
  const c = clamp01(charge);
  const base = classId === 'juggernaut' || classId === 'meteor' || classId === 'ravager' ? 1 + 0.82 * c : 1;
  if (classId === 'meteor') return base * (1 + 0.24 * c);
  if (classId === 'ravager') return base * (1 + 0.08 * c);
  return base;
}

export function breachlordMovementMultiplier(recovering: boolean): number { return recovering ? 0.86 : 1; }
export function aegisFlowMovementMultiplier(flowing: boolean): number { return flowing ? 1.10 : 1; }
