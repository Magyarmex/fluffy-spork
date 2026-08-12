import { clampMagnitude, distanceSquared, vec2, type Vec2 } from '../simulation/math';
import type { SegmentHit, TerrainGeometry, TerrainState } from './types';

const EPSILON = 1e-9;
const NORMAL_EPSILON = 2.5;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function isSolidTerrain(terrain: Readonly<TerrainState>): boolean {
  return terrain.solid !== false && (!terrain.destructible || terrain.health > 0);
}

export function pointInsideTerrain(terrain: Readonly<TerrainState>, point: Vec2, padding = 0): boolean {
  if (!isSolidTerrain(terrain)) return false;
  const geometry = terrain.geometry;
  if (geometry.shape === 'circle') {
    const radius = geometry.radius + padding;
    return distanceSquared(point, geometry) <= radius * radius;
  }
  return Math.abs(point.x - geometry.x) <= geometry.width * 0.5 + padding
    && Math.abs(point.y - geometry.y) <= geometry.height * 0.5 + padding;
}

function segmentRectHit(start: Vec2, end: Vec2, geometry: Extract<TerrainGeometry, { shape: 'rect' }>, padding: number): SegmentHit | null {
  const minX = geometry.x - geometry.width * 0.5 - padding;
  const maxX = geometry.x + geometry.width * 0.5 + padding;
  const minY = geometry.y - geometry.height * 0.5 - padding;
  const maxY = geometry.y + geometry.height * 0.5 + padding;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let t0 = 0;
  let t1 = 1;

  const slab = (p: number, q: number): boolean => {
    if (Math.abs(p) < EPSILON) return q >= 0;
    const z = q / p;
    if (p < 0) {
      if (z > t1) return false;
      if (z > t0) t0 = z;
    } else {
      if (z < t0) return false;
      if (z < t1) t1 = z;
    }
    return true;
  };

  if (!slab(-dx, start.x - minX)
    || !slab(dx, maxX - start.x)
    || !slab(-dy, start.y - minY)
    || !slab(dy, maxY - start.y)) return null;

  const t = clamp(t0, 0, 1);
  const point = vec2(start.x + dx * t, start.y + dy * t);
  let normal = vec2();
  if (Math.abs(point.x - minX) < NORMAL_EPSILON) normal = vec2(-1, 0);
  else if (Math.abs(point.x - maxX) < NORMAL_EPSILON) normal = vec2(1, 0);
  else if (Math.abs(point.y - minY) < NORMAL_EPSILON) normal = vec2(0, -1);
  else if (Math.abs(point.y - maxY) < NORMAL_EPSILON) normal = vec2(0, 1);
  return { t, point, normal };
}

function segmentCircleHit(start: Vec2, end: Vec2, geometry: Extract<TerrainGeometry, { shape: 'circle' }>, padding: number): SegmentHit | null {
  const radius = geometry.radius + padding;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - geometry.x;
  const fy = start.y - geometry.y;
  const a = dx * dx + dy * dy;
  if (a < EPSILON) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  let t = (-b - root) / (2 * a);
  if (t < 0 || t > 1) {
    t = (-b + root) / (2 * a);
    if (t < 0 || t > 1) return null;
  }
  const point = vec2(start.x + dx * t, start.y + dy * t);
  const normal = clampMagnitude(vec2(point.x - geometry.x, point.y - geometry.y), 1);
  return { t, point, normal };
}

export function segmentTerrainHit(terrain: Readonly<TerrainState>, start: Vec2, end: Vec2, padding = 0): SegmentHit | null {
  if (!isSolidTerrain(terrain)) return null;
  return terrain.geometry.shape === 'circle'
    ? segmentCircleHit(start, end, terrain.geometry, padding)
    : segmentRectHit(start, end, terrain.geometry, padding);
}

export function terrainBounds(geometry: TerrainGeometry): { minX: number; maxX: number; minY: number; maxY: number } {
  if (geometry.shape === 'circle') {
    return {
      minX: geometry.x - geometry.radius,
      maxX: geometry.x + geometry.radius,
      minY: geometry.y - geometry.radius,
      maxY: geometry.y + geometry.radius,
    };
  }
  return {
    minX: geometry.x - geometry.width * 0.5,
    maxX: geometry.x + geometry.width * 0.5,
    minY: geometry.y - geometry.height * 0.5,
    maxY: geometry.y + geometry.height * 0.5,
  };
}
