import { BALANCE, EvolutionRegistry, GeneRegistry, MasteryPerkRegistry, TankRegistry } from '../../content';
import type { CombatLineageId } from '../../content/schema';
import type { MasteryPerkId, ProgressionMilestone, ProgressionState } from './types';

export class EvolutionSystem {
  nextMilestone(state: ProgressionState): ProgressionMilestone | undefined {
    const tank = TankRegistry.get(state.tankId);
    if (state.level >= BALANCE.evolutionLevels.tier1 && tank.tier === 0) return 'tier1';
    if (state.level >= BALANCE.evolutionLevels.tier2 && tank.tier === 1) return 'tier2';
    if (state.level >= BALANCE.evolutionLevels.mastery && !state.perkId) return 'mastery';
    if (state.level >= BALANCE.evolutionLevels.gene && tank.tier >= 2 && !state.geneId) return 'gene';
    if (state.level >= BALANCE.evolutionLevels.apex && tank.tier === 2) return 'apex';
    return undefined;
  }

  evolutionChoices(state: ProgressionState): readonly string[] {
    const edge = EvolutionRegistry.from(state.tankId);
    if (!edge || state.level < edge.level) return [];
    return edge.toTankIds;
  }

  evolve(state: ProgressionState, toTankId: string): ProgressionState {
    TankRegistry.get(toTankId);
    const edge = EvolutionRegistry.from(state.tankId);
    if (!edge || state.level < edge.level || !edge.toTankIds.includes(toTankId)) {
      throw new Error(`Invalid evolution ${state.tankId} -> ${toTankId} at level ${state.level}`);
    }
    return Object.freeze({ ...state, tankId: toTankId });
  }

  chooseMastery(state: ProgressionState, perkId: MasteryPerkId): ProgressionState {
    if (state.level < BALANCE.evolutionLevels.mastery || state.perkId) {
      throw new Error(`Mastery is not available at level ${state.level}`);
    }
    MasteryPerkRegistry.get(perkId);
    return Object.freeze({ ...state, perkId });
  }

  chooseGene(state: ProgressionState, geneId: CombatLineageId): ProgressionState {
    const tank = TankRegistry.get(state.tankId);
    if (state.level < BALANCE.evolutionLevels.gene || tank.tier < 2 || state.geneId) {
      throw new Error(`Gene splice is not available for ${state.tankId} at level ${state.level}`);
    }
    GeneRegistry.get(geneId);
    if (tank.lineage === geneId) throw new Error(`Gene ${geneId} is not foreign to ${state.tankId}`);
    return Object.freeze({ ...state, geneId });
  }
}
