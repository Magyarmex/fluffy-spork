import type { Battlefield } from '../../battlefield/Battlefield';
import { add, distance, scale, type Vec2 } from '../../simulation/math';

export interface ProjectileKinematicState {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
  readonly ageSeconds: number;
  readonly distanceTravelled: number;
  readonly ttlSeconds: number;
  readonly maxRange?: number;
}

export interface ProjectileStepResult {
  readonly state: ProjectileKinematicState;
  readonly active: boolean;
  readonly reason?: 'terrain' | 'lifetime' | 'range' | 'bounds';
  readonly terrainId?: number;
}

export function stepProjectile(state: ProjectileKinematicState, battlefield: Battlefield, dtSeconds: number): ProjectileStepResult {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new Error('dtSeconds must be finite and non-negative');
  const nextAge = state.ageSeconds + dtSeconds;
  if (nextAge >= state.ttlSeconds) return { state: { ...state, ageSeconds: nextAge }, active: false, reason: 'lifetime' };

  const end = add(state.position, scale(state.velocity, dtSeconds));
  const segmentDistance = distance(state.position, end);
  const nextDistance = state.distanceTravelled + segmentDistance;
  if (state.maxRange !== undefined && nextDistance >= state.maxRange) {
    const remaining = Math.max(0, state.maxRange - state.distanceTravelled);
    const ratio = segmentDistance > 0 ? Math.min(1, remaining / segmentDistance) : 0;
    return {
      state: { ...state, position: add(state.position, scale(state.velocity, dtSeconds * ratio)), ageSeconds: nextAge, distanceTravelled: state.maxRange },
      active: false,
      reason: 'range',
    };
  }

  const hit = battlefield.firstTerrainHit(state.position, end, state.radius);
  if (hit) {
    return {
      state: { ...state, position: hit.point, ageSeconds: nextAge, distanceTravelled: state.distanceTravelled + segmentDistance * hit.t },
      active: false,
      reason: 'terrain',
      terrainId: hit.terrain.id,
    };
  }

  if (!battlefield.contains(end, state.radius)) {
    return { state: { ...state, position: end, ageSeconds: nextAge, distanceTravelled: nextDistance }, active: false, reason: 'bounds' };
  }

  return { state: { ...state, position: end, ageSeconds: nextAge, distanceTravelled: nextDistance }, active: true };
}
