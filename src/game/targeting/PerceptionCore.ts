import type { EntityState, Vector2State } from '../entities/types';
import type { EntityId } from '../simulation/types';
import { DesignationRegistry } from './DesignationRegistry';
import {
  DEFAULT_PERCEPTION_POLICY,
  type ContactRelation,
  type ContactSource,
  type LastKnownContact,
  type LineOfSightProvider,
  type PerceivedContact,
  type PerceivedWorld,
  type PerceptionFrame,
  type PerceptionPolicy,
} from './types';

function clonePoint(value: Vector2State): Vector2State { return { x: value.x, y: value.y }; }

function relation(observer: EntityState, candidate: EntityState): ContactRelation {
  if (candidate.id === observer.id) return 'self';
  if (candidate.team.teamId === observer.team.teamId) return 'friendly';
  if (candidate.team.teamId === 'neutral') return 'neutral';
  return 'hostile';
}

function targetable(candidate: EntityState, rel: ContactRelation): boolean {
  return rel === 'hostile' && candidate.lifecycle === 'active' && candidate.kind !== 'projectile' && candidate.kind !== 'powerup';
}

class PerceivedWorldView implements PerceivedWorld {
  readonly #byId = new Map<EntityId, PerceivedContact>();
  readonly contacts: readonly PerceivedContact[];

  constructor(readonly tick: number, readonly elapsedMs: number, readonly observerId: EntityId, contacts: readonly PerceivedContact[]) {
    this.contacts = contacts.map((contact) => Object.freeze({
      ...contact,
      position: Object.freeze({ ...contact.position }),
      visibility: Object.freeze({ ...contact.visibility }),
      health: contact.health ? Object.freeze({ ...contact.health }) : undefined,
    }));
    for (const contact of this.contacts) this.#byId.set(contact.id, contact);
  }

  getContact(id: EntityId): PerceivedContact | undefined { return this.#byId.get(id); }
  hostileContacts(): readonly PerceivedContact[] { return this.contacts.filter((contact) => contact.relation === 'hostile' && contact.targetable); }
}

export interface PerceptionCoreOptions {
  readonly lineOfSight: LineOfSightProvider;
  readonly designations?: DesignationRegistry;
  readonly policy?: Partial<PerceptionPolicy>;
}

/** The controller-facing information boundary. Raw EntityState never crosses it. */
export class PerceptionCore {
  readonly #lineOfSight: LineOfSightProvider;
  readonly #designations: DesignationRegistry;
  readonly #policy: PerceptionPolicy;
  readonly #lastKnown = new Map<string, LastKnownContact>();

  constructor(options: PerceptionCoreOptions) {
    this.#lineOfSight = options.lineOfSight;
    this.#designations = options.designations ?? new DesignationRegistry();
    this.#policy = Object.freeze({ ...DEFAULT_PERCEPTION_POLICY, ...options.policy });
  }

  perceive(frame: PerceptionFrame): PerceivedWorld {
    const observer = frame.entities.find((entity) => entity.id === frame.observerId && entity.lifecycle === 'active');
    if (!observer) throw new Error(`active perception observer not found: ${String(frame.observerId)}`);
    const relayObservers = new Set(frame.relayObserverIds ?? []);
    const contacts: PerceivedContact[] = [];

    for (const entity of frame.entities) {
      if (entity.lifecycle !== 'active') continue;
      const rel = relation(observer, entity);
      const directSight = entity.id === observer.id || rel === 'friendly' || this.#lineOfSight.hasLineOfSight(observer.position, entity.position, 1);
      const publiclyTracked = rel === 'hostile' && entity.kind === 'tank' && this.#policy.publicTankTracking;
      const designated = rel === 'hostile' && this.#designations.get(observer.team.teamId, entity.id, frame.tick) !== undefined;
      const relayed = rel === 'hostile' && this.isRelayedByObserver(frame, observer, entity, relayObservers);
      const visibleNow = rel !== 'hostile' || directSight || publiclyTracked || relayed || designated;

      if (visibleNow) {
        const source = this.sourceFor(rel, directSight, publiclyTracked, relayed, designated);
        const contact = this.liveContact(entity, rel, source, directSight, publiclyTracked, relayed, designated, frame);
        contacts.push(contact);
        if (rel === 'hostile') this.remember(observer.team.teamId, contact);
      } else {
        const remembered = this.getRemembered(observer.team.teamId, entity.id, frame.tick);
        if (remembered) contacts.push(this.lastKnownContact(remembered));
      }
    }

    contacts.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return new PerceivedWorldView(frame.tick, frame.elapsedMs, frame.observerId, contacts);
  }

  get designations(): DesignationRegistry { return this.#designations; }

  private isRelayedByObserver(frame: PerceptionFrame, observer: EntityState, target: EntityState, relayObservers: ReadonlySet<EntityId>): boolean {
    if (relayObservers.size === 0) return false;
    for (const ally of frame.entities) {
      if (!relayObservers.has(ally.id) || ally.lifecycle !== 'active' || ally.id === observer.id || ally.team.teamId !== observer.team.teamId) continue;
      if (this.#lineOfSight.hasLineOfSight(ally.position, target.position, 1)) return true;
    }
    return false;
  }

  private sourceFor(rel: ContactRelation, direct: boolean, publicMap: boolean, relay: boolean, designation: boolean): ContactSource {
    if (rel === 'self') return 'self';
    if (rel === 'friendly' || rel === 'neutral') return 'friendly';
    if (direct) return 'direct';
    if (publicMap) return 'public-map';
    if (relay) return 'relay';
    if (designation) return 'designation';
    return 'last-known';
  }

  private liveContact(entity: EntityState, rel: ContactRelation, source: ContactSource, directSight: boolean, publiclyTracked: boolean, relayed: boolean, designated: boolean, frame: PerceptionFrame): PerceivedContact {
    const detailed = rel !== 'hostile' || (directSight && this.#policy.directSightRevealsDetails);
    return {
      id: entity.id,
      kind: entity.kind,
      relation: rel,
      teamId: entity.team.teamId,
      source,
      position: clonePoint(entity.position),
      observedAtTick: frame.tick,
      observedAtMs: frame.elapsedMs,
      visibility: { directSight, publiclyTracked, relayed, designated },
      live: true,
      targetable: targetable(entity, rel),
      ...(detailed ? { rotation: entity.rotation, health: entity.health ? { ...entity.health } : undefined } : {}),
      ...(detailed && directSight && entity.kind === 'shape' ? { shapeType: entity.shapeType } : {}),
    };
  }

  private remember(teamId: string, contact: PerceivedContact): void {
    this.#lastKnown.set(this.memoryKey(teamId, contact.id), {
      id: contact.id, kind: contact.kind, relation: contact.relation, teamId: contact.teamId,
      position: clonePoint(contact.position), observedAtTick: contact.observedAtTick, observedAtMs: contact.observedAtMs,
    });
  }

  private getRemembered(teamId: string, id: EntityId, tick: number): LastKnownContact | undefined {
    const key = this.memoryKey(teamId, id);
    const memory = this.#lastKnown.get(key);
    if (!memory) return undefined;
    if (tick - memory.observedAtTick > this.#policy.lastKnownTtlTicks) { this.#lastKnown.delete(key); return undefined; }
    return memory;
  }

  private lastKnownContact(memory: LastKnownContact): PerceivedContact {
    return {
      ...memory,
      position: clonePoint(memory.position),
      source: 'last-known',
      visibility: { directSight: false, publiclyTracked: false, relayed: false, designated: false },
      live: false,
      targetable: memory.relation === 'hostile',
    };
  }

  private memoryKey(teamId: string, id: EntityId): string { return `${teamId}:${String(id)}`; }
}
