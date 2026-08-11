import { clampMagnitude, length, normalize, scale, vec2, type Vec2 } from '../simulation/math';
import type { Battlefield } from '../battlefield/Battlefield';
import { moveCircleWithSliding } from '../collision/terrainCollision';
import type { DroneKinematicState, DroneMovementConfig } from './types';

export function stepDroneVelocity(
  state: DroneKinematicState,
  desiredDirection: Vec2,
  config: DroneMovementConfig,
  battlefield: Battlefield,
  dtSeconds: number,
  radius = 8,
): DroneKinematicState {
  if (!Number.isFinite(config.maxSpeed) || config.maxSpeed < 0) throw new Error('maxSpeed must be finite and non-negative');
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new Error('dtSeconds must be finite and non-negative');
  const direction = clampMagnitude(desiredDirection, 1);
  const desiredVelocity = scale(direction, config.maxSpeed);
  const factor = Math.min(1, dtSeconds * (config.response ?? 10));
  const velocity = vec2(
    state.velocity.x + (desiredVelocity.x - state.velocity.x) * factor,
    state.velocity.y + (desiredVelocity.y - state.velocity.y) * factor,
  );
  const moved = moveCircleWithSliding(battlefield, state.position, velocity, radius, dtSeconds);
  const rotation = length(moved.velocity) > 1e-6
    ? Math.atan2(normalize(moved.velocity).y, normalize(moved.velocity).x)
    : state.rotation;
  return { position: moved.position, velocity: moved.velocity, rotation };
}
