import { EvolutionSystem } from '../game/progression/EvolutionSystem';
import type { EvolutionViewModel, HUDViewModel } from './types';
import type { AuthoritativeUIFrame } from './types';

const evolutionSystem = new EvolutionSystem();

/** Pure selectors: authoritative state in, immutable presentation data out. */
export function selectHUD(frame: AuthoritativeUIFrame): HUDViewModel {
  const player = frame.playerId
    ? frame.entities.entities.find((entity) => entity.id === frame.playerId)
    : undefined;
  const contacts = frame.contacts ?? [];
  return Object.freeze({
    tick: frame.tick,
    playerId: frame.playerId,
    health: player?.health ? Object.freeze({ ...player.health }) : undefined,
    level: frame.progression?.level,
    xp: frame.progression?.xp,
    statPoints: frame.progression?.statPoints,
    score: frame.score,
    tankId: frame.progression?.tankId,
    hostileContacts: contacts.filter((contact) => contact.relation === 'hostile').length,
    friendlyContacts: contacts.filter((contact) => contact.relation === 'friendly').length,
  });
}

export function selectEvolution(frame: AuthoritativeUIFrame): EvolutionViewModel | undefined {
  const progression = frame.progression;
  if (!progression) return undefined;
  return Object.freeze({
    level: progression.level,
    tankId: progression.tankId,
    milestone: evolutionSystem.nextMilestone(progression),
    choices: Object.freeze([...evolutionSystem.evolutionChoices(progression)]),
  });
}

export function selectContacts(frame: AuthoritativeUIFrame) {
  return Object.freeze([...(frame.contacts ?? [])]);
}
