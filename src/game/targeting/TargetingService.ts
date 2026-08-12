import type { Vector2State } from '../entities/types';
import type { EntityId } from '../simulation/types';
import type { PerceivedContact, PerceivedWorld } from './types';

export interface TargetQuery {
  readonly origin: Vector2State;
  readonly maxRange?: number;
  readonly requireDirectSight?: boolean;
  readonly allowLastKnown?: boolean;
}

function distanceSquared(a: Vector2State, b: Vector2State): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export class TargetingService {
  isValidTarget(world: PerceivedWorld, targetId: EntityId, query: TargetQuery): boolean {
    const contact = world.getContact(targetId);
    return contact ? this.isValidContact(contact, query) : false;
  }

  acquireNearest(world: PerceivedWorld, query: TargetQuery): PerceivedContact | undefined {
    const maxRangeSq = query.maxRange === undefined ? Number.POSITIVE_INFINITY : query.maxRange * query.maxRange;
    let best: PerceivedContact | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const contact of world.hostileContacts()) {
      if (!this.isValidContact(contact, query)) continue;
      const distance = distanceSquared(query.origin, contact.position);
      if (distance > maxRangeSq) continue;
      if (distance < bestDistance || (distance === bestDistance && best && String(contact.id) < String(best.id))) {
        best = contact;
        bestDistance = distance;
      } else if (!best) {
        best = contact;
        bestDistance = distance;
      }
    }
    return best;
  }

  private isValidContact(contact: PerceivedContact, query: TargetQuery): boolean {
    if (contact.relation !== 'hostile' || !contact.targetable) return false;
    if (!contact.live && query.allowLastKnown !== true) return false;
    if (query.requireDirectSight && !contact.visibility.directSight) return false;
    if (query.maxRange !== undefined && distanceSquared(query.origin, contact.position) > query.maxRange * query.maxRange) return false;
    return true;
  }
}
