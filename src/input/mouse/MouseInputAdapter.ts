import { BufferedCommandController } from '../commands/BufferedCommandController';
import { normalizeStick } from '../commands/GameCommand';
import type { InputSettingsProvider } from '../commands/InputSettings';

export interface MouseInputSample {
  readonly move: { readonly x: number; readonly y: number };
  readonly aim: { readonly x: number; readonly y: number };
  readonly primaryDown: boolean;
  readonly secondaryDown?: boolean;
  readonly ultimateDown?: boolean;
}

export class MouseInputAdapter extends BufferedCommandController {
  constructor(private readonly settings: InputSettingsProvider) { super('mouse'); }

  ingest(sample: MouseInputSample): void {
    const sensitivity = Math.max(0, this.settings().aimSensitivity);
    this.issue({ type: 'move', vector: normalizeStick(sample.move) });
    this.issue({ type: 'aim', vector: normalizeStick({ x: sample.aim.x * sensitivity, y: sample.aim.y * sensitivity }) });
    this.issue({ type: 'fire', active: sample.primaryDown });
    this.issue({ type: 'ability', slot: 0, active: Boolean(sample.secondaryDown) });
    this.issue({ type: 'ultimate', active: Boolean(sample.ultimateDown) });
  }
}
