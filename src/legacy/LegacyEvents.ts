export interface LegacyEventMap {
  readonly [eventName: string]: unknown;
}

export type LegacyEventHandler<T = unknown> = (detail: T) => void;

/**
 * Narrow event adapter for canonical code that still needs to exchange signals
 * with legacy presentation/runtime code during migration. It deliberately does
 * not expose DOM globals or module-wrapper internals.
 */
export class LegacyEvents<Events extends LegacyEventMap = LegacyEventMap> {
  constructor(private readonly target: EventTarget = window) {}

  on<K extends keyof Events & string>(name: K, handler: LegacyEventHandler<Events[K]>): () => void {
    const listener = (event: Event) => handler((event as CustomEvent<Events[K]>).detail);
    this.target.addEventListener(name, listener);
    return () => this.target.removeEventListener(name, listener);
  }

  emit<K extends keyof Events & string>(name: K, detail: Events[K]): void {
    this.target.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
