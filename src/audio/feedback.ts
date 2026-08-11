import type { CombatSemanticEvent } from '../game/combat/types';
import type { FeedbackEvent, VisualFeedbackCue } from './contracts';

export function feedbackFromCombatEvent(event: CombatSemanticEvent): readonly FeedbackEvent[] {
  switch (event.type) {
    case 'weapon-fired':
      return Object.freeze([{ type: 'ProjectileFired', atSeconds: event.atSeconds, actorId: event.actorId, weaponId: event.weaponId, projectileIds: event.projectileIds }]);
    case 'combatant-damaged':
      return Object.freeze([{ type: 'TankDamaged', atSeconds: event.atSeconds, actorId: event.actorId, targetId: event.targetId, damage: event.damage, remainingHealth: event.remainingHealth }]);
    case 'combatant-destroyed':
      return Object.freeze([{ type: 'TankDestroyed', atSeconds: event.atSeconds, actorId: event.actorId, targetId: event.targetId }]);
    case 'ability-activated':
      return Object.freeze([{ type: 'AbilityActivated', atSeconds: event.atSeconds, actorId: event.actorId, abilityId: event.abilityId }]);
    default:
      return Object.freeze([]);
  }
}

export function selectVisualFeedback(event: FeedbackEvent): readonly VisualFeedbackCue[] {
  switch (event.type) {
    case 'ProjectileFired':
      return Object.freeze([{ id: 'muzzle-glint', eventType: event.type, position: event.position, intensity: 0.72 }]);
    case 'ProjectileFlyby':
      return Object.freeze([{ id: 'flyby-streak', eventType: event.type, position: event.position, intensity: Math.max(0.2, Math.min(1, 1 - event.nearestDistance / 220)) }]);
    case 'TankDamaged':
      return Object.freeze([
        { id: 'impact-spark', eventType: event.type, position: event.position, intensity: Math.max(0.3, Math.min(1, event.damage / 100)) },
        { id: 'damage-edge', eventType: event.type, position: event.position, intensity: Math.max(0.25, Math.min(1, event.damage / 140)) },
      ]);
    case 'DroneDestroyed':
      return Object.freeze([{ id: 'drone-pop', eventType: event.type, position: event.position, intensity: 0.8 }]);
    case 'PerfectGuard':
      return Object.freeze([{ id: 'perfect-guard-flash', eventType: event.type, position: event.position, intensity: 1 }]);
    case 'AbilityActivated':
      return Object.freeze([{ id: 'ability-pulse', eventType: event.type, position: event.position, intensity: event.isUltimate ? 1 : 0.7 }]);
    case 'EvolutionAvailable':
      return Object.freeze([{ id: 'evolution-ready', eventType: event.type, intensity: 0.72 }]);
    default:
      return Object.freeze([]);
  }
}
