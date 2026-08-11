import { BALANCE, TankRegistry } from '../../content';
import type { ProgressionState, XpGainResult } from './types';
import { MAX_LEVEL } from './types';
import { validateStatRanks } from './UpgradeSystem';

export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) throw new Error(`Invalid level: ${level}`);
  return Math.floor((22 * Math.pow(Math.floor(level), 1.42)) / 10) * 10;
}

export function pityStartLevel(bestRunLevel: number): number {
  const best = Math.max(0, Math.floor(bestRunLevel));
  if (best <= 3) return 1;
  return Math.max(1, Math.min(9, 1 + Math.floor((best - 1) * 0.3)));
}

export function validateProgressionState(state: ProgressionState): void {
  if (!Number.isInteger(state.level) || state.level < 1 || state.level > MAX_LEVEL) {
    throw new Error(`Invalid level ${state.level}`);
  }
  if (!Number.isFinite(state.xp) || state.xp < 0) throw new Error(`Invalid XP ${state.xp}`);
  if (!Number.isInteger(state.statPoints) || state.statPoints < 0) {
    throw new Error(`Invalid stat point count ${state.statPoints}`);
  }
  validateStatRanks(state.stats);
  const tank = TankRegistry.get(state.tankId);
  const minimumLevel = tank.tier === 0 ? 1
    : tank.tier === 1 ? BALANCE.evolutionLevels.tier1
      : tank.tier === 2 ? BALANCE.evolutionLevels.tier2
        : BALANCE.evolutionLevels.apex;
  if (state.level < minimumLevel) {
    throw new Error(`${state.tankId} tier ${tank.tier} is impossible at level ${state.level}`);
  }
  if (state.perkId && state.level < BALANCE.evolutionLevels.mastery) {
    throw new Error(`Mastery is impossible at level ${state.level}`);
  }
  if (state.geneId) {
    if (state.level < BALANCE.evolutionLevels.gene || tank.tier < 2) {
      throw new Error(`Gene splice is impossible for ${state.tankId} at level ${state.level}`);
    }
    if (tank.lineage === state.geneId) throw new Error(`Gene ${state.geneId} must be foreign`);
  }
}

export class ProgressionSystem {
  gainXp(state: ProgressionState, amount: number): XpGainResult {
    validateProgressionState(state);
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid XP award ${amount}`);
    const awardedXp = amount * (state.perkId === 'wealth' ? 1.3 : 1);
    let xp = state.xp + awardedXp;
    let level = state.level;
    let statPoints = state.statPoints;
    let levelsGained = 0;
    while (level < MAX_LEVEL && xp >= xpForLevel(level)) {
      xp -= xpForLevel(level);
      level += 1;
      statPoints += 1;
      levelsGained += 1;
    }
    return Object.freeze({
      state: Object.freeze({ ...state, level, xp, statPoints }),
      awardedXp,
      levelsGained,
    });
  }
}
