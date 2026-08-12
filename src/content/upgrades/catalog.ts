import { ContentRegistry } from '../registry';
import type { StatUpgradeDefinition } from '../schema';

/**
 * These eight IDs are the effective assignable stat keys consumed by the player,
 * AI allocator and v1.10.8 applied-power parity patch. Rank 8 is the normal cap;
 * legacy AI contains a defensive maxhp fallback after its priority passes, but
 * Mission 05 does not turn that historical behavior into a new content rule.
 */
export const STAT_UPGRADE_DEFINITIONS: readonly StatUpgradeDefinition[] = Object.freeze([
  { id: 'damage', name: 'Bullet Damage', maxRank: 8 },
  { id: 'reload', name: 'Reload', maxRank: 8 },
  { id: 'bulletspeed', name: 'Bullet Speed', maxRank: 8 },
  { id: 'penetration', name: 'Bullet Penetration', maxRank: 8 },
  { id: 'maxhp', name: 'Max Health', maxRank: 8 },
  { id: 'regen', name: 'Health Regen', maxRank: 8 },
  { id: 'speed', name: 'Movement Speed', maxRank: 8 },
  { id: 'body', name: 'Body Damage', maxRank: 8 },
]);

export const UpgradeRegistry = new ContentRegistry<StatUpgradeDefinition>(STAT_UPGRADE_DEFINITIONS);
