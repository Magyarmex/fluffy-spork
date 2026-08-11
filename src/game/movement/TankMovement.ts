import type { Battlefield } from '../battlefield/Battlefield';
import { clampMagnitude, length, normalize, scale, vec2, type Vec2 } from '../simulation/math';
import { moveCircleWithSliding } from '../collision/terrainCollision';
import {
  LEGACY_TANK_BASE_SPEED,
  LEGACY_TANK_BOUNDARY_PADDING,
  LEGACY_TANK_RESPONSE,
  LEGACY_TURRET_RESPONSE,
  type TankKinematicState,
  type TankMovementConfig,
  type TankMovementIntent,
} from './types';

const TAU = Math.PI * 2;

export function normalizeAngle(angle: number): number {
  let value = angle % TAU;
  if (value <= -Math.PI) value += TAU;
  if (value > Math.PI) value -= TAU;
  return value;
}

export function approachAngle(current: number, target: number, factor: number): number {
  const delta = normalizeAngle(target - current);
  return normalizeAngle(current + delta * Math.max(0, Math.min(1, factor)));
}

export function tankMaxSpeed(config: TankMovementConfig): number {
  const upgrades = config.speedUpgradeLevel ?? 0;
  const situational = config.speedMultiplier ?? 1;
  if (!Number.isFinite(config.moveMultiplier) || config.moveMultiplier < 0) throw new Error('moveMultiplier must be finite and non-negative');
  if (!Number.isFinite(upgrades) || upgrades < 0) throw new Error('speedUpgradeLevel must be finite and non-negative');
  if (!Number.isFinite(situational) || situational < 0) throw new Error('speedMultiplier must be finite and non-negative');
  return LEGACY_TANK_BASE_SPEED * config.moveMultiplier * (1 + 0.045 * upgrades) * situational;
}

export function stepTankMovement(
  state: TankKinematicState,
  intent: TankMovementIntent,
  config: TankMovementConfig,
  battlefield: Battlefield,
  dtSeconds: number,
): TankKinematicState {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new Error('dtSeconds must be finite and non-negative');
  const input = clampMagnitude(intent.move, 1);
  const desiredVelocity = scale(input, tankMaxSpeed(config));
  const response = config.response ?? LEGACY_TANK_RESPONSE;
  const factor = Math.min(1, dtSeconds * response);
  const velocity = vec2(
    state.velocity.x + (desiredVelocity.x - state.velocity.x) * factor,
    state.velocity.y + (desiredVelocity.y - state.velocity.y) * factor,
  );
  const radius = config.radius ?? LEGACY_TANK_BOUNDARY_PADDING;
  const movement = moveCircleWithSliding(battlefield, state.position, velocity, radius, dtSeconds);

  let hullRotation = state.hullRotation;
  if (length(movement.velocity) > 1e-6) {
    const facing = normalize(movement.velocity);
    hullRotation = Math.atan2(facing.y, facing.x);
  }

  const turretRotation = intent.aimAngle === undefined
    ? state.turretRotation
    : approachAngle(state.turretRotation, intent.aimAngle, dtSeconds * (config.turretResponse ?? LEGACY_TURRET_RESPONSE));

  return {
    position: movement.position,
    velocity: movement.velocity,
    hullRotation,
    turretRotation,
  };
}

export function movementIntent(x: number, y: number, aimAngle?: number): TankMovementIntent {
  return { move: vec2(x, y), ...(aimAngle === undefined ? {} : { aimAngle }) };
}
