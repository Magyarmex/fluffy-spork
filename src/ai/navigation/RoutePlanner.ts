import { Battlefield } from '../../game/battlefield';
import { distance, type Vec2 } from '../../game/simulation/math';
import type { DynamicObstacle, RoutePlan, RoutePlannerConfig, RouteRequest } from './types';

interface GridNode {
  readonly x: number;
  readonly y: number;
}

interface OpenNode extends GridNode {
  readonly key: string;
  readonly g: number;
  readonly h: number;
  readonly f: number;
}

const CARDINAL_COST = 1;
const DIAGONAL_COST = Math.SQRT2;
const DIRECTIONS: readonly [number, number, number][] = [
  [1, 0, CARDINAL_COST], [0, 1, CARDINAL_COST], [-1, 0, CARDINAL_COST], [0, -1, CARDINAL_COST],
  [1, 1, DIAGONAL_COST], [-1, 1, DIAGONAL_COST], [-1, -1, DIAGONAL_COST], [1, -1, DIAGONAL_COST],
];

class MinHeap {
  private readonly values: OpenNode[] = [];

  get size(): number { return this.values.length; }

  push(value: OpenNode): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareOpen(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): OpenNode | undefined {
    if (this.values.length === 0) return undefined;
    const first = this.values[0];
    const last = this.values.pop();
    if (!last || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      let child = left;
      if (right < this.values.length && compareOpen(this.values[right], this.values[left]) < 0) child = right;
      if (compareOpen(last, this.values[child]) <= 0) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

function compareOpen(a: OpenNode, b: OpenNode): number {
  return a.f - b.f || a.h - b.h || a.y - b.y || a.x - b.x;
}

function gridKey(node: GridNode): string { return `${node.x}:${node.y}`; }

function octile(a: GridNode, b: GridNode): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy);
}

function pointSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

export class RoutePlanner {
  readonly cellSize: number;
  readonly defaultClearance: number;
  readonly maxExpandedNodes: number;
  private readonly cacheEntries: number;
  private readonly cache = new Map<string, RoutePlan>();

  constructor(private readonly battlefield: Battlefield, config: RoutePlannerConfig = {}) {
    this.cellSize = config.cellSize ?? 120;
    this.defaultClearance = config.defaultClearance ?? 38;
    this.maxExpandedNodes = config.maxExpandedNodes ?? 5000;
    this.cacheEntries = config.cacheEntries ?? 96;
    if (!(this.cellSize > 0)) throw new Error('navigation cellSize must be positive');
    if (!(this.defaultClearance >= 0)) throw new Error('navigation clearance cannot be negative');
    if (!(this.maxExpandedNodes > 0)) throw new Error('navigation maxExpandedNodes must be positive');
  }

  plan(request: RouteRequest): RoutePlan {
    const clearance = request.clearance ?? this.defaultClearance;
    const dynamic = [...(request.dynamicObstacles ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const budget = request.maxExpandedNodes ?? this.maxExpandedNodes;
    if (!Number.isFinite(clearance) || clearance < 0) throw new Error('route clearance must be finite and non-negative');
    if (!Number.isInteger(budget) || budget <= 0) throw new Error('route expansion budget must be a positive integer');

    const key = this.cacheKey(request.start, request.goal, clearance, dynamic, budget);
    const cached = this.cache.get(key);
    if (cached) return { ...cached, diagnostics: { ...cached.diagnostics, cacheHit: true } };

    if (!this.walkablePoint(request.start, clearance, dynamic)) return this.remember(key, this.failure('start-blocked'));
    if (!this.walkablePoint(request.goal, clearance, dynamic)) return this.remember(key, this.failure('goal-blocked'));
    if (this.segmentClear(request.start, request.goal, clearance, dynamic)) {
      return this.remember(key, {
        reached: true,
        waypoints: [request.goal],
        diagnostics: { cacheHit: false, expandedNodes: 0, generatedNodes: 0, direct: true, cost: distance(request.start, request.goal) },
      });
    }

    const start = this.toGrid(request.start);
    const goal = this.toGrid(request.goal);
    const open = new MinHeap();
    const bestG = new Map<string, number>();
    const parents = new Map<string, string>();
    const nodes = new Map<string, GridNode>();
    const startKey = gridKey(start);
    const goalKey = gridKey(goal);
    const startH = octile(start, goal);
    open.push({ ...start, key: startKey, g: 0, h: startH, f: startH });
    bestG.set(startKey, 0);
    nodes.set(startKey, start);
    let expanded = 0;
    let generated = 1;

    while (open.size > 0 && expanded < budget) {
      const current = open.pop()!;
      if (current.g !== bestG.get(current.key)) continue;
      expanded += 1;
      if (current.key === goalKey) {
        const raw = this.reconstruct(current.key, startKey, parents, nodes).map((node) => this.fromGrid(node));
        const smoothed = this.smooth(request.start, request.goal, raw, clearance, dynamic);
        return this.remember(key, {
          reached: true,
          waypoints: smoothed,
          diagnostics: {
            cacheHit: false,
            expandedNodes: expanded,
            generatedNodes: generated,
            direct: false,
            cost: this.pathCost(request.start, smoothed),
          },
        });
      }

      for (const [dx, dy, stepCost] of DIRECTIONS) {
        const next = { x: current.x + dx, y: current.y + dy };
        if (!this.walkableCell(next, clearance, dynamic)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!this.walkableCell({ x: current.x + dx, y: current.y }, clearance, dynamic)) continue;
          if (!this.walkableCell({ x: current.x, y: current.y + dy }, clearance, dynamic)) continue;
        }
        const nextKey = gridKey(next);
        const nextG = current.g + stepCost;
        if (nextG >= (bestG.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
        const h = octile(next, goal);
        bestG.set(nextKey, nextG);
        parents.set(nextKey, current.key);
        nodes.set(nextKey, next);
        open.push({ ...next, key: nextKey, g: nextG, h, f: nextG + h });
        generated += 1;
      }
    }

    return this.remember(key, this.failure(open.size > 0 ? 'budget-exhausted' : 'unreachable', expanded, generated));
  }

  clearCache(): void { this.cache.clear(); }
  get cacheSize(): number { return this.cache.size; }

  private walkablePoint(point: Vec2, clearance: number, dynamic: readonly DynamicObstacle[]): boolean {
    if (this.battlefield.isOccupied(point, clearance)) return false;
    return dynamic.every((obstacle) => distance(point, obstacle.position) > clearance + obstacle.radius);
  }

  private walkableCell(node: GridNode, clearance: number, dynamic: readonly DynamicObstacle[]): boolean {
    return this.walkablePoint(this.fromGrid(node), clearance, dynamic);
  }

  private segmentClear(start: Vec2, end: Vec2, clearance: number, dynamic: readonly DynamicObstacle[]): boolean {
    if (!this.battlefield.hasLineOfSight(start, end, clearance)) return false;
    return dynamic.every((obstacle) => pointSegmentDistance(obstacle.position, start, end) > clearance + obstacle.radius);
  }

  private toGrid(point: Vec2): GridNode {
    return { x: Math.round(point.x / this.cellSize), y: Math.round(point.y / this.cellSize) };
  }

  private fromGrid(node: GridNode): Vec2 {
    return { x: node.x * this.cellSize, y: node.y * this.cellSize };
  }

  private reconstruct(endKey: string, startKey: string, parents: Map<string, string>, nodes: Map<string, GridNode>): GridNode[] {
    const reversed: GridNode[] = [];
    let key = endKey;
    while (key !== startKey) {
      const node = nodes.get(key);
      if (!node) break;
      reversed.push(node);
      const parent = parents.get(key);
      if (!parent) break;
      key = parent;
    }
    reversed.reverse();
    return reversed;
  }

  private smooth(start: Vec2, goal: Vec2, raw: readonly Vec2[], clearance: number, dynamic: readonly DynamicObstacle[]): Vec2[] {
    const candidates = raw.length === 0 ? [goal] : [...raw.slice(0, -1), goal];
    const result: Vec2[] = [];
    let anchor = start;
    let index = 0;
    while (index < candidates.length) {
      let furthest = index;
      for (let candidate = candidates.length - 1; candidate >= index; candidate -= 1) {
        if (this.segmentClear(anchor, candidates[candidate], clearance, dynamic)) {
          furthest = candidate;
          break;
        }
      }
      const waypoint = candidates[furthest];
      result.push(waypoint);
      anchor = waypoint;
      index = furthest + 1;
    }
    return result;
  }

  private pathCost(start: Vec2, waypoints: readonly Vec2[]): number {
    let cost = 0;
    let previous = start;
    for (const point of waypoints) {
      cost += distance(previous, point);
      previous = point;
    }
    return cost;
  }

  private cacheKey(start: Vec2, goal: Vec2, clearance: number, dynamic: readonly DynamicObstacle[], budget: number): string {
    const terrain = this.battlefield.terrain.filter((entry) => entry.solid).map((entry) => entry.id).join(',');
    const obstacles = dynamic.map((entry) => `${entry.id}:${entry.position.x.toFixed(1)}:${entry.position.y.toFixed(1)}:${entry.radius.toFixed(1)}`).join('|');
    return `${start.x.toFixed(1)},${start.y.toFixed(1)}>${goal.x.toFixed(1)},${goal.y.toFixed(1)}@${clearance.toFixed(1)}#${budget};t=${terrain};d=${obstacles}`;
  }

  private failure(reason: RoutePlan['failureReason'], expandedNodes = 0, generatedNodes = 0): RoutePlan {
    return { reached: false, waypoints: [], failureReason: reason, diagnostics: { cacheHit: false, expandedNodes, generatedNodes, direct: false, cost: 0 } };
  }

  private remember(key: string, route: RoutePlan): RoutePlan {
    this.cache.set(key, route);
    while (this.cache.size > this.cacheEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return route;
  }
}
