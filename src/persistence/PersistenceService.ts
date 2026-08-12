import { FOUNDATION_SAVE_KEY, SAVE_SCHEMA_VERSION } from './schema';
import type { SaveFile } from './schema';
import { LEGACY_STORAGE_KEYS, migrateLegacyStorage, migrateSaveFile } from './migrations';
import type { LegacyStorageSnapshot } from './migrations';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type PersistenceSource = 'foundation' | 'legacy';

export interface PersistenceLoadResult {
  readonly save: SaveFile;
  readonly source: PersistenceSource;
  readonly warnings: readonly string[];
}

export interface PersistenceDiagnostics {
  readonly schemaVersion: number;
  readonly saveKey: string;
  readonly lastSource?: PersistenceSource;
  readonly lastWarnings: readonly string[];
  readonly storageAvailable: boolean;
}

/**
 * Versioned persistence boundary. It never deletes legacy keys and mirrors the
 * established legacy keys on save so old/offline builds remain compatible
 * during the dual-runtime migration window.
 */
export class PersistenceService {
  private lastSource?: PersistenceSource;
  private lastWarnings: readonly string[] = [];

  constructor(private readonly storage: StorageLike) {}

  load(): PersistenceLoadResult {
    const warnings: string[] = [];
    const current = this.safeGet(FOUNDATION_SAVE_KEY, warnings);
    if (current !== null) {
      try {
        const migrated = migrateSaveFile(JSON.parse(current));
        return this.finish({ save: migrated.save, source: 'foundation', warnings: [...warnings, ...migrated.warnings] });
      } catch (error) {
        warnings.push(`Foundation save could not be loaded and was left untouched: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const legacy: Record<string, string | null> = {};
    for (const key of Object.values(LEGACY_STORAGE_KEYS)) legacy[key] = this.safeGet(key, warnings);
    const migrated = migrateLegacyStorage(legacy as LegacyStorageSnapshot);
    return this.finish({ save: migrated.save, source: 'legacy', warnings: [...warnings, ...migrated.warnings] });
  }

  save(save: SaveFile): readonly string[] {
    const normalized = migrateSaveFile(save).save;
    const warnings: string[] = [];
    this.safeSet(FOUNDATION_SAVE_KEY, JSON.stringify(normalized), warnings);
    this.mirrorLegacy(normalized, warnings);
    this.lastWarnings = Object.freeze([...warnings]);
    return this.lastWarnings;
  }

  diagnostics(): PersistenceDiagnostics {
    return Object.freeze({
      schemaVersion: SAVE_SCHEMA_VERSION,
      saveKey: FOUNDATION_SAVE_KEY,
      lastSource: this.lastSource,
      lastWarnings: this.lastWarnings,
      storageAvailable: this.canAccessStorage(),
    });
  }

  private finish(result: PersistenceLoadResult): PersistenceLoadResult {
    this.lastSource = result.source;
    this.lastWarnings = Object.freeze([...result.warnings]);
    return Object.freeze({ ...result, warnings: this.lastWarnings });
  }

  private mirrorLegacy(save: SaveFile, warnings: string[]): void {
    this.safeSet(LEGACY_STORAGE_KEYS.best, String(save.scores.best), warnings);
    this.safeSet(LEGACY_STORAGE_KEYS.bestLevel, String(save.progression.bestLevel), warnings);
    this.safeSet(LEGACY_STORAGE_KEYS.quality, save.preferences.quality, warnings);
    this.safeSet(LEGACY_STORAGE_KEYS.muted, save.preferences.muted ? '1' : '0', warnings);
    this.safeSet(LEGACY_STORAGE_KEYS.musicOff, save.preferences.musicOff ? '1' : '0', warnings);
    const pilot = save.preferences.pilot;
    this.safeSet(LEGACY_STORAGE_KEYS.pilot, JSON.stringify({
      aimSensitivity: Math.round(pilot.aimSensitivity * 100),
      moveSensitivity: Math.round(pilot.moveSensitivity * 100),
      stickSize: Math.round(pilot.stickSize * 100),
      stickOpacity: Math.round(pilot.stickOpacity * 100),
      screenShake: Math.round(pilot.screenShake * 100),
      ...(pilot.reducedMotion ? { reducedMotion: true } : {}),
      stickDeadzone: pilot.stickDeadzone,
    }), warnings);
  }

  private canAccessStorage(): boolean {
    try { this.storage.getItem(FOUNDATION_SAVE_KEY); return true; }
    catch { return false; }
  }

  private safeGet(key: string, warnings: string[]): string | null {
    try { return this.storage.getItem(key); }
    catch { warnings.push(`Storage read failed for ${key}; no data was deleted.`); return null; }
  }

  private safeSet(key: string, value: string, warnings: string[]): void {
    try { this.storage.setItem(key, value); }
    catch { warnings.push(`Storage write failed for ${key}; existing data was left untouched.`); }
  }
}

export function browserStorage(): StorageLike | undefined {
  try {
    const candidate = globalThis.localStorage;
    return candidate ?? undefined;
  } catch {
    return undefined;
  }
}
