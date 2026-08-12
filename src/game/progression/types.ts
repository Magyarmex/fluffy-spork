import type { CombatLineageId, StatUpgradeId } from '../../content/schema';

export const MAX_LEVEL = 45 as const;

export type MasteryPerkId = 'dmg' | 'speed' | 'vitality' | 'alacrity' | 'thorns' | 'wealth';
export type ProgressionMilestone = 'tier1' | 'tier2' | 'mastery' | 'gene' | 'apex';

export type StatRanks = Readonly<Record<StatUpgradeId, number>>;

export interface ProgressionState {
  readonly level: number;
  readonly xp: number;
  readonly statPoints: number;
  readonly stats: StatRanks;
  readonly tankId: string;
  readonly perkId?: MasteryPerkId;
  readonly geneId?: CombatLineageId;
}

export interface XpGainResult {
  readonly state: ProgressionState;
  readonly awardedXp: number;
  readonly levelsGained: number;
}

export interface DroneBuild {
  readonly count: number;
  readonly role: 'escort' | 'hunter';
  readonly health: number;
  readonly damage: number;
  readonly speed: number;
  readonly leash: number;
  readonly foreignHunterCount: number;
}

/** Persistent, presentation-free combat projection for a tank build. */
export interface TankBuild {
  readonly tankId: string;
  readonly level: number;
  readonly appliedPowerLevel: number;
  readonly stats: StatRanks;
  readonly perkId?: MasteryPerkId;
  readonly geneId?: CombatLineageId;
  readonly maxHealth: number;
  readonly moveSpeed: number;
  readonly projectileDamage: number;
  readonly reloadSeconds: number;
  readonly projectileSpeed: number;
  readonly penetration: number;
  readonly bodyDamage: number;
  readonly regenPerSecond: number;
  readonly weaponRange: number;
  readonly passiveDamageReduction: number;
  readonly bodyReflectFraction: number;
  readonly drone: DroneBuild;
}
