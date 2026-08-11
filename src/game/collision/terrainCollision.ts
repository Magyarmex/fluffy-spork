import type { Battlefield } from '../battlefield/Battlefield';
import { add, dot, scale, subtract, vec2, type Vec2 } from '../simulation/math';

const SKIN = 0.01;

export interface CircleMotionResult {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly collided: boolean;
}

function clampToBounds(battlefield: Battlefield, point: Vec2, radius: number): { point: Vec2; clippedX: boolean; clippedY: boolean } {
  const x = Math.max(battlefield.bounds.minX + radius, Math.min(battlefield.bounds.maxX - radius, point.x));
  const y = Math.max(battlefield.bounds.minY + radius, Math.min(battlefield.bounds.maxY - radius, point.y));
  return { point: vec2(x, y), clippedX: x !== point.x, clippedY: y !== point.y };
}

export function moveCircleWithSliding(
  battlefield: Battlefield,
  start: Vec2,
  velocity: Vec2,
  radius: number,
  dtSeconds: number,
): CircleMotionResult {
  if (!Number.isFinite(radius) || radius < 0) throw new Error('radius must be finite and non-negative');
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new Error('dtSeconds must be finite and non-negative');
  if (dtSeconds === 0) return { position: start, velocity, collided: false };

  const rawEnd = add(start, scale(velocity, dtSeconds));
  const bounded = clampToBounds(battlefield, rawEnd, radius);
  let nextVelocity = vec2(bounded.clippedX ? 0 : velocity.x, bounded.clippedY ? 0 : velocity.y);
  let collided = bounded.clippedX || bounded.clippedY;
  let end = bounded.point;

  const hit = battlefield.firstTerrainHit(start, end, radius);
  if (!hit) return { position: end, velocity: nextVelocity, collided };

  collided = true;
  const travel = subtract(end, start);
  const impactT = Math.max(0, hit.t - SKIN / Math.max(1, Math.hypot(travel.x, travel.y)));
  const impact = add(start, scale(travel, impactT));
  const remainingSeconds = dtSeconds * Math.max(0, 1 - hit.t);
  const into = dot(nextVelocity, hit.normal);
  const slideVelocity = into < 0 ? subtract(nextVelocity, scale(hit.normal, into)) : nextVelocity;
  const slideEnd = add(impact, scale(slideVelocity, remainingSeconds));
  const boundedSlide = clampToBounds(battlefield, slideEnd, radius);

  if (!battlefield.firstTerrainHit(impact, boundedSlide.point, radius)) {
    nextVelocity = vec2(boundedSlide.clippedX ? 0 : slideVelocity.x, boundedSlide.clippedY ? 0 : slideVelocity.y);
    end = boundedSlide.point;
  } else {
    nextVelocity = vec2();
    end = impact;
  }

  return { position: end, velocity: nextVelocity, collided };
}
