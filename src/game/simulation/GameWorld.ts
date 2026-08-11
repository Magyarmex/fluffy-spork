import { GameClock } from './GameClock';
import { SeededRandom } from './SeededRandom';
import type { GameEvent, GameSnapshot, GameState, SimulationLifecycle } from './types';

export interface SimulationStepContext<TData extends Record<string, unknown>> {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly deltaMs: number;
  readonly data: TData;
  readonly random: SeededRandom;
  emit<TPayload>(type: string, payload: TPayload): void;
}

export type SimulationSystem<TData extends Record<string, unknown>> = (
  context: SimulationStepContext<TData>,
) => void;

export interface GameWorldOptions<TData extends Record<string, unknown>> {
  readonly initialData: TData;
  readonly fixedStepMs?: number;
  readonly seed?: number;
  readonly systems?: readonly SimulationSystem<TData>[];
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;

  const clone: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    clone[key] = cloneValue(entry);
  }
  return clone as T;
}

export class GameWorld<TData extends Record<string, unknown> = Record<string, unknown>> {
  readonly clock: GameClock;
  readonly random: SeededRandom;

  #lifecycle: SimulationLifecycle = 'idle';
  #data: TData;
  #events: GameEvent[] = [];
  #systems: SimulationSystem<TData>[];

  constructor(options: GameWorldOptions<TData>) {
    this.clock = new GameClock(options.fixedStepMs);
    this.random = new SeededRandom(options.seed);
    this.#data = cloneValue(options.initialData);
    this.#systems = [...(options.systems ?? [])];
  }

  get lifecycle(): SimulationLifecycle {
    return this.#lifecycle;
  }

  start(): void {
    if (this.#lifecycle === 'stopped') throw new Error('A stopped GameWorld cannot be restarted');
    if (this.#lifecycle === 'running') return;
    this.#lifecycle = 'running';
  }

  pause(): void {
    if (this.#lifecycle !== 'running') return;
    this.#lifecycle = 'paused';
  }

  resume(): void {
    if (this.#lifecycle !== 'paused') throw new Error('Only a paused GameWorld can resume');
    this.#lifecycle = 'running';
  }

  stop(): void {
    this.#lifecycle = 'stopped';
  }

  addSystem(system: SimulationSystem<TData>): () => void {
    if (this.#lifecycle === 'stopped') throw new Error('Cannot add systems to a stopped GameWorld');
    this.#systems.push(system);
    return () => {
      const index = this.#systems.indexOf(system);
      if (index >= 0) this.#systems.splice(index, 1);
    };
  }

  step(steps = 1): GameState<TData> {
    if (this.#lifecycle !== 'running') {
      throw new Error('GameWorld must be running before it can step');
    }
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error('steps must be a non-negative integer');
    }

    for (let index = 0; index < steps; index += 1) {
      const nextClock = this.clock.advance();
      const emit = <TPayload>(type: string, payload: TPayload): void => {
        if (!type.trim()) throw new Error('GameEvent type must be non-empty');
        this.#events.push({
          type,
          tick: nextClock.tick,
          elapsedMs: nextClock.elapsedMs,
          payload: cloneValue(payload),
        });
      };

      const context: SimulationStepContext<TData> = {
        tick: nextClock.tick,
        elapsedMs: nextClock.elapsedMs,
        deltaMs: this.clock.fixedStepMs,
        data: this.#data,
        random: this.random,
        emit,
      };

      for (const system of this.#systems) system(context);
    }

    return this.inspect();
  }

  inspect(): GameState<TData> {
    return {
      tick: this.clock.tick,
      elapsedMs: this.clock.elapsedMs,
      lifecycle: this.#lifecycle,
      data: cloneValue(this.#data),
    };
  }

  drainEvents(): readonly GameEvent[] {
    const events = this.#events.map((event) => cloneValue(event));
    this.#events = [];
    return events;
  }

  snapshot(): GameSnapshot<TData> {
    return {
      version: 1,
      clock: this.clock.snapshot(),
      lifecycle: this.#lifecycle,
      rngState: this.random.getState(),
      data: cloneValue(this.#data),
      events: this.#events.map((event) => cloneValue(event)),
    };
  }

  restore(snapshot: GameSnapshot<TData>): void {
    if (this.#lifecycle === 'running') throw new Error('Pause the GameWorld before restoring a snapshot');
    if (snapshot.version !== 1) throw new Error(`Unsupported GameSnapshot version: ${snapshot.version}`);
    this.clock.restore(snapshot.clock);
    this.random.setState(snapshot.rngState);
    this.#data = cloneValue(snapshot.data);
    this.#events = snapshot.events.map((event) => cloneValue(event));
    this.#lifecycle = snapshot.lifecycle;
  }
}
