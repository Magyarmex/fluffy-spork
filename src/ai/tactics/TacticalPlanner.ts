import { normalize, subtract } from '../../game/simulation/math';
import type { EntityId } from '../../game/simulation/types';
import { doctrineFor } from './doctrine';
import {
  DEFAULT_AI_DIFFICULTY,
  type AIDifficultyPolicy,
  type TacticalContext,
  type TacticalPlan,
  type TargetScore,
} from './types';

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function deterministicAimError(targetId: EntityId, tick: number, floor: number): number {
  let hash = tick | 0;
  for (const char of String(targetId)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const unit = ((hash >>> 0) % 2001) / 1000 - 1;
  return unit * Math.max(0.0001, floor);
}

function rotate(vector: Readonly<{ x: number; y: number }>, radians: number) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: vector.x * c - vector.y * s, y: vector.x * s + vector.y * c };
}

export class TacticalPlanner {
  readonly #difficulty: AIDifficultyPolicy;

  constructor(difficulty: Partial<AIDifficultyPolicy> = {}) {
    this.#difficulty = Object.freeze({ ...DEFAULT_AI_DIFFICULTY, ...difficulty });
    if (this.#difficulty.reactionTicks < 1) throw new Error('reactionTicks must be at least 1');
    if (!(this.#difficulty.aimErrorRadians > 0)) throw new Error('aimErrorRadians must preserve a positive fairness floor');
  }

  scoreTargets(context: TacticalContext): readonly TargetScore[] {
    const preferredRange = Math.max(1, context.build.weaponRange * doctrineFor(context.lineage).preferredRangeFactor);
    return Object.freeze(context.frame.threats.map((target) => {
      const distanceFit = 1 - Math.min(1, Math.abs(target.distance - preferredRange) / Math.max(preferredRange, 1));
      const punishability = target.healthFraction === undefined ? 0.3 : 1 - clamp01(target.healthFraction);
      const knowledge = target.freshness === 'live' ? 0.25 : -0.15;
      const sight = target.directSight ? 0.18 : 0;
      const designation = target.designated ? 0.3 : 0;
      const commitments = context.friendlyCommitments?.[String(target.id)] ?? 0;
      const saturation = commitments * this.#difficulty.saturationPenalty;
      return Object.freeze({ target, score: distanceFit * 0.8 + punishability * 0.65 + knowledge + sight + designation - saturation });
    }).sort((a, b) => b.score - a.score || String(a.target.id).localeCompare(String(b.target.id))));
  }

  plan(context: TacticalContext): TacticalPlan {
    const self = context.frame.observations.find((entry) => entry.id === context.frame.world.observerId);
    if (!self) throw new Error('Tactical planning requires the observer contact supplied by canonical perception');
    const doctrine = doctrineFor(context.lineage);
    const preferredRange = Math.max(1, context.build.weaponRange * doctrine.preferredRangeFactor);
    const scored = this.scoreTargets(context);
    const chosen = scored[0]?.target;
    if (!chosen) return Object.freeze({ tick: context.tick, targetId: null, intent: 'hold', preferredRange, mayFire: false, useAbility: false, useUltimate: false, issueSwarmAttack: false, aimVector: Object.freeze({ x: 0, y: 0 }) });

    const observation = context.frame.observations.find((entry) => entry.id === chosen.id);
    if (!observation) throw new Error(`Selected target is missing from canonical AI knowledge: ${String(chosen.id)}`);
    const toTarget = subtract(observation.position, self.position);
    const aimBase = normalize(toTarget);
    const aimVector = rotate(aimBase, deterministicAimError(chosen.id, context.tick, this.#difficulty.aimErrorRadians));
    const tooClose = chosen.distance < preferredRange * doctrine.closeCommitFactor;
    const tooFar = chosen.distance > preferredRange * 1.18;
    const wounded = context.selfHealthFraction <= doctrine.retreatHealthFraction;
    const intent = wounded ? 'retreat' : tooClose && context.lineage !== 'guardian' ? 'reposition' : tooFar ? 'advance' : 'engage';

    let destination: Readonly<{ x: number; y: number }> | undefined;
    if (intent === 'advance') {
      destination = observation.position;
    } else if (intent === 'retreat' || intent === 'reposition') {
      const away = normalize(subtract(self.position, observation.position));
      const distance = intent === 'retreat' ? preferredRange : preferredRange * 0.5;
      destination = Object.freeze({ x: self.position.x + away.x * distance, y: self.position.y + away.y * distance });
    }

    const inWeaponRange = chosen.distance <= context.build.weaponRange;
    const mayFire = chosen.directSight && chosen.freshness === 'live' && inWeaponRange;
    const useAbility = Boolean(context.abilityReady) && (wounded || (mayFire && (context.lineage === 'guardian' || context.lineage === 'gunner') && context.selfHealthFraction <= doctrine.abilityHealthThreshold) || (mayFire && context.lineage === 'cannon'));
    const useUltimate = Boolean(context.ultimateReady) && mayFire && chosen.distance >= preferredRange * 0.65;
    const issueSwarmAttack = context.lineage === 'controller' && chosen.freshness === 'live';

    return Object.freeze({
      tick: context.tick,
      targetId: chosen.id,
      targetPosition: Object.freeze({ ...observation.position }),
      intent,
      preferredRange,
      mayFire,
      useAbility,
      useUltimate,
      issueSwarmAttack,
      aimVector: Object.freeze(aimVector),
      ...(destination ? { destination } : {}),
    });
  }
}
