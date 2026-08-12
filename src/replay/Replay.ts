import type { CommandEnvelope } from '../input/commands/GameCommand';
import type { GameEvent } from '../game/simulation/types';

export type RuntimeKind = 'foundation';

export interface ReplayCommand {
  readonly tick: number;
  readonly actorId: string;
  readonly envelope: CommandEnvelope;
}

export interface ReplaySemanticEvent {
  readonly type: string;
  readonly tick: number;
  readonly elapsedMs: number;
  readonly payload: unknown;
}

export interface ReplayRecording {
  readonly schemaVersion: 1;
  readonly seed: number;
  readonly buildVersion: string;
  readonly runtimeVersion: string;
  readonly fixedStepMs: number;
  readonly commands: readonly ReplayCommand[];
  readonly semanticEvents: readonly ReplaySemanticEvent[];
}

export interface ReplayRuntime<TOutcome = unknown> {
  readonly kind: RuntimeKind;
  reset(recording: ReplayRecording): void;
  applyCommand(command: ReplayCommand): void;
  stepTo(tick: number): void;
  drainSemanticEvents(): readonly GameEvent[];
  outcome(): TOutcome;
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;
  const clone: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) clone[key] = cloneValue(entry);
  return clone as T;
}

function validateTick(tick: number): void {
  if (!Number.isInteger(tick) || tick < 0) throw new Error(`Replay tick must be a non-negative integer: ${tick}`);
}

export class ReplayRecorder {
  readonly #seed: number;
  readonly #buildVersion: string;
  readonly #runtimeVersion: string;
  readonly #fixedStepMs: number;
  readonly #commands: ReplayCommand[] = [];
  readonly #semanticEvents: ReplaySemanticEvent[] = [];

  constructor(options: { seed: number; buildVersion: string; runtimeVersion: string; fixedStepMs: number }) {
    if (!Number.isInteger(options.seed)) throw new Error('Replay seed must be an integer');
    if (!options.buildVersion.trim()) throw new Error('Replay buildVersion must be non-empty');
    if (!options.runtimeVersion.trim()) throw new Error('Replay runtimeVersion must be non-empty');
    if (!Number.isFinite(options.fixedStepMs) || options.fixedStepMs <= 0) throw new Error('Replay fixedStepMs must be positive');
    this.#seed = options.seed;
    this.#buildVersion = options.buildVersion;
    this.#runtimeVersion = options.runtimeVersion;
    this.#fixedStepMs = options.fixedStepMs;
  }

  recordCommand(command: ReplayCommand): void {
    validateTick(command.tick);
    if (!command.actorId.trim()) throw new Error('Replay command actorId must be non-empty');
    this.#commands.push(cloneValue(command));
  }

  recordSemanticEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      validateTick(event.tick);
      this.#semanticEvents.push(cloneValue(event));
    }
  }

  finish(): ReplayRecording {
    const commands = [...this.#commands].sort((a, b) => a.tick - b.tick || a.envelope.sequence - b.envelope.sequence || a.actorId.localeCompare(b.actorId));
    const semanticEvents = [...this.#semanticEvents].sort((a, b) => a.tick - b.tick || a.type.localeCompare(b.type));
    return Object.freeze({
      schemaVersion: 1 as const,
      seed: this.#seed,
      buildVersion: this.#buildVersion,
      runtimeVersion: this.#runtimeVersion,
      fixedStepMs: this.#fixedStepMs,
      commands: Object.freeze(commands.map((command) => Object.freeze(cloneValue(command)))),
      semanticEvents: Object.freeze(semanticEvents.map((event) => Object.freeze(cloneValue(event)))),
    });
  }
}

export interface ReplayResult<TOutcome = unknown> {
  readonly runtime: RuntimeKind;
  readonly outcome: TOutcome;
  readonly semanticEvents: readonly ReplaySemanticEvent[];
}

export class ReplayPlayer {
  play<TOutcome>(recording: ReplayRecording, runtime: ReplayRuntime<TOutcome>): ReplayResult<TOutcome> {
    if (recording.schemaVersion !== 1) throw new Error(`Unsupported replay schema: ${String((recording as { schemaVersion?: unknown }).schemaVersion)}`);
    runtime.reset(recording);
    let currentTick = 0;
    const emitted: ReplaySemanticEvent[] = [];

    for (const command of recording.commands) {
      validateTick(command.tick);
      if (command.tick < currentTick) throw new Error('Replay commands are not in deterministic tick order');
      runtime.stepTo(command.tick);
      currentTick = command.tick;
      for (const event of runtime.drainSemanticEvents()) emitted.push(cloneValue(event));
      runtime.applyCommand(cloneValue(command));
    }

    const lastRecordedEventTick = recording.semanticEvents.reduce((max, event) => Math.max(max, event.tick), currentTick);
    runtime.stepTo(lastRecordedEventTick);
    for (const event of runtime.drainSemanticEvents()) emitted.push(cloneValue(event));

    return {
      runtime: runtime.kind,
      outcome: cloneValue(runtime.outcome()),
      semanticEvents: emitted,
    };
  }
}
