import type { LineageId } from '../../content/schema';
import type { DoctrineProfile } from './types';

const PROFILES: Readonly<Record<LineageId, DoctrineProfile>> = Object.freeze({
  origin: Object.freeze({ lineage: 'origin', preferredRangeFactor: 0.68, retreatHealthFraction: 0.2, closeCommitFactor: 0.42, abilityHealthThreshold: 0.35, canPressureCover: false }),
  gunner: Object.freeze({ lineage: 'gunner', preferredRangeFactor: 0.62, retreatHealthFraction: 0.2, closeCommitFactor: 0.38, abilityHealthThreshold: 0.42, canPressureCover: false }),
  cannon: Object.freeze({ lineage: 'cannon', preferredRangeFactor: 0.82, retreatHealthFraction: 0.28, closeCommitFactor: 0.5, abilityHealthThreshold: 0.5, canPressureCover: true }),
  guardian: Object.freeze({ lineage: 'guardian', preferredRangeFactor: 0.34, retreatHealthFraction: 0.12, closeCommitFactor: 0.65, abilityHealthThreshold: 0.62, canPressureCover: false }),
  sniper: Object.freeze({ lineage: 'sniper', preferredRangeFactor: 0.92, retreatHealthFraction: 0.34, closeCommitFactor: 0.58, abilityHealthThreshold: 0.48, canPressureCover: false }),
  controller: Object.freeze({ lineage: 'controller', preferredRangeFactor: 0.76, retreatHealthFraction: 0.3, closeCommitFactor: 0.46, abilityHealthThreshold: 0.5, canPressureCover: false }),
});

export function doctrineFor(lineage: LineageId): DoctrineProfile {
  return PROFILES[lineage];
}
