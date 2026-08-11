export type EntityId = string & { readonly __entityId: unique symbol };

export function entityId(value: string): EntityId {
  const normalized = value.trim();
  if (!normalized) throw new Error('EntityId must be a non-empty string');
  return normalized as EntityId;
}

export type SimulationLifecycle = 'idle' | 'running' | 'paused' | 'stopped';

export interface GameEvent<TPayload = unknown> {
  readonly type: string;
  readonly tick: number;
  readonly elapsedMs: number;
  readonly payload: TPayload;
}

export interface GameState<TData extends Record<string, unknown> = Record<string, unknown>> {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly lifecycle: SimulationLifecycle;
  readonly data: Readonly<TData>;
}

export interface GameSnapshot<TData extends Record<string, unknown> = Record<string, unknown>> {
  readonly version: 1;
  readonly clock: {
    readonly tick: number;
    readonly elapsedMs: number;
    readonly fixedStepMs: number;
  };
  readonly lifecycle: SimulationLifecycle;
  readonly rngState: number;
  readonly data: TData;
  readonly events: readonly GameEvent[];
}
