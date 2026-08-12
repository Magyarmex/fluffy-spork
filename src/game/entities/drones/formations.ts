import type { Vector2State } from '../types';
import type { DroneFormation } from './types';

function rotate(local: Vector2State, angle: number): Vector2State {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: local.x * c - local.y * s, y: local.x * s + local.y * c };
}

export function formationForOrder(order: 'follow' | 'attack' | 'defend' | 'recall', ownerLineage?: string): DroneFormation {
  if (order === 'attack') return ownerLineage === 'broodmother' ? 'claw' : 'crescent';
  if (order === 'defend') return 'phalanx';
  return 'ring';
}

export function formationSlot(
  center: Vector2State,
  facing: number,
  slot: number,
  count: number,
  formation: DroneFormation,
): Vector2State {
  const safeCount = Math.max(1, count);
  const index = ((slot % safeCount) + safeCount) % safeCount;
  let local: Vector2State;

  if (formation === 'phalanx') {
    const spacing = 34;
    local = { x: 64, y: (index - (safeCount - 1) / 2) * spacing };
  } else if (formation === 'crescent') {
    const t = safeCount === 1 ? 0 : index / (safeCount - 1) - 0.5;
    local = { x: 82 - Math.abs(t) * 32, y: t * 150 };
  } else if (formation === 'claw') {
    const side = index % 2 === 0 ? -1 : 1;
    const rank = Math.floor(index / 2);
    local = { x: 70 + rank * 30, y: side * (42 + rank * 28) };
  } else {
    const angle = (index / safeCount) * Math.PI * 2;
    local = { x: Math.cos(angle) * 82, y: Math.sin(angle) * 82 };
  }

  const world = rotate(local, facing);
  return { x: center.x + world.x, y: center.y + world.y };
}

export function commandDepth(owner: Vector2State, target: Vector2State | undefined, leash: number): number {
  if (!target || leash <= 0) return 0;
  return Math.max(0, Math.min(1, Math.hypot(target.x - owner.x, target.y - owner.y) / leash));
}

/** v1.10.7: deeper live-vector pressure deliberately spends local peel coverage. */
export function localDefenseFraction(depth: number, cutoff = 0.58, maxFraction = 0.36): number {
  const normalized = Math.max(0, Math.min(1, depth));
  if (normalized >= cutoff) return 0;
  return maxFraction * (1 - normalized / cutoff);
}
