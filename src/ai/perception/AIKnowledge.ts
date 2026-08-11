import { AIMemory } from '../memory/AIMemory';
import type { EntityId } from '../../game/simulation/types';
import type { PerceivedContact, PerceivedWorld } from '../../game/targeting/types';
import {
  DEFAULT_AI_KNOWLEDGE_POLICY,
  type AIKnowledgeFrame,
  type AIKnowledgePolicy,
  type AIObservation,
  type RangeAwareness,
  type ThreatAwareness,
} from './types';

function healthFraction(contact: PerceivedContact): number | undefined {
  if (!contact.health || contact.health.max <= 0) return undefined;
  return Math.max(0, Math.min(1, contact.health.current / contact.health.max));
}

function toObservation(contact: PerceivedContact): AIObservation {
  return Object.freeze({
    id: contact.id,
    kind: contact.kind,
    relation: contact.relation,
    teamId: contact.teamId,
    source: contact.source,
    position: Object.freeze({ ...contact.position }),
    observedAtTick: contact.observedAtTick,
    observedAtMs: contact.observedAtMs,
    freshness: contact.live ? 'live' : 'remembered',
    directSight: contact.visibility.directSight,
    publiclyTracked: contact.visibility.publiclyTracked,
    relayed: contact.visibility.relayed,
    designated: contact.visibility.designated,
    targetable: contact.targetable,
    ...(contact.rotation !== undefined ? { rotation: contact.rotation } : {}),
    ...(healthFraction(contact) !== undefined ? { healthFraction: healthFraction(contact) } : {}),
  });
}

function distance(a: Readonly<{ x: number; y: number }>, b: Readonly<{ x: number; y: number }>): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rangeAwareness(value: number, policy: AIKnowledgePolicy): RangeAwareness {
  if (!policy.preferredRange || policy.preferredRange <= 0) return 'preferred';
  if (value < policy.preferredRange * policy.closeRangeFactor) return 'close';
  if (value > policy.preferredRange * 1.25) return 'far';
  return 'preferred';
}

/**
 * AI-facing knowledge acquisition. Its only dynamic-world input is PerceivedWorld.
 * Navigation, target selection, firing, ability use, and movement remain later missions.
 */
export class AIKnowledge {
  readonly #policy: AIKnowledgePolicy;
  readonly memory: AIMemory;

  constructor(policy: Partial<AIKnowledgePolicy> = {}) {
    this.#policy = Object.freeze({ ...DEFAULT_AI_KNOWLEDGE_POLICY, ...policy });
    this.memory = new AIMemory(this.#policy);
  }

  ingest(world: PerceivedWorld): AIKnowledgeFrame {
    const observations = world.contacts.map(toObservation);
    this.memory.ingest(observations, world.tick);

    const self = observations.find((entry) => entry.id === world.observerId);
    if (!self) throw new Error(`AI perception requires observer contact: ${String(world.observerId)}`);

    const threats: ThreatAwareness[] = [];
    for (const contact of this.memory.contacts()) {
      if (contact.relation !== 'hostile' || !contact.targetable) continue;
      const separation = distance(self.position, contact.position);
      threats.push(Object.freeze({
        id: contact.id,
        distance: separation,
        range: rangeAwareness(separation, this.#policy),
        directSight: contact.directSight,
        publiclyTracked: contact.publiclyTracked,
        designated: contact.designated,
        freshness: contact.freshness,
        detailsKnown: contact.rotation !== undefined || contact.healthFraction !== undefined,
        ...(contact.healthFraction !== undefined ? { healthFraction: contact.healthFraction } : {}),
      }));
    }
    threats.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    return Object.freeze({
      world,
      observations: Object.freeze(observations),
      threats: Object.freeze(threats),
    });
  }

  rememberTarget(targetId: EntityId, tick: number) { return this.memory.rememberTarget(targetId, tick); }
  clearTarget(): void { this.memory.clearTarget(); }
}
