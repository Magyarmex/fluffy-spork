import type { LineageId } from '../../content/schema';
import type { TankBuild } from '../../game/progression/types';
import type { EntityId } from '../../game/simulation/types';
import type { AIKnowledgeFrame, ThreatAwareness } from '../perception/types';

export type TacticalIntent = 'hold' | 'engage' | 'advance' | 'retreat' | 'reposition';

export interface AIDifficultyPolicy {
  /** Tactical decisions are cached between these simulation ticks. */
  readonly reactionTicks: number;
  /** Persistent angular error floor in radians; zero is intentionally forbidden. */
  readonly aimErrorRadians: number;
  /** Penalizes dogpiling when the caller exposes current friendly commitments. */
  readonly saturationPenalty: number;
}

export const DEFAULT_AI_DIFFICULTY: AIDifficultyPolicy = Object.freeze({
  reactionTicks: 6,
  aimErrorRadians: 0.018,
  saturationPenalty: 0.22,
});

export interface DoctrineProfile {
  readonly lineage: LineageId;
  readonly preferredRangeFactor: number;
  readonly retreatHealthFraction: number;
  readonly closeCommitFactor: number;
  readonly abilityHealthThreshold: number;
  readonly canPressureCover: boolean;
}

export interface TacticalContext {
  readonly tick: number;
  readonly frame: AIKnowledgeFrame;
  readonly build: TankBuild;
  readonly lineage: LineageId;
  readonly selfHealthFraction: number;
  readonly friendlyCommitments?: Readonly<Record<string, number>>;
  readonly abilityReady?: boolean;
  readonly ultimateReady?: boolean;
}

export interface TargetScore {
  readonly target: ThreatAwareness;
  readonly score: number;
}

export interface TacticalPlan {
  readonly tick: number;
  readonly targetId: EntityId | null;
  readonly targetPosition?: Readonly<{ x: number; y: number }>;
  readonly intent: TacticalIntent;
  readonly preferredRange: number;
  readonly mayFire: boolean;
  readonly useAbility: boolean;
  readonly useUltimate: boolean;
  readonly issueSwarmAttack: boolean;
  readonly aimVector: Readonly<{ x: number; y: number }>;
  readonly destination?: Readonly<{ x: number; y: number }>;
}
