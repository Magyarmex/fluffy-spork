export * from './schema';
export { ContentRegistry } from './registry';
export {
  TankRegistry,
  WeaponRegistry,
  DroneRegistry,
  LineageRegistry,
  GeneRegistry,
  AbilityRegistry,
  MasteryPerkRegistry,
  EvolutionRegistry,
  BattlefieldRegistry,
  BALANCE,
  GENE_OPTIONS,
} from './catalog';
export { UpgradeRegistry, STAT_UPGRADE_DEFINITIONS } from './upgrades/catalog';
export { FIELDCRAFT_TIPS, FIELDCRAFT_DISPLAY_MS, auditFieldcraftTips } from './tips/FieldcraftTips';
export type { FieldcraftTip } from './tips/FieldcraftTips';
export { RELEASE_HISTORY, LATEST_RELEASE } from './releases/ReleaseHistory';
export type { ReleaseRecord } from './releases/ReleaseHistory';

/** Public consumers import from @content rather than category implementation files. */
export const CONTENT_SPECIMEN = 'main@52009c406b948a7b9a9402bb56495f20b3918ba6' as const;
