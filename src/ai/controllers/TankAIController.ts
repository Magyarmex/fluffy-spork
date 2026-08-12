import type { LineageId } from '../../content/schema';
import type { TankBuild } from '../../game/progression/types';
import type { PerceivedWorld } from '../../game/targeting/types';
import type { CommandController, CommandEnvelope, GameCommand } from '../../input/commands/GameCommand';
import { normalizeStick } from '../../input/commands/GameCommand';
import { AIKnowledge } from '../perception/AIKnowledge';
import type { AIKnowledgeFrame } from '../perception/types';
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

const ECOLOGY_XP: Readonly<Record<string, number>> = Object.freeze({ circle:10, triangle:25, square:50, pentagon:100, hexagon:200, star:500, crasher:60 });

function observerBias(id: string): number {
  let value = 0;
  for (let index = 0; index < id.length; index += 1) value = (value * 31 + id.charCodeAt(index)) >>> 0;
  return 0.82 + (value % 37) / 100;
}

function ecologicalDestination(knowledge: AIKnowledgeFrame, lineage: LineageId, selfHealthFraction: number): Readonly<{x:number;y:number}> | undefined {
  if (selfHealthFraction < 0.48) return undefined;
  const self = knowledge.observations.find((entry) => entry.id === knowledge.world.observerId);
  if (!self) return undefined;
  const immediateThreat = knowledge.observations.some((entry) => entry.relation === 'hostile' && entry.directSight && entry.freshness === 'live' && Math.hypot(entry.position.x-self.position.x,entry.position.y-self.position.y)<520);
  if (immediateThreat) return undefined;

  // Only shape identity learned through normal direct sight is eligible. Hidden sector state is never consulted.
  const cells = new Map<string,{x:number;y:number;weightedX:number;weightedY:number;value:number;count:number;saturation:number}>();
  for (const observation of knowledge.observations) {
    if (observation.kind !== 'shape' || observation.relation !== 'neutral' || !observation.directSight || !observation.shapeType) continue;
    const value = ECOLOGY_XP[observation.shapeType] ?? 0;
    if (value <= 0 || observation.shapeType === 'crasher') continue;
    const cx=Math.floor(observation.position.x/360),cy=Math.floor(observation.position.y/360),key=`${cx}:${cy}`;
    const cell=cells.get(key)??{x:cx,y:cy,weightedX:0,weightedY:0,value:0,count:0,saturation:0};
    cell.weightedX+=observation.position.x*value;cell.weightedY+=observation.position.y*value;cell.value+=value;cell.count+=1;cells.set(key,cell);
  }
  if (!cells.size) return undefined;
  for (const observation of knowledge.observations) {
    if (observation.kind !== 'tank' || observation.id === knowledge.world.observerId || observation.freshness !== 'live') continue;
    for (const cell of cells.values()) {
      const center={x:cell.x*360+180,y:cell.y*360+180};
      if (Math.hypot(observation.position.x-center.x,observation.position.y-center.y)<430) cell.saturation+=1;
    }
  }
  const roleMultiplier = lineage==='controller'?1.12:lineage==='gunner'?1.08:lineage==='sniper'?.92:1;
  const bias=observerBias(String(knowledge.world.observerId));
  let best:{destination:{x:number;y:number};score:number}|undefined;
  for(const cell of cells.values()){
    const destination={x:cell.weightedX/Math.max(1,cell.value),y:cell.weightedY/Math.max(1,cell.value)};
    const travel=Math.hypot(destination.x-self.position.x,destination.y-self.position.y);
    const score=cell.value*roleMultiplier*bias-travel*.16-cell.saturation*125;
    if(!best||score>best.score)best={destination,score};
  }
  return best&&best.score>210?Object.freeze(best.destination):undefined;
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
    const ecology = ecologicalDestination(knowledge, frame.lineage, frame.selfHealthFraction);

    let move = { x: 0, y: 0 };
    const destination = ecology ?? plan.destination;
    if (destination) {
      const route = this.#navigation.routeForTank(self.position, destination);
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
