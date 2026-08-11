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

/**
 * Public consumers should import from @content (this module) rather than
 * reaching into category implementation files. That keeps lobby, Blackglass,
 * AI, UI and the future simulation on one definition graph.
 */
export const CONTENT_SPECIMEN = 'main@52009c406b948a7b9a9402bb56495f20b3918ba6' as const;
