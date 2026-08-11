import type { EntityId } from '../../game/simulation/types';
import type { ContactSource, PerceivedContact, PerceivedWorld } from '../../game/targeting/types';

export type AwarenessFreshness = 'live' | 'remembered';
export type RangeAwareness = 'close' | 'preferred' | 'far';

export interface AIObservation {
  readonly id: EntityId;
  readonly kind: PerceivedContact['kind'];
  readonly relation: PerceivedContact['relation'];
  readonly teamId: string;
  readonly source: ContactSource;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly observedAtTick: number;
  readonly observedAtMs: number;
  readonly freshness: AwarenessFreshness;
  readonly directSight: boolean;
  readonly publiclyTracked: boolean;
  readonly relayed: boolean;
  readonly designated: boolean;
  readonly targetable: boolean;
  readonly rotation?: number;
  readonly healthFraction?: number;
}

/** Inputs that later tactical controllers may score. This layer does not choose actions. */
export interface ThreatAwareness {
  readonly id: EntityId;
  readonly distance: number;
  readonly range: RangeAwareness;
  readonly directSight: boolean;
  readonly publiclyTracked: boolean;
  readonly designated: boolean;
  readonly freshness: AwarenessFreshness;
  readonly detailsKnown: boolean;
  readonly healthFraction?: number;
}

export interface AIKnowledgePolicy {
  /** Cached AI memory may outlive a missing contact only for this bounded interval. */
  readonly memoryTtlTicks: number;
  /** Confidence on stale observations decays linearly to zero over the memory TTL. */
  readonly staleConfidenceFloor: number;
  /** Optional class/build-derived awareness ranges. They do not authorize movement or fire. */
  readonly preferredRange?: number;
  readonly closeRangeFactor: number;
}

export const DEFAULT_AI_KNOWLEDGE_POLICY: AIKnowledgePolicy = Object.freeze({
  memoryTtlTicks: 180,
  staleConfidenceFloor: 0,
  closeRangeFactor: 0.55,
});

export interface AIKnowledgeFrame {
  readonly world: PerceivedWorld;
  readonly observations: readonly AIObservation[];
  readonly threats: readonly ThreatAwareness[];
}
