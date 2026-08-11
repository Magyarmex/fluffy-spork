import type { EntityId } from '../simulation/types';
import type { Designation } from './types';

export class DesignationRegistry {
  readonly #entries = new Map<string, Designation>();

  designate(input: Designation): Designation {
    if (!input.teamId.trim()) throw new Error('designation teamId must be non-empty');
    if (input.observerId === input.targetId) throw new Error('observer cannot designate itself');
    if (!Number.isInteger(input.createdAtTick) || !Number.isInteger(input.expiresAtTick)) {
      throw new Error('designation ticks must be integers');
    }
    if (input.expiresAtTick <= input.createdAtTick) throw new Error('designation must expire after creation');
    const entry = { ...input };
    this.#entries.set(this.key(entry.teamId, entry.targetId), entry);
    return { ...entry };
  }

  clear(teamId: string, targetId: EntityId): void {
    this.#entries.delete(this.key(teamId, targetId));
  }

  get(teamId: string, targetId: EntityId, tick: number): Designation | undefined {
    const key = this.key(teamId, targetId);
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtTick <= tick) {
      this.#entries.delete(key);
      return undefined;
    }
    return { ...entry };
  }

  activeForTeam(teamId: string, tick: number): readonly Designation[] {
    const result: Designation[] = [];
    for (const entry of this.#entries.values()) {
      if (entry.expiresAtTick <= tick) {
        this.#entries.delete(this.key(entry.teamId, entry.targetId));
        continue;
      }
      if (entry.teamId === teamId) result.push({ ...entry });
    }
    return result.sort((a, b) => String(a.targetId).localeCompare(String(b.targetId)));
  }

  private key(teamId: string, targetId: EntityId): string {
    return `${teamId}:${String(targetId)}`;
  }
}
