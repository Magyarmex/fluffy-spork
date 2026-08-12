import type { LineageId } from '../../content/schema';
import type { TankBuild } from '../../game/progression/types';
import type { PerceivedWorld } from '../../game/targeting/types';
import type { CommandController, CommandEnvelope, GameCommand } from '../../input/commands/GameCommand';
import { normalizeStick } from '../../input/commands/GameCommand';
import { AIKnowledge } from '../perception/AIKnowledge';
import type { NavigationService } from '../navigation/NavigationService';
import { TacticalPlanner } from '../tactics/TacticalPlanner';
import type { AIDifficultyPolicy, TacticalPlan } from '../tactics/types';

export interface TankAIFrame {
  readonly world: PerceivedWorld;
  readonly build: TankBuild;
  readonly lineage: LineageId;
  readonly selfHealthFraction: number;
  readonly abilityReady?: boolean;
  readonly ultimateReady?: boolean;
  readonly friendlyCommitments?: Readonly<Record<string, number>>;
}

export interface TankAIControllerOptions {
  readonly navigation: NavigationService;
  readonly difficulty?: Partial<AIDifficultyPolicy>;
}

/**
 * Canonical tank controller. It has no raw simulation-state or presentation access:
 * dynamic hostile knowledge enters only through PerceivedWorld and all execution
 * leaves as the same GameCommand language used by human controllers.
 */
export class TankAIController implements CommandController {
  readonly knowledge: AIKnowledge;
  readonly planner: TacticalPlanner;
  readonly #navigation: NavigationService;
  readonly #reactionTicks: number;
  #sequence = 0;
  #lastPlanTick = Number.NEGATIVE_INFINITY;
  #plan: TacticalPlan | undefined;
  #pending: CommandEnvelope[] = [];

  constructor(options: TankAIControllerOptions) {
    this.#navigation = options.navigation;
    this.#reactionTicks = options.difficulty?.reactionTicks ?? 6;
    this.knowledge = new AIKnowledge();
    this.planner = new TacticalPlanner(options.difficulty);
  }

  update(frame: TankAIFrame): readonly CommandEnvelope[] {
    const knowledge = this.knowledge.ingest(frame.world);
    if (!this.#plan || frame.world.tick - this.#lastPlanTick >= this.#reactionTicks) {
      this.#plan = this.planner.plan({
        tick: frame.world.tick,
        frame: knowledge,
        build: frame.build,
        lineage: frame.lineage,
        selfHealthFraction: frame.selfHealthFraction,
        ...(frame.abilityReady !== undefined ? { abilityReady: frame.abilityReady } : {}),
        ...(frame.ultimateReady !== undefined ? { ultimateReady: frame.ultimateReady } : {}),
        ...(frame.friendlyCommitments ? { friendlyCommitments: frame.friendlyCommitments } : {}),
      });
      this.#lastPlanTick = frame.world.tick;
      if (this.#plan.targetId) this.knowledge.rememberTarget(this.#plan.targetId, frame.world.tick);
      else this.knowledge.clearTarget();
    }

    const plan = this.#plan;
    const self = knowledge.observations.find((entry) => entry.id === frame.world.observerId);
    if (!self) throw new Error('Tank AI requires canonical self observation');
    const commands: GameCommand[] = [];

    let move = { x: 0, y: 0 };
    if (plan.destination) {
      const route = this.#navigation.routeForTank(self.position, plan.destination);
      const next = route.reached ? route.waypoints[0] : undefined;
      move = this.#navigation.movementDirection(self.position, next, 38);
    }
    commands.push({ type: 'move', vector: normalizeStick(move) });
    commands.push({ type: 'aim', vector: normalizeStick(plan.aimVector) });
    commands.push({ type: 'fire', active: plan.mayFire });
    if (plan.useAbility) commands.push({ type: 'ability', slot: 1, active: true });
    if (plan.useUltimate) commands.push({ type: 'ultimate', active: true });
    if (plan.issueSwarmAttack && plan.targetId) commands.push({ type: 'swarm-order', order: 'attack', targetId: String(plan.targetId) });
    commands.push({ type: 'designate-target', targetId: plan.targetId ? String(plan.targetId) : null });

    this.#pending = commands.map((command) => Object.freeze({ source: 'ai' as const, sequence: ++this.#sequence, command: Object.freeze(command) }));
    return Object.freeze([...this.#pending]);
  }

  poll(): readonly CommandEnvelope[] {
    const commands = this.#pending;
    this.#pending = [];
    return Object.freeze([...commands]);
  }

  get currentPlan(): TacticalPlan | undefined { return this.#plan; }
}
