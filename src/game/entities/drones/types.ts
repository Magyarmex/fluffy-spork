import type { DynamicObstacle } from '../../../ai/navigation/types';
import type { GameCommand } from '../../../input/commands/GameCommand';
import type { PerceivedContact, PerceivedWorld } from '../../targeting/types';
import type { EntityId } from '../../simulation/types';
import type { DroneState, TankState, Vector2State } from '../types';

export type DroneRole = 'hunter' | 'guardian' | 'observer' | 'harvester' | 'support';
export type DroneMode = 'formation' | 'transit' | 'attack-run' | 'intercept' | 'recover' | 'repair' | 'observe' | 'harvest';
export type DroneFormation = 'ring' | 'crescent' | 'phalanx' | 'claw';
export type DroneSwarmOrder = Extract<GameCommand, { readonly type: 'swarm-order' }>;

export interface DroneIFFState {
  readonly ownerId: EntityId;
  readonly teamId: string;
  readonly allegiance?: string;
}

export interface DroneOperationalState {
  readonly id: EntityId;
  readonly ownerId: EntityId;
  readonly slot: number;
  readonly role: DroneRole;
  readonly mode: DroneMode;
  readonly formation: DroneFormation;
  readonly committed: boolean;
  readonly targetId?: EntityId;
  readonly lastDamagedTick?: number;
  readonly iff: DroneIFFState;
}

export interface DroneBehaviorIntent {
  readonly droneId: EntityId;
  readonly mode: DroneMode;
  readonly destination?: Vector2State;
  readonly desiredDirection: Vector2State;
  readonly speedScale: number;
  readonly targetId?: EntityId;
  readonly attack: boolean;
  readonly repairFraction: number;
  readonly observer: boolean;
  readonly harvest: boolean;
  readonly replan: boolean;
  readonly iff: DroneIFFState;
}

export interface DroneSystemFrame {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly dtSeconds: number;
  readonly owner: TankState;
  readonly ownerLineage?: string;
  readonly drones: readonly DroneState[];
  readonly perceivedWorld: PerceivedWorld;
  readonly order: DroneSwarmOrder;
  readonly dynamicObstacles?: readonly DynamicObstacle[];
}

export interface DroneSystemResult {
  readonly intents: readonly DroneBehaviorIntent[];
  readonly states: readonly DroneOperationalState[];
  /** Surviving explicit observer drones that may be passed to Mission 12 relayObserverIds. */
  readonly relayObserverIds: readonly EntityId[];
}

export interface DroneSystemConfig {
  readonly repairDelaySeconds?: number;
  readonly repairRateFractionPerSecond?: number;
  readonly repairRadius?: number;
  readonly repairThreatRadius?: number;
  readonly activeRepairThreshold?: number;
  readonly broodmotherRepairThreshold?: number;
  readonly recallRepairThreshold?: number;
  readonly repairStopThreshold?: number;
  readonly deepDefenseCutoff?: number;
  readonly maxPeelFraction?: number;
  readonly droneClearance?: number;
  readonly interceptRadius?: number;
  readonly attackContactRadius?: number;
}

export interface DroneTargetSelection {
  readonly contact?: PerceivedContact;
  readonly score: number;
}
