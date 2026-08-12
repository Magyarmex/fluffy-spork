import { add, normalize, scale, subtract, type Vec2 } from '../../game/simulation/math';
import { RoutePlanner } from './RoutePlanner';
import type {
  DynamicObstacle,
  LocalAvoidanceRequest,
  NavigationAgentSample,
  RoutePlan,
  RouteRequest,
  StuckMonitorConfig,
  StuckRecovery,
} from './types';

interface AgentHistory {
  lastTick: number;
  lastPosition: Vec2;
  stationaryTicks: number;
  recoveries: number;
}

export class StuckMonitor {
  private readonly movementEpsilon: number;
  private readonly stuckTicks: number;
  private readonly recoveryDistance: number;
  private readonly agents = new Map<string, AgentHistory>();

  constructor(config: StuckMonitorConfig = {}) {
    this.movementEpsilon = config.movementEpsilon ?? 4;
    this.stuckTicks = config.stuckTicks ?? 30;
    this.recoveryDistance = config.recoveryDistance ?? 120;
    if (!(this.movementEpsilon >= 0)) throw new Error('movementEpsilon cannot be negative');
    if (!(this.stuckTicks > 0)) throw new Error('stuckTicks must be positive');
    if (!(this.recoveryDistance > 0)) throw new Error('recoveryDistance must be positive');
  }

  observe(sample: NavigationAgentSample): StuckRecovery {
    const previous = this.agents.get(sample.id);
    if (!previous || sample.tick <= previous.lastTick) {
      this.agents.set(sample.id, { lastTick: sample.tick, lastPosition: sample.position, stationaryTicks: 0, recoveries: previous?.recoveries ?? 0 });
      return { stuck: false, replan: false, recoveryDirection: { x: 0, y: 0 }, stationaryTicks: 0 };
    }

    const deltaTicks = sample.tick - previous.lastTick;
    const moved = Math.hypot(sample.position.x - previous.lastPosition.x, sample.position.y - previous.lastPosition.y);
    const stationaryTicks = moved <= this.movementEpsilon ? previous.stationaryTicks + deltaTicks : 0;
    const stuck = stationaryTicks >= this.stuckTicks && sample.desiredDestination !== undefined;
    let recoveries = previous.recoveries;
    let recoveryDirection: Vec2 = { x: 0, y: 0 };

    if (stuck && sample.desiredDestination) {
      const toward = normalize(subtract(sample.desiredDestination, sample.position));
      const side = recoveries % 2 === 0 ? 1 : -1;
      const lateral = { x: -toward.y * side, y: toward.x * side };
      recoveryDirection = scale(normalize(add(scale(toward, -0.35), lateral)), this.recoveryDistance);
      recoveries += 1;
    }

    this.agents.set(sample.id, {
      lastTick: sample.tick,
      lastPosition: sample.position,
      stationaryTicks: stuck ? 0 : stationaryTicks,
      recoveries,
    });

    return { stuck, replan: stuck, recoveryDirection, stationaryTicks };
  }

  reset(agentId: string): void { this.agents.delete(agentId); }
  clear(): void { this.agents.clear(); }
}

export function localAvoidance(request: LocalAvoidanceRequest): Vec2 {
  const desired = normalize(request.desiredDirection);
  let adjusted = desired;
  for (const obstacle of request.obstacles ?? []) {
    const away = subtract(request.position, obstacle.position);
    const distance = Math.hypot(away.x, away.y);
    const influence = request.clearance + obstacle.radius;
    if (distance <= 0 || distance >= influence * 2) continue;
    const strength = Math.min(1.5, (influence * 2 - distance) / Math.max(1, influence));
    adjusted = add(adjusted, scale(normalize(away), strength));
  }
  return normalize(adjusted);
}

export class NavigationService {
  readonly stuck: StuckMonitor;

  constructor(readonly planner: RoutePlanner, stuckConfig: StuckMonitorConfig = {}) {
    this.stuck = new StuckMonitor(stuckConfig);
  }

  route(request: RouteRequest): RoutePlan {
    return this.planner.plan(request);
  }

  routeForTank(start: Vec2, goal: Vec2, dynamicObstacles: readonly DynamicObstacle[] = [], clearance = 38): RoutePlan {
    return this.planner.plan({ start, goal, dynamicObstacles, clearance });
  }

  routeForDrone(start: Vec2, goal: Vec2, dynamicObstacles: readonly DynamicObstacle[] = [], clearance = 18): RoutePlan {
    return this.planner.plan({ start, goal, dynamicObstacles, clearance });
  }

  movementDirection(position: Vec2, nextWaypoint: Vec2 | undefined, clearance: number, dynamicObstacles: readonly DynamicObstacle[] = []): Vec2 {
    if (!nextWaypoint) return { x: 0, y: 0 };
    return localAvoidance({ position, desiredDirection: subtract(nextWaypoint, position), clearance, obstacles: dynamicObstacles });
  }
}
