import type { JsonValue } from '../persistence/schema';

export const DIAGNOSTICS_SCHEMA_VERSION = 1 as const;

export const DIAGNOSTIC_SECTIONS = Object.freeze([
  'build', 'simulation', 'player', 'ai', 'perception', 'navigation', 'drones',
  'input', 'rendering', 'audio', 'persistence', 'scene', 'performance',
] as const);

export type DiagnosticSectionName = typeof DIAGNOSTIC_SECTIONS[number];
export type DiagnosticSection = Readonly<Record<string, JsonValue>>;

export interface DiagnosticSnapshot {
  readonly schemaVersion: typeof DIAGNOSTICS_SCHEMA_VERSION;
  readonly capturedAt: string;
  readonly sections: Readonly<Record<DiagnosticSectionName, DiagnosticSection>>;
}

export type DiagnosticProvider = () => Readonly<Record<string, unknown>>;
export type DiagnosticProviders = Readonly<Partial<Record<DiagnosticSectionName, DiagnosticProvider>>>;
