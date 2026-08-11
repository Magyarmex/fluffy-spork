import { UpgradeRegistry } from '../../content';
import type { StatUpgradeId } from '../../content/schema';
import type { ProgressionState, StatRanks } from './types';
import { MAX_LEVEL } from './types';

export const ZERO_STATS: StatRanks = Object.freeze({
  damage: 0,
  reload: 0,
  bulletspeed: 0,
  penetration: 0,
  maxhp: 0,
  regen: 0,
  speed: 0,
  body: 0,
});

export const STAT_IDS = Object.freeze([
  'damage', 'reload', 'bulletspeed', 'penetration', 'maxhp', 'regen', 'speed', 'body',
] as const satisfies readonly StatUpgradeId[]);

export function validateStatRanks(stats: StatRanks): void {
  for (const id of STAT_IDS) {
    const rank = stats[id];
    const maxRank = UpgradeRegistry.get(id).maxRank;
    if (!Number.isInteger(rank) || rank < 0 || rank > maxRank) {
      throw new Error(`Invalid ${id} rank ${rank}; expected integer 0..${maxRank}`);
    }
  }
}

export function spentStatPoints(stats: StatRanks): number {
  validateStatRanks(stats);
  return STAT_IDS.reduce((total, id) => total + stats[id], 0);
}

/** v1.10.8 parity rule: banked points do not increase effective rival power. */
export function appliedPowerLevel(level: number, stats: StatRanks, maxLevel = MAX_LEVEL): number {
  validateStatRanks(stats);
  const rawLevel = Math.max(1, Math.floor(level));
  const cap = Math.max(1, Math.floor(maxLevel));
  return Math.max(1, Math.min(1 + spentStatPoints(stats), rawLevel, cap));
}

export class UpgradeSystem {
  canSpend(state: ProgressionState, id: StatUpgradeId): boolean {
    validateStatRanks(state.stats);
    const definition = UpgradeRegistry.get(id);
    return state.statPoints > 0 && state.stats[id] < definition.maxRank;
  }

  spend(state: ProgressionState, id: StatUpgradeId): ProgressionState {
    if (!Number.isInteger(state.statPoints) || state.statPoints < 0) {
      throw new Error(`Invalid unspent stat point count: ${state.statPoints}`);
    }
    if (!this.canSpend(state, id)) {
      throw new Error(`Cannot spend stat point on ${id}`);
    }
    return Object.freeze({
      ...state,
      statPoints: state.statPoints - 1,
      stats: Object.freeze({ ...state.stats, [id]: state.stats[id] + 1 }),
    });
  }
}
