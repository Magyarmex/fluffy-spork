import { DEFAULT_SAVE_FILE, SAVE_SCHEMA_VERSION } from './schema';
import type { JsonValue, SaveFile } from './schema';

export const LEGACY_STORAGE_KEYS = Object.freeze({
  best: 'novatanks_best',
  bestLevel: 'novatanks_bestlevel',
  quality: 'novatanks_quality',
  muted: 'novatanks_muted',
  musicOff: 'novatanks_musicoff',
  pilot: 'novatanks_pilot_settings_v1',
  updateReadyAt: 'nova:lastUpdateReadyAt',
  updateFingerprint: 'nova:lastUpdateFingerprint',
});

export interface LegacyStorageSnapshot {
  readonly [key: string]: string | null;
}

export interface MigrationResult {
  readonly save: SaveFile;
  readonly warnings: readonly string[];
}

function finite(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function flag(value: unknown, fallback = false): boolean {
  if (value === true || value === '1') return true;
  if (value === false || value === '0') return false;
  return fallback;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const converted = value.map(jsonValue);
    return converted.every((entry) => entry !== undefined) ? converted as JsonValue[] : undefined;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const converted = jsonValue(entry);
      if (converted !== undefined) out[key] = converted;
    }
    return out;
  }
  return undefined;
}

function pilotFromLegacy(raw: unknown, warnings: string[]): SaveFile['preferences']['pilot'] {
  const pilot = object(raw);
  const legacyScale = (value: unknown, fallback: number, min: number, max: number) =>
    finite(value, fallback * 100, min * 100, max * 100) / 100;
  return {
    aimSensitivity: legacyScale(pilot.aimSensitivity, 1, 0.6, 1.6),
    moveSensitivity: legacyScale(pilot.moveSensitivity, 1, 0.6, 1.6),
    stickDeadzone: finite(pilot.stickDeadzone, DEFAULT_SAVE_FILE.preferences.pilot.stickDeadzone, 0, 0.95),
    stickSize: legacyScale(pilot.stickSize, 1, 0.8, 1.3),
    stickOpacity: legacyScale(pilot.stickOpacity, 0.82, 0.3, 1),
    screenShake: legacyScale(pilot.screenShake, 1, 0, 1),
    reducedMotion: flag(pilot.reducedMotion, false),
  };
}

export function migrateLegacyStorage(snapshot: LegacyStorageSnapshot): MigrationResult {
  const warnings: string[] = [];
  let pilot: unknown = {};
  const pilotRaw = snapshot[LEGACY_STORAGE_KEYS.pilot];
  if (pilotRaw) {
    try { pilot = JSON.parse(pilotRaw); }
    catch { warnings.push('Legacy pilot settings contain malformed JSON; original storage is retained.'); }
  }

  const qualityRaw = snapshot[LEGACY_STORAGE_KEYS.quality];
  const quality = qualityRaw === 'low' ? 'low' : 'high';
  if (qualityRaw !== null && qualityRaw !== 'high' && qualityRaw !== 'low') {
    warnings.push(`Unknown legacy quality value ${JSON.stringify(qualityRaw)} retained in extensions.`);
  }

  const extensions: Record<string, JsonValue> = {};
  if (qualityRaw !== null && qualityRaw !== 'high' && qualityRaw !== 'low') extensions.legacyQuality = qualityRaw;
  const readyAt = snapshot[LEGACY_STORAGE_KEYS.updateReadyAt];
  const fingerprint = snapshot[LEGACY_STORAGE_KEYS.updateFingerprint];
  if (readyAt !== null) extensions.pwaLastUpdateReadyAt = readyAt;
  if (fingerprint !== null) extensions.pwaLastUpdateFingerprint = fingerprint;

  return {
    save: {
      schemaVersion: SAVE_SCHEMA_VERSION,
      scores: { best: finite(snapshot[LEGACY_STORAGE_KEYS.best], DEFAULT_SAVE_FILE.scores.best) },
      progression: { bestLevel: Math.max(1, Math.floor(finite(snapshot[LEGACY_STORAGE_KEYS.bestLevel], DEFAULT_SAVE_FILE.progression.bestLevel, 1))) },
      preferences: {
        quality,
        muted: flag(snapshot[LEGACY_STORAGE_KEYS.muted]),
        musicOff: flag(snapshot[LEGACY_STORAGE_KEYS.musicOff]),
        pilot: pilotFromLegacy(pilot, warnings),
      },
      profile: { data: {} },
      extensions,
    },
    warnings,
  };
}

export function migrateSaveFile(raw: unknown): MigrationResult {
  const warnings: string[] = [];
  const source = object(raw);
  const version = Number(source.schemaVersion);
  if (version !== SAVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported NOVA save schema version: ${String(source.schemaVersion)}`);
  }

  const scores = object(source.scores);
  const progression = object(source.progression);
  const preferences = object(source.preferences);
  const pilot = object(preferences.pilot);
  const profile = object(source.profile);
  const profileData = object(profile.data);
  const sourceExtensions = object(source.extensions);
  const extensions: Record<string, JsonValue> = {};

  for (const [key, value] of Object.entries(sourceExtensions)) {
    const converted = jsonValue(value);
    if (converted !== undefined) extensions[key] = converted;
  }
  for (const [key, value] of Object.entries(source)) {
    if (['schemaVersion', 'scores', 'progression', 'preferences', 'profile', 'extensions'].includes(key)) continue;
    const converted = jsonValue(value);
    if (converted !== undefined) extensions[`unmapped:${key}`] = converted;
  }

  const profileOut: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(profileData)) {
    const converted = jsonValue(value);
    if (converted !== undefined) profileOut[key] = converted;
  }

  return {
    save: {
      schemaVersion: SAVE_SCHEMA_VERSION,
      scores: { best: finite(scores.best, DEFAULT_SAVE_FILE.scores.best) },
      progression: { bestLevel: Math.max(1, Math.floor(finite(progression.bestLevel, DEFAULT_SAVE_FILE.progression.bestLevel, 1))) },
      preferences: {
        quality: preferences.quality === 'low' ? 'low' : 'high',
        muted: flag(preferences.muted),
        musicOff: flag(preferences.musicOff),
        pilot: {
          aimSensitivity: finite(pilot.aimSensitivity, 1, 0.6, 1.6),
          moveSensitivity: finite(pilot.moveSensitivity, 1, 0.6, 1.6),
          stickDeadzone: finite(pilot.stickDeadzone, DEFAULT_SAVE_FILE.preferences.pilot.stickDeadzone, 0, 0.95),
          stickSize: finite(pilot.stickSize, 1, 0.8, 1.3),
          stickOpacity: finite(pilot.stickOpacity, 0.82, 0.3, 1),
          screenShake: finite(pilot.screenShake, 1, 0, 1),
          reducedMotion: flag(pilot.reducedMotion),
        },
      },
      profile: { data: profileOut },
      extensions,
    },
    warnings,
  };
}
