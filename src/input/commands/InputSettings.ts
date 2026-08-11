export interface InputSettings {
  readonly aimSensitivity: number;
  /** Optional for backward-compatible callers; defaults to 1 when omitted. */
  readonly moveSensitivity?: number;
  readonly stickDeadzone: number;
}

export const DEFAULT_INPUT_SETTINGS: InputSettings = Object.freeze({
  aimSensitivity: 1,
  moveSensitivity: 1,
  stickDeadzone: 0.12,
});

export type InputSettingsProvider = () => Readonly<InputSettings>;

export function applyDeadzone(value: number, deadzone: number): number {
  const abs = Math.abs(value);
  const dz = Math.max(0, Math.min(0.95, deadzone));
  if (abs <= dz) return 0;
  return Math.sign(value) * ((abs - dz) / (1 - dz));
}
