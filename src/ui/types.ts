import type { EntitySnapshot, HealthState } from '../game/entities/types';
import type { ProgressionState } from '../game/progression/types';
import type { PerceivedContact } from '../game/targeting/types';
import type { InputSettings } from '../input/commands/InputSettings';

export type UIScreen = 'lobby' | 'match' | 'evolution' | 'blackglass' | 'settings' | 'debug';

export interface AuthoritativeUIFrame {
  readonly tick: number;
  readonly playerId?: string;
  readonly entities: EntitySnapshot;
  readonly progression?: ProgressionState;
  readonly contacts?: readonly PerceivedContact[];
  readonly score?: number;
  readonly tip?: string;
  readonly debug?: Readonly<Record<string, unknown>>;
}

export interface HUDViewModel {
  readonly tick: number;
  readonly playerId?: string;
  readonly health?: HealthState;
  readonly level?: number;
  readonly xp?: number;
  readonly statPoints?: number;
  readonly score?: number;
  readonly tankId?: string;
  readonly hostileContacts: number;
  readonly friendlyContacts: number;
}

export interface EvolutionViewModel {
  readonly level: number;
  readonly tankId: string;
  readonly milestone?: 'tier1' | 'tier2' | 'mastery' | 'gene' | 'apex';
  readonly choices: readonly string[];
}

export interface ContactMessage {
  readonly id: number;
  readonly key: string;
  readonly text: string;
  readonly createdAtMs: number;
}

export interface PresentationSettings {
  readonly stickSize: number;
  readonly stickOpacity: number;
  readonly screenShake: number;
  readonly reducedMotion: boolean;
}

export interface UISettingsState {
  readonly input: Readonly<InputSettings>;
  readonly presentation: PresentationSettings;
}

export interface UIReadModel {
  readonly screen: UIScreen;
  readonly hud: HUDViewModel;
  readonly evolution?: EvolutionViewModel;
  readonly contacts: readonly PerceivedContact[];
  readonly messages: readonly ContactMessage[];
  readonly settings: UISettingsState;
  readonly tip?: string;
  readonly debug: Readonly<Record<string, unknown>>;
}
