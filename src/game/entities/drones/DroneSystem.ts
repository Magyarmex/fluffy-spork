import { NavigationService } from '../../../ai/navigation/NavigationService';
import type { DynamicObstacle } from '../../../ai/navigation/types';
import type { PerceivedContact } from '../../targeting/types';
import type { EntityId } from '../../simulation/types';
import type { DroneState, TankState, Vector2State } from '../types';
import { commandDepth, formationForOrder, formationSlot, localDefenseFraction } from './formations';
import type {
  DroneBehaviorIntent,
  DroneFormation,
  DroneMode,
  DroneOperationalState,
  DroneRole,
  DroneSystemConfig,
  DroneSystemFrame,
  DroneSystemResult,
  DroneTargetSelection,
} from './types';

interface DroneMemory {
  slot: number;
  role: DroneRole;
  mode: DroneMode;
  formation: DroneFormation;
  committed: boolean;
  targetId?: EntityId;
  lastHealth?: number;
  lastDamagedTick?: number;
  lastDamagedMs?: number;
  repairing: boolean;
}

interface ResolvedConfig {
  controllerRepairDelaySeconds: number;
  controllerRepairRateFractionPerSecond: number;
  controllerRepairRadius: number;
  controllerRepairThreatRadius: number;
  activeRepairThreshold: number;
  broodmotherRepairThreshold: number;
  recallRepairThreshold: number;
  repairStopThreshold: number;
  fieldRepairDelaySeconds: number;
  fieldRepairRateFractionPerSecond: number;
  fieldRepairThreatRadius: number;
  deepDefenseCutoff: number;
  maxPeelFraction: number;
  droneClearance: number;
  interceptRadius: number;
  attackContactRadius: number;
}

const DEFAULT_CONFIG: ResolvedConfig = Object.freeze({
  controllerRepairDelaySeconds: 2.6,
  controllerRepairRateFractionPerSecond: 0.11,
  controllerRepairRadius: 145,
  controllerRepairThreatRadius: 225,
  activeRepairThreshold: 0.18,
  broodmotherRepairThreshold: 0.12,
  recallRepairThreshold: 0.62,
  repairStopThreshold: 0.84,
  fieldRepairDelaySeconds: 4.6,
  fieldRepairRateFractionPerSecond: 0.045,
  fieldRepairThreatRadius: 310,
  deepDefenseCutoff: 0.58,
  maxPeelFraction: 0.36,
  droneClearance: 18,
  interceptRadius: 250,
  attackContactRadius: 28,
});

const CONTROLLER_LINEAGES = new Set(['controller', 'carrier', 'overlord', 'warden', 'hivemind', 'broodmother', 'citadel', 'valkyrie']);

function distance(a: Vector2State, b: Vector2State): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function roleFor(drone: DroneState): DroneRole {
  const id = drone.droneDefinitionId.toLowerCase();
  if (id.includes('observer') || id.includes('spotter') || id.includes('scout')) return 'observer';
  if (id.includes('harvest') || id.includes('miner')) return 'harvester';
  if (id.includes('guard') || id.includes('warden') || id.includes('interceptor')) return 'guardian';
  if (id.includes('repair') || id.includes('support')) return 'support';
  return 'hunter';
}

function isOperational(drone: DroneState): boolean {
  return drone.lifecycle === 'active' && Boolean(drone.health && drone.health.current > 0);
}

function isControllerLineage(lineage?: string): boolean {
  return lineage !== undefined && CONTROLLER_LINEAGES.has(lineage.toLowerCase());
}

function zero(): Vector2State { return { x: 0, y: 0 }; }

export class DroneSystem {
  readonly config: ResolvedConfig;
  private readonly memory = new Map<EntityId, DroneMemory>();

  constructor(readonly navigation: NavigationService, config: DroneSystemConfig = {}) {
    this.config = Object.freeze({ ...DEFAULT_CONFIG, ...config });
    for (const [key, value] of Object.entries(this.config)) {
      if (!Number.isFinite(value) || value < 0) throw new Error(`invalid drone config: ${key}`);
    }
  }

  /** Explicit attack commitment is sticky until the run is completed; recall cannot bend a launched dive. */
  commitAttack(droneId: EntityId, targetId: EntityId): void {
    const memory = this.memory.get(droneId) ?? this.createMemory(0, 'hunter', 'crescent');
    memory.committed = true;
    memory.targetId = targetId;
    memory.mode = 'attack-run';
    memory.repairing = false;
    this.memory.set(droneId, memory);
  }

  completeAttackRun(droneId: EntityId): void {
    const memory = this.memory.get(droneId);
    if (!memory) return;
    memory.committed = false;
    memory.targetId = undefined;
    memory.mode = 'recover';
  }

  recordDamage(droneId: EntityId, tick: number, elapsedMs: number): void {
    const memory = this.memory.get(droneId);
    if (!memory) return;
    memory.lastDamagedTick = tick;
    memory.lastDamagedMs = elapsedMs;
  }

  update(frame: DroneSystemFrame): DroneSystemResult {
    if (!Number.isFinite(frame.dtSeconds) || frame.dtSeconds < 0) throw new Error('dtSeconds must be finite and non-negative');
    const drones = frame.drones.filter((drone) => drone.ownerId === frame.owner.id && isOperational(drone));
    const formation = formationForOrder(frame.order.order, frame.ownerLineage);
    const selected = this.selectTarget(frame);
    const attackTarget = frame.order.targetId
      ? frame.perceivedWorld.getContact(frame.order.targetId as EntityId)
      : selected.contact;
    const threat = this.closestLocalDroneThreat(frame.owner.position, frame.perceivedWorld.hostileContacts(), this.config.interceptRadius);
    const pressureTarget = attackTarget?.position;
    const depth = commandDepth(frame.owner.position, pressureTarget, frame.commandLeash ?? 650);
    const localFraction = localDefenseFraction(depth, this.config.deepDefenseCutoff, this.config.maxPeelFraction);
    const defenderCount = frame.order.order === 'attack' && threat ? Math.ceil(drones.length * localFraction) : 0;
    const recoveringWeapons = new Set(frame.weaponRecoveringDroneIds ?? []);
    const intents: DroneBehaviorIntent[] = [];
    const states: DroneOperationalState[] = [];
    const relayObserverIds: EntityId[] = [];

    drones.forEach((drone, index) => {
      const role = roleFor(drone);
      const memory = this.memory.get(drone.id) ?? this.createMemory(index, role, formation);
      memory.slot = index;
      memory.role = role;
      memory.formation = formation;
      this.observeHealth(drone, memory, frame.tick, frame.elapsedMs);

      if (role === 'observer') relayObserverIds.push(drone.id);
      const controller = isControllerLineage(frame.ownerLineage);
      const controllerRepair = controller ? this.controllerRepairDecision(drone, memory, frame) : { active: false, healNow: false };
      const fieldRepairFraction = controller ? 0 : this.fieldRepairFraction(drone, memory, frame, recoveringWeapons.has(drone.id));
      const canIntercept = !memory.committed && !controllerRepair.active && threat !== undefined && index < defenderCount;
      let target = memory.committed && memory.targetId
        ? frame.perceivedWorld.getContact(memory.targetId)
        : attackTarget;
      if (canIntercept) target = threat;

      let mode: DroneMode;
      let destination: Vector2State | undefined;
      let attack = false;
      let harvest = false;

      if (memory.committed) {
        mode = 'attack-run';
        destination = target?.position;
        attack = Boolean(target?.live && target.targetable && target.visibility.directSight);
      } else if (controllerRepair.active) {
        mode = controllerRepair.healNow ? 'repair' : 'recover';
        destination = frame.owner.position;
      } else if (canIntercept && threat) {
        mode = 'intercept';
        destination = threat.position;
        attack = threat.live && threat.targetable && threat.visibility.directSight;
      } else if (frame.order.order === 'attack' && target?.live && target.targetable) {
        mode = 'transit';
        destination = target.position;
        if (target.visibility.directSight && distance(drone.position, target.position) <= this.config.attackContactRadius) {
          memory.committed = true;
          memory.targetId = target.id;
          memory.repairing = false;
          mode = 'attack-run';
          attack = true;
        }
      } else if (role === 'harvester') {
        const harvestTarget = this.closestHarvestContact(drone, frame.perceivedWorld.contacts);
        mode = harvestTarget ? 'harvest' : 'formation';
        destination = harvestTarget?.position ?? formationSlot(frame.owner.position, frame.owner.rotation, index, drones.length, formation);
        harvest = Boolean(harvestTarget);
      } else {
        mode = role === 'observer' ? 'observe' : 'formation';
        destination = formationSlot(frame.owner.position, frame.owner.rotation, index, drones.length, formation);
      }

      memory.mode = mode;
      if (!memory.committed && mode !== 'transit' && mode !== 'intercept') memory.targetId = undefined;
      const movement = this.movementIntent(drone, destination, frame.dynamicObstacles ?? [], frame.tick);
      const iff = { ownerId: drone.ownerId, teamId: drone.team.teamId, ...(drone.team.allegiance ? { allegiance: drone.team.allegiance } : {}) };
      const state: DroneOperationalState = Object.freeze({
        id: drone.id, ownerId: drone.ownerId, slot: index, role, mode, formation,
        committed: memory.committed, ...(memory.targetId ? { targetId: memory.targetId } : {}),
        ...(memory.lastDamagedTick !== undefined ? { lastDamagedTick: memory.lastDamagedTick } : {}), iff,
      });
      states.push(state);
      const repairFraction = controllerRepair.healNow
        ? this.config.controllerRepairRateFractionPerSecond * frame.dtSeconds
        : fieldRepairFraction;
      intents.push(Object.freeze({
        droneId: drone.id, mode, ...(destination ? { destination } : {}), desiredDirection: movement.direction,
        speedScale: controllerRepair.active ? 1.08 : (mode === 'intercept' ? 1.12 : 1),
        ...(controllerRepair.active ? { minimumSpeed: 150 } : {}),
        ...(target && (mode === 'attack-run' || mode === 'intercept') ? { targetId: target.id } : {}),
        attack, repairFraction, observer: role === 'observer', harvest, replan: movement.replan, iff,
      }));
      this.memory.set(drone.id, memory);
    });

    this.pruneMemory(new Set(drones.map((drone) => drone.id)));
    return Object.freeze({ intents: Object.freeze(intents), states: Object.freeze(states), relayObserverIds: Object.freeze(relayObserverIds) });
  }

  selectTarget(frame: Pick<DroneSystemFrame, 'owner' | 'perceivedWorld'>): DroneTargetSelection {
    let best: PerceivedContact | undefined;
    let bestScore = -Infinity;
    for (const contact of frame.perceivedWorld.hostileContacts()) {
      if (!contact.live || !contact.targetable) continue;
      const d = distance(frame.owner.position, contact.position);
      const score = (contact.visibility.designated ? 800 : 0)
        + (contact.visibility.directSight ? 260 : 0)
        + (contact.visibility.relayed ? 80 : 0)
        - d;
      if (score > bestScore || (score === bestScore && contact.id < (best?.id ?? contact.id))) {
        best = contact;
        bestScore = score;
      }
    }
    return { ...(best ? { contact: best } : {}), score: bestScore };
  }

  private createMemory(slot: number, role: DroneRole, formation: DroneFormation): DroneMemory {
    return { slot, role, mode: 'formation', formation, committed: false, repairing: false };
  }

  private observeHealth(drone: DroneState, memory: DroneMemory, tick: number, elapsedMs: number): void {
    const current = drone.health?.current ?? 0;
    if (memory.lastHealth !== undefined && current < memory.lastHealth - 0.01) {
      memory.lastDamagedTick = tick;
      memory.lastDamagedMs = elapsedMs;
    }
    memory.lastHealth = current;
  }

  /** Dedicated Controller recycling path from v1.10.7 Command Weave / Second Body. */
  private controllerRepairDecision(drone: DroneState, memory: DroneMemory, frame: DroneSystemFrame): { active: boolean; healNow: boolean } {
    if (memory.committed || !drone.health || drone.health.max <= 0) return { active: false, healNow: false };
    const healthFraction = drone.health.current / drone.health.max;
    const pressureActive = frame.order.order === 'attack';
    const threshold = pressureActive
      ? (frame.ownerLineage?.toLowerCase() === 'broodmother' ? this.config.broodmotherRepairThreshold : this.config.activeRepairThreshold)
      : this.config.recallRepairThreshold;
    if (healthFraction < threshold) memory.repairing = true;
    if (healthFraction > this.config.repairStopThreshold || (pressureActive && healthFraction > threshold + 0.10)) memory.repairing = false;
    if (!memory.repairing) return { active: false, healNow: false };
    const delayElapsed = memory.lastDamagedMs === undefined || frame.elapsedMs - memory.lastDamagedMs >= this.config.controllerRepairDelaySeconds * 1000;
    const nearOwner = distance(drone.position, frame.owner.position) < this.config.controllerRepairRadius;
    const localThreat = this.closestLocalDroneThreat(frame.owner.position, frame.perceivedWorld.hostileContacts(), this.config.controllerRepairThreatRadius);
    return { active: true, healNow: delayElapsed && nearOwner && localThreat === undefined };
  }

  /** Universal v1.10.3 Field Service for surviving non-Controller drones. It repairs in place and never owns routing. */
  private fieldRepairFraction(drone: DroneState, memory: DroneMemory, frame: DroneSystemFrame, weaponRecovering: boolean): number {
    if (memory.committed || weaponRecovering || !drone.health || drone.health.max <= 0 || drone.health.current >= drone.health.max - 0.01) return 0;
    if (memory.lastDamagedMs !== undefined && frame.elapsedMs - memory.lastDamagedMs < this.config.fieldRepairDelaySeconds * 1000) return 0;
    if (this.hasVisibleThreat(drone.position, frame.perceivedWorld.hostileContacts(), this.config.fieldRepairThreatRadius)) return 0;
    return this.config.fieldRepairRateFractionPerSecond * frame.dtSeconds;
  }

  private hasVisibleThreat(origin: Vector2State, contacts: readonly PerceivedContact[], radius: number): boolean {
    return contacts.some((contact) => contact.live && contact.targetable && contact.visibility.directSight
      && (contact.kind === 'tank' || contact.kind === 'drone') && distance(origin, contact.position) <= radius);
  }

  private closestLocalDroneThreat(origin: Vector2State, contacts: readonly PerceivedContact[], radius: number): PerceivedContact | undefined {
    let best: PerceivedContact | undefined;
    let bestDistance = radius;
    for (const contact of contacts) {
      if (contact.kind !== 'drone' || !contact.live || !contact.targetable || !contact.visibility.directSight) continue;
      const d = distance(origin, contact.position);
      if (d < bestDistance) { best = contact; bestDistance = d; }
    }
    return best;
  }

  private closestHarvestContact(drone: DroneState, contacts: readonly PerceivedContact[]): PerceivedContact | undefined {
    let best: PerceivedContact | undefined;
    let bestDistance = Infinity;
    for (const contact of contacts) {
      if (contact.relation !== 'neutral' || !contact.live || !contact.targetable || (contact.kind !== 'shape' && contact.kind !== 'powerup')) continue;
      const d = distance(drone.position, contact.position);
      if (d < bestDistance) { best = contact; bestDistance = d; }
    }
    return best;
  }

  private movementIntent(drone: DroneState, destination: Vector2State | undefined, obstacles: readonly DynamicObstacle[], tick: number): { direction: Vector2State; replan: boolean } {
    if (!destination) return { direction: zero(), replan: false };
    const recovery = this.navigation.stuck.observe({ id: drone.id, tick, position: drone.position, desiredDestination: destination });
    if (recovery.stuck) return { direction: recovery.recoveryDirection, replan: true };
    const route = this.navigation.routeForDrone(drone.position, destination, obstacles, this.config.droneClearance);
    if (!route.reached) return { direction: zero(), replan: true };
    return { direction: this.navigation.movementDirection(drone.position, route.waypoints[0], this.config.droneClearance, obstacles), replan: false };
  }

  private pruneMemory(active: ReadonlySet<EntityId>): void {
    for (const id of this.memory.keys()) if (!active.has(id)) this.memory.delete(id);
  }
}
