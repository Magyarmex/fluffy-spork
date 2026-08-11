import { LegacyRuntime, type LegacyRequireFactory } from './LegacyRuntime';

export interface LegacyModuleView<T = unknown> {
  readonly id: string;
  readonly definition?: T;
  readonly cached?: unknown;
}

/** Stable inspection surface for migration missions that need legacy values. */
export class LegacyModules {
  constructor(private readonly runtime: LegacyRuntime) {}

  has(id: string): boolean {
    const snapshot = this.runtime.snapshot();
    return Object.prototype.hasOwnProperty.call(snapshot.modules, id);
  }

  inspect<T = unknown>(id: string): LegacyModuleView<T> {
    const snapshot = this.runtime.snapshot();
    return {
      id,
      definition: snapshot.modules[id] as T | undefined,
      cached: snapshot.cache[id],
    };
  }

  ids(): readonly string[] {
    return Object.keys(this.runtime.snapshot().modules);
  }

  requireFactory(): LegacyRequireFactory | undefined {
    return this.runtime.snapshot().makeRequire;
  }
}
