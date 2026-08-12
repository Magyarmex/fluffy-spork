import { ReplayPlayer, type ReplayRecording, type ReplayResult, type ReplayRuntime } from './Replay';

export type ParitySurface =
  | 'desktop'
  | 'portrait-mobile'
  | 'landscape-mobile'
  | 'touch'
  | 'mouse'
  | 'keyboard'
  | 'gamepad'
  | 'gunner'
  | 'cannon'
  | 'guardian'
  | 'sniper'
  | 'controller'
  | 'major-evolutions'
  | 'battlefield-layouts'
  | 'blackglass'
  | 'lobby'
  | 'settings'
  | 'pwa';

export const REQUIRED_PARITY_SURFACES: readonly ParitySurface[] = Object.freeze([
  'desktop', 'portrait-mobile', 'landscape-mobile', 'touch', 'mouse', 'keyboard', 'gamepad',
  'gunner', 'cannon', 'guardian', 'sniper', 'controller', 'major-evolutions', 'battlefield-layouts',
  'blackglass', 'lobby', 'settings', 'pwa',
]);

export interface ParityCase<TOutcome = unknown> {
  readonly id: string;
  readonly surfaces: readonly ParitySurface[];
  readonly recording: ReplayRecording;
  readonly legacy: () => ReplayRuntime<TOutcome>;
  readonly foundation: () => ReplayRuntime<TOutcome>;
  readonly tolerance?: number;
  readonly ignorePaths?: readonly string[];
}

export interface ParityDifference {
  readonly path: string;
  readonly legacy: unknown;
  readonly foundation: unknown;
  readonly reason: string;
}

export interface ParityCaseResult<TOutcome = unknown> {
  readonly id: string;
  readonly surfaces: readonly ParitySurface[];
  readonly passed: boolean;
  readonly differences: readonly ParityDifference[];
  readonly legacy: ReplayResult<TOutcome>;
  readonly foundation: ReplayResult<TOutcome>;
}

export interface ParityReport<TOutcome = unknown> {
  readonly schemaVersion: 1;
  readonly passed: boolean;
  readonly coveredSurfaces: readonly ParitySurface[];
  readonly missingSurfaces: readonly ParitySurface[];
  readonly cases: readonly ParityCaseResult<TOutcome>[];
}

function pathIgnored(path: string, ignored: readonly string[]): boolean {
  return ignored.some((entry) => path === entry || path.startsWith(`${entry}.`) || path.startsWith(`${entry}[`));
}

function compareValue(
  legacy: unknown,
  foundation: unknown,
  path: string,
  tolerance: number,
  ignored: readonly string[],
  out: ParityDifference[],
): void {
  if (pathIgnored(path, ignored)) return;
  if (typeof legacy === 'number' && typeof foundation === 'number') {
    if (Number.isNaN(legacy) && Number.isNaN(foundation)) return;
    if (Math.abs(legacy - foundation) > tolerance) out.push({ path, legacy, foundation, reason: `numeric delta exceeds ${tolerance}` });
    return;
  }
  if (legacy === null || foundation === null || typeof legacy !== 'object' || typeof foundation !== 'object') {
    if (!Object.is(legacy, foundation)) out.push({ path, legacy, foundation, reason: 'value mismatch' });
    return;
  }
  if (Array.isArray(legacy) || Array.isArray(foundation)) {
    if (!Array.isArray(legacy) || !Array.isArray(foundation)) {
      out.push({ path, legacy, foundation, reason: 'array/type mismatch' });
      return;
    }
    if (legacy.length !== foundation.length) out.push({ path: `${path}.length`, legacy: legacy.length, foundation: foundation.length, reason: 'array length mismatch' });
    const length = Math.min(legacy.length, foundation.length);
    for (let index = 0; index < length; index += 1) compareValue(legacy[index], foundation[index], `${path}[${index}]`, tolerance, ignored, out);
    return;
  }
  const a = legacy as Record<string, unknown>;
  const b = foundation as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    if (!(key in a) || !(key in b)) {
      out.push({ path: `${path}.${key}`, legacy: a[key], foundation: b[key], reason: 'missing key' });
      continue;
    }
    compareValue(a[key], b[key], `${path}.${key}`, tolerance, ignored, out);
  }
}

export function compareMeaningfulOutcomes(
  legacy: unknown,
  foundation: unknown,
  options: { tolerance?: number; ignorePaths?: readonly string[] } = {},
): readonly ParityDifference[] {
  const differences: ParityDifference[] = [];
  compareValue(legacy, foundation, '$', options.tolerance ?? 1e-6, options.ignorePaths ?? [], differences);
  return differences;
}

export class ParityHarness {
  readonly #player = new ReplayPlayer();

  run<TOutcome>(cases: readonly ParityCase<TOutcome>[]): ParityReport<TOutcome> {
    if (cases.length === 0) throw new Error('ParityHarness requires at least one parity case');
    const covered = new Set<ParitySurface>();
    const results: ParityCaseResult<TOutcome>[] = [];

    for (const parityCase of cases) {
      if (!parityCase.id.trim()) throw new Error('Parity case id must be non-empty');
      for (const surface of parityCase.surfaces) covered.add(surface);
      const legacy = this.#player.play(parityCase.recording, parityCase.legacy());
      const foundation = this.#player.play(parityCase.recording, parityCase.foundation());
      const differences = [
        ...compareMeaningfulOutcomes(legacy.outcome, foundation.outcome, {
          tolerance: parityCase.tolerance,
          ignorePaths: parityCase.ignorePaths,
        }),
        ...compareMeaningfulOutcomes(legacy.semanticEvents, foundation.semanticEvents, {
          tolerance: parityCase.tolerance,
          ignorePaths: parityCase.ignorePaths,
        }),
      ];
      results.push({
        id: parityCase.id,
        surfaces: [...parityCase.surfaces],
        passed: differences.length === 0,
        differences,
        legacy,
        foundation,
      });
    }

    const coveredSurfaces = REQUIRED_PARITY_SURFACES.filter((surface) => covered.has(surface));
    const missingSurfaces = REQUIRED_PARITY_SURFACES.filter((surface) => !covered.has(surface));
    return {
      schemaVersion: 1,
      passed: missingSurfaces.length === 0 && results.every((result) => result.passed),
      coveredSurfaces,
      missingSurfaces,
      cases: results,
    };
  }
}
