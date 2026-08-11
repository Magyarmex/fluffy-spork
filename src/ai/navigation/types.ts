import type { Vec2 } from '../../game/simulation/math';

export interface DynamicObstacle {
  readonly id: string;
  readonly position: Vec2;
  readonly radius: number;
}

export interface RouteRequest {
  readonly start: Vec2;
  readonly goal: Vec2;
  readonly clearance?: number;
  readonly dynamicObstacles?: readonly DynamicObstacle[];
  readonly maxExpandedNodes?: number;
}

export type RouteFailureReason = 'start-blocked' | 'goal-blocked' | 'unreachable' | 'budget-exhausted';

export interface RouteDiagnostics {
  readonly cacheHit: boolean;
  readonly expandedNodes: number;
  readonly generatedNodes: number;
  readonly direct: boolean;
  readonly cost: number;
}

export interface RoutePlan {
  readonly reached: boolean;
  readonly waypoints: readonly Vec2[];
  readonly failureReason?: RouteFailureReason;
  readonly diagnostics: RouteDiagnostics;
}

export interface RoutePlannerConfig {
  readonly cellSize?: number;
  readonly defaultClearance?: number;
  readonly maxExpandedNodes?: number;
  readonly cacheEntries?: number;
}

export interface NavigationAgentSample {
  readonly id: string;
  readonly tick: number;
  readonly position: Vec2;
  readonly desiredDestination?: Vec2;
}

export interface StuckRecovery {
  readonly stuck: boolean;
  readonly replan: boolean;
  readonly recoveryDirection: Vec2;
  readonly stationaryTicks: number;
}

export interface StuckMonitorConfig {
  readonly movementEpsilon?: number;
  readonly stuckTicks?: number;
  readonly recoveryDistance?: number;
}

export interface LocalAvoidanceRequest {
  readonly position: Vec2;
  readonly desiredDirection: Vec2;
  readonly clearance: number;
  readonly obstacles?: readonly DynamicObstacle[];
}
