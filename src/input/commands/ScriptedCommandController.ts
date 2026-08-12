import type { CommandController, CommandEnvelope, CommandSource, GameCommand } from './GameCommand';

export interface ScriptedCommandFrame {
  readonly commands: readonly GameCommand[];
}

/** Deterministic, DOM-free source for tests, replay, lobby simulation and future AI adapters. */
export class ScriptedCommandController implements CommandController {
  private frameIndex = 0;
  private sequence = 0;

  constructor(
    private readonly frames: readonly ScriptedCommandFrame[],
    private readonly source: Extract<CommandSource, 'test' | 'replay' | 'ai' | 'lobby'> = 'test',
  ) {}

  poll(): readonly CommandEnvelope[] {
    const frame = this.frames[this.frameIndex++];
    if (!frame) return [];
    return frame.commands.map((command) => ({
      source: this.source,
      sequence: this.sequence++,
      command,
    }));
  }

  reset(): void {
    this.frameIndex = 0;
    this.sequence = 0;
  }
}
