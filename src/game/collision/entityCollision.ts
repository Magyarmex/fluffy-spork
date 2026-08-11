import { distance, normalize, scale, subtract, vec2, type Vec2 } from '../simulation/math';

export interface CircleBody {
  readonly position: Vec2;
  readonly radius: number;
  readonly immovable?: boolean;
}

export interface CirclePairResolution {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly collided: boolean;
}

export function resolveCirclePair(a: CircleBody, b: CircleBody): CirclePairResolution {
  if (a.radius < 0 || b.radius < 0) throw new Error('circle radius must be non-negative');
  const delta = subtract(b.position, a.position);
  const separation = distance(a.position, b.position);
  const overlap = a.radius + b.radius - separation;
  if (overlap <= 0) return { a: a.position, b: b.position, collided: false };

  const normal = separation > 1e-9 ? normalize(delta) : vec2(1, 0);
  if (a.immovable && b.immovable) return { a: a.position, b: b.position, collided: true };
  if (a.immovable) return { a: a.position, b: { x: b.position.x + normal.x * overlap, y: b.position.y + normal.y * overlap }, collided: true };
  if (b.immovable) return { a: { x: a.position.x - normal.x * overlap, y: a.position.y - normal.y * overlap }, b: b.position, collided: true };

  const correction = scale(normal, overlap * 0.5);
  return {
    a: { x: a.position.x - correction.x, y: a.position.y - correction.y },
    b: { x: b.position.x + correction.x, y: b.position.y + correction.y },
    collided: true,
  };
}
