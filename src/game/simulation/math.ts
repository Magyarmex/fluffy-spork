export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (value: Vec2, scalar: number): Vec2 => ({ x: value.x * scalar, y: value.y * scalar });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const lengthSquared = (value: Vec2): number => dot(value, value);
export const length = (value: Vec2): number => Math.sqrt(lengthSquared(value));
export const distanceSquared = (a: Vec2, b: Vec2): number => lengthSquared(subtract(a, b));
export const distance = (a: Vec2, b: Vec2): number => Math.sqrt(distanceSquared(a, b));

export function normalize(value: Vec2): Vec2 {
  const magnitude = length(value);
  return magnitude === 0 ? vec2() : scale(value, 1 / magnitude);
}

export function clampMagnitude(value: Vec2, maxMagnitude: number): Vec2 {
  if (!Number.isFinite(maxMagnitude) || maxMagnitude < 0) {
    throw new Error('maxMagnitude must be a finite non-negative number');
  }
  const magnitudeSquared = lengthSquared(value);
  if (magnitudeSquared <= maxMagnitude * maxMagnitude) return value;
  return scale(normalize(value), maxMagnitude);
}
