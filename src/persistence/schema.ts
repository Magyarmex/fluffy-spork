export const SAVE_SCHEMA_VERSION = 1 as const;
export const FOUNDATION_SAVE_KEY = 'novatanks_save_v1' as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface PersistedPilotSettings {
  readonly aimSensitivity: number;
  readonly moveSensitivity: number;
  readonly stickDeadzone: number;
  readonly stickSize: number;
  readonly stickOpacity: number;
  readonly screenShake: number;
  readonly reducedMotion: boolean;
}

export interface PersistedPreferences {
  readonly quality: 'high' | 'low';
  readonly muted: boolean;
  readonly musicOff: boolean;
  readonly pilot: PersistedPilotSettings;
}

export interface PersistedProgression {
  /** Highest run level observed by the legacy progression/pity-era behavior. */
  readonly bestLevel: number;
}

export interface PersistedScores {
  readonly best: number;
}

export interface PersistedProfile {
  /** Reserved canonical profile data. Legacy NOVA currently has no durable profile fields. */
  readonly data: Readonly<Record<string, JsonValue>>;
}

export interface SaveFileV1 {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  readonly scores: PersistedScores;
  readonly progression: PersistedProgression;
  readonly preferences: PersistedPreferences;
  readonly profile: PersistedProfile;
  /** Unknown legacy/current fields are retained here instead of silently discarded. */
  readonly extensions: Readonly<Record<string, JsonValue>>;
}

export type SaveFile = SaveFileV1;

export const DEFAULT_SAVE_FILE: SaveFile = Object.freeze({
  schemaVersion: SAVE_SCHEMA_VERSION,
  scores: Object.freeze({ best: 0 }),
  progression: Object.freeze({ bestLevel: 1 }),
  preferences: Object.freeze({
    quality: 'high',
    muted: false,
    musicOff: false,
    pilot: Object.freeze({
      aimSensitivity: 1,
      moveSensitivity: 1,
      stickDeadzone: 0.12,
      stickSize: 1,
      stickOpacity: 0.82,
      screenShake: 1,
      reducedMotion: false,
    }),
  }),
  profile: Object.freeze({ data: Object.freeze({}) }),
  extensions: Object.freeze({}),
});
