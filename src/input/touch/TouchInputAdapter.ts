import { BufferedCommandController } from '../commands/BufferedCommandController';
import { normalizeStick } from '../commands/GameCommand';
import type { InputSettingsProvider } from '../commands/InputSettings';
import { applyDeadzone } from '../commands/InputSettings';

export interface TouchInputSample {
  readonly moveStick: { readonly x: number; readonly y: number };
  readonly aimStick: { readonly x: number; readonly y: number };
  readonly firing: boolean;
  readonly abilities?: Readonly<Record<number, boolean>>;
  readonly ultimate: boolean;
}

/** Pure twin-stick translator. DOM/touch ownership stays outside gameplay authority. */
export class TouchInputAdapter extends BufferedCommandController {
  constructor(private readonly settings: InputSettingsProvider) { super('touch'); }

  ingest(sample: TouchInputSample): void {
    const s = this.settings();
    const moveSensitivity = s.moveSensitivity ?? 1;
    const move = normalizeStick({
      x: applyDeadzone(sample.moveStick.x * moveSensitivity, s.stickDeadzone),
      y: applyDeadzone(sample.moveStick.y * moveSensitivity, s.stickDeadzone),
    });
    const aim = normalizeStick({
      x: applyDeadzone(sample.aimStick.x * s.aimSensitivity, s.stickDeadzone),
      y: applyDeadzone(sample.aimStick.y * s.aimSensitivity, s.stickDeadzone),
    });
    this.issue({ type: 'move', vector: move });
    this.issue({ type: 'aim', vector: aim });
    this.issue({ type: 'fire', active: sample.firing });
    for (const [slot, active] of Object.entries(sample.abilities ?? {})) {
      this.issue({ type: 'ability', slot: Number(slot), active });
    }
    // Ultimate is intentionally independent of either stick so another active touch cannot suppress it.
    this.issue({ type: 'ultimate', active: sample.ultimate });
  }
}
