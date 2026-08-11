import type { EntityState, HealthState, Vector2State } from '../entities/types';
import type { EntityId } from '../simulation/types';

export type ContactRelation = 'self' | 'friendly' | 'hostile' | 'neutral';
export type ContactSource = 'self' | 'friendly' | 'direct' | 'public-map' | 'relay' | 'designation' | 'last-known';

export interface ContactVisibility {
  readonly directSight: boolean;
  readonly publiclyTracked: boolean;
  readonly relayed: boolean;
  readonly designated: boolean;
}

export interface PerceivedContact {
  readonly id: EntityId;
  readonly kind: EntityState['kind'];
  readonly relation: ContactRelation;
  readonly teamId: string;
  readonly source: ContactSource;
  readonly position: Vector2State;
  readonly observedAtTick: number;
  readonly observedAtMs: number;
  readonly visibility: ContactVisibility;
  readonly live: boolean;
  readonly targetable: boolean;
  readonly rotation?: number;
  readonly health?: HealthState;
}

export interface LastKnownContact {
  readonly id: EntityId;
  readonly kind: EntityState['kind'];
  readonly relation: ContactRelation;
  readonly teamId: string;
  readonly position: Vector2State;
  readonly observedAtTick: number;
  readonly observedAtMs: number;
}

export interface Designation {
  readonly targetId: EntityId;
  readonly teamId: string;
  readonly observerId: EntityId;
  readonly createdAtTick: number;
  readonly expiresAtTick: number;
}

export interface PerceptionPolicy {
  /** v1.10.5: the player minimap publicly tracks every living tank. */
  readonly publicTankTracking: boolean;
  /** Precise combat details are local-sight information, not map-track data. */
  readonly directSightRevealsDetails: boolean;
  /** Memory remains stale by definition and expires deterministically. */
  readonly lastKnownTtlTicks: number;
}

export interface PerceptionFrame {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly observerId: EntityId;
  readonly entities: readonly EntityState[];
  /** Explicit spotters/observers allowed to contribute team relay observations. */
  readonly relayObserverIds?: readonly EntityId[];
}

export interface PerceivedWorld {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly observerId: EntityId;
  readonly contacts: readonly PerceivedContact[];
  getContact(id: EntityId): PerceivedContact | undefined;
  hostileContacts(): readonly PerceivedContact[];
}

export interface LineOfSightProvider {
  hasLineOfSight(start: Vector2State, end: Vector2State, padding?: number): boolean;
}

export const DEFAULT_PERCEPTION_POLICY: PerceptionPolicy = Object.freeze({
  publicTankTracking: true,
  directSightRevealsDetails: true,
  lastKnownTtlTicks: 180,
});
