import type { EntityId } from '../../game/simulation/types';
import type { AIObservation, AIKnowledgePolicy } from '../perception/types';
import { DEFAULT_AI_KNOWLEDGE_POLICY } from '../perception/types';

export interface RememberedObservation extends AIObservation {
  readonly rememberedAtTick: number;
  readonly confidence: number;
}

export interface TargetMemory {
  readonly targetId: EntityId;
  readonly selectedAtTick: number;
  readonly lastConfirmedAtTick: number;
  readonly confidence: number;
}

export class AIMemory {
  readonly #policy: AIKnowledgePolicy;
  readonly #contacts = new Map<EntityId, RememberedObservation>();
  #target?: TargetMemory;

  constructor(policy: Partial<AIKnowledgePolicy> = {}) {
    this.#policy = Object.freeze({ ...DEFAULT_AI_KNOWLEDGE_POLICY, ...policy });
    if (this.#policy.memoryTtlTicks < 1) throw new Error('memoryTtlTicks must be positive');
  }

  ingest(observations: readonly AIObservation[], tick: number): void {
    const seen = new Set<EntityId>();
    for (const observation of observations) {
      seen.add(observation.id);
      this.#contacts.set(observation.id, Object.freeze({
        ...observation,
        position: Object.freeze({ ...observation.position }),
        rememberedAtTick: tick,
        confidence: observation.freshness === 'live' ? 1 : this.confidenceForAge(tick - observation.observedAtTick),
      }));
      if (this.#target?.targetId === observation.id) {
        this.#target = Object.freeze({
          ...this.#target,
          lastConfirmedAtTick: observation.observedAtTick,
          confidence: observation.freshness === 'live' ? 1 : this.confidenceForAge(tick - observation.observedAtTick),
        });
      }
    }

    for (const [id, memory] of this.#contacts) {
      if (seen.has(id)) continue;
      const confidence = this.confidenceForAge(tick - memory.observedAtTick);
      if (confidence <= 0) this.#contacts.delete(id);
      else this.#contacts.set(id, Object.freeze({ ...memory, confidence }));
    }

    if (this.#target) {
      const target = this.#contacts.get(this.#target.targetId);
      if (!target) this.#target = undefined;
      else this.#target = Object.freeze({ ...this.#target, confidence: target.confidence });
    }
  }

  rememberTarget(targetId: EntityId, tick: number): TargetMemory {
    const contact = this.#contacts.get(targetId);
    if (!contact || contact.relation !== 'hostile' || !contact.targetable) {
      throw new Error(`cannot remember unknown or invalid target: ${String(targetId)}`);
    }
    this.#target = Object.freeze({
      targetId,
      selectedAtTick: tick,
      lastConfirmedAtTick: contact.observedAtTick,
      confidence: contact.confidence,
    });
    return this.#target;
  }

  clearTarget(): void { this.#target = undefined; }

  get(targetId: EntityId): RememberedObservation | undefined { return this.#contacts.get(targetId); }
  contacts(): readonly RememberedObservation[] { return [...this.#contacts.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))); }
  target(): TargetMemory | undefined { return this.#target; }

  private confidenceForAge(ageTicks: number): number {
    if (ageTicks <= 0) return 1;
    if (ageTicks >= this.#policy.memoryTtlTicks) return this.#policy.staleConfidenceFloor;
    const span = 1 - this.#policy.staleConfidenceFloor;
    return this.#policy.staleConfidenceFloor + span * (1 - ageTicks / this.#policy.memoryTtlTicks);
  }
}
