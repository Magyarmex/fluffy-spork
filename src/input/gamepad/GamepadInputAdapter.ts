import { BufferedCommandController } from '../commands/BufferedCommandController';
import { normalizeStick } from '../commands/GameCommand';
import { applyDeadzone } from '../commands/InputSettings';
import type { InputSettingsProvider } from '../commands/InputSettings';

export interface GamepadInputSample {
  readonly leftStick: { readonly x: number; readonly y: number };
  readonly rightStick: { readonly x: number; readonly y: number };
  readonly fire: boolean;
  readonly ability: boolean;
  readonly ultimate: boolean;
}

export class GamepadInputAdapter extends BufferedCommandController {
  constructor(private readonly settings: InputSettingsProvider) { super('gamepad'); }

  ingest(sample: GamepadInputSample): void {
    const s = this.settings();
    this.issue({ type: 'move', vector: normalizeStick({
      x: applyDeadzone(sample.leftStick.x, s.stickDeadzone),
      y: applyDeadzone(sample.leftStick.y, s.stickDeadzone),
    }) });
    this.issue({ type: 'aim', vector: normalizeStick({
      x: applyDeadzone(sample.rightStick.x * s.aimSensitivity, s.stickDeadzone),
      y: applyDeadzone(sample.rightStick.y * s.aimSensitivity, s.stickDeadzone),
    }) });
    this.issue({ type: 'fire', active: sample.fire });
    this.issue({ type: 'ability', slot: 0, active: sample.ability });
    this.issue({ type: 'ultimate', active: sample.ultimate });
  }
}
