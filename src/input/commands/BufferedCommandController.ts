import type { CommandController, CommandEnvelope, CommandSource, GameCommand } from './GameCommand';

export class BufferedCommandController implements CommandController {
  private readonly queue: CommandEnvelope[] = [];
  private sequence = 0;

  constructor(readonly source: CommandSource) {}

  issue(command: GameCommand): void {
    this.queue.push({ source: this.source, sequence: this.sequence++, command });
  }

  poll(): readonly CommandEnvelope[] {
    if (this.queue.length === 0) return [];
    return this.queue.splice(0, this.queue.length);
  }
}
