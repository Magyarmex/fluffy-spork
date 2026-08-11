import { DEFAULT_INPUT_SETTINGS } from '../../input/commands/InputSettings';
import type { InputSettings } from '../../input/commands/InputSettings';
import type { PresentationSettings, UISettingsState } from '../types';

const DEFAULT_PRESENTATION: PresentationSettings = Object.freeze({
  stickSize: 1,
  stickOpacity: 0.82,
  screenShake: 1,
  reducedMotion: false,
});

export interface LiveSettingsPatch {
  readonly aimSensitivity?: number;
  readonly moveSensitivity?: number;
  readonly stickDeadzone?: number;
  readonly stickSize?: number;
  readonly stickOpacity?: number;
  readonly screenShake?: number;
  readonly reducedMotion?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

/** Owns control/presentation preferences only; never simulation state or combat tuning. */
export class LiveSettings {
  private state: UISettingsState;

  constructor(initial: LiveSettingsPatch = {}) {
    this.state = this.build(initial);
  }

  snapshot(): UISettingsState { return this.state; }
  inputSettings = (): Readonly<InputSettings> => this.state.input;

  update(patch: LiveSettingsPatch): UISettingsState {
    const current = this.state;
    this.state = this.build({
      aimSensitivity: patch.aimSensitivity ?? current.input.aimSensitivity,
      moveSensitivity: patch.moveSensitivity ?? current.input.moveSensitivity ?? 1,
      stickDeadzone: patch.stickDeadzone ?? current.input.stickDeadzone,
      stickSize: patch.stickSize ?? current.presentation.stickSize,
      stickOpacity: patch.stickOpacity ?? current.presentation.stickOpacity,
      screenShake: patch.screenShake ?? current.presentation.screenShake,
      reducedMotion: patch.reducedMotion ?? current.presentation.reducedMotion,
    });
    return this.state;
  }

  reset(): UISettingsState {
    this.state = this.build({});
    return this.state;
  }

  private build(patch: LiveSettingsPatch): UISettingsState {
    const input: InputSettings = Object.freeze({
      aimSensitivity: clamp(patch.aimSensitivity ?? DEFAULT_INPUT_SETTINGS.aimSensitivity, 0.6, 1.6),
      moveSensitivity: clamp(patch.moveSensitivity ?? DEFAULT_INPUT_SETTINGS.moveSensitivity ?? 1, 0.6, 1.6),
      stickDeadzone: clamp(patch.stickDeadzone ?? DEFAULT_INPUT_SETTINGS.stickDeadzone, 0, 0.95),
    });
    const presentation: PresentationSettings = Object.freeze({
      stickSize: clamp(patch.stickSize ?? DEFAULT_PRESENTATION.stickSize, 0.8, 1.3),
      stickOpacity: clamp(patch.stickOpacity ?? DEFAULT_PRESENTATION.stickOpacity, 0.3, 1),
      screenShake: clamp(patch.screenShake ?? DEFAULT_PRESENTATION.screenShake, 0, 1),
      reducedMotion: patch.reducedMotion ?? DEFAULT_PRESENTATION.reducedMotion,
    });
    return Object.freeze({ input, presentation });
  }
}
