import { BufferedCommandController } from '../commands/BufferedCommandController';
import { normalizeStick } from '../commands/GameCommand';

export interface KeyboardInputSample {
  readonly pressed: ReadonlySet<string>;
}

function axis(negative: boolean, positive: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

export class KeyboardInputAdapter extends BufferedCommandController {
  constructor() { super('keyboard'); }

  ingest(sample: KeyboardInputSample): void {
    const k = sample.pressed;
    this.issue({ type: 'move', vector: normalizeStick({
      x: axis(k.has('KeyA'), k.has('KeyD')),
      y: axis(k.has('KeyW'), k.has('KeyS')),
    }) });
    this.issue({ type: 'aim', vector: normalizeStick({
      x: axis(k.has('ArrowLeft'), k.has('ArrowRight')),
      y: axis(k.has('ArrowUp'), k.has('ArrowDown')),
    }) });
    this.issue({ type: 'fire', active: k.has('Space') });
    this.issue({ type: 'ability', slot: 0, active: k.has('KeyE') });
    this.issue({ type: 'ultimate', active: k.has('KeyQ') });
  }
}
