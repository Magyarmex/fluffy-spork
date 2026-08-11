export type LegacyModuleTable = Record<string, unknown>;
export type LegacyModuleCache = Record<string, unknown>;
export type LegacyRequireFactory = (...args: unknown[]) => unknown;

interface LegacyRuntimeWindow extends Window {
  __bootModule?: (id: string) => void;
  __novaModules?: LegacyModuleTable;
  __novaCache?: LegacyModuleCache;
  __novaMakeRequire?: LegacyRequireFactory;
}

export interface LegacyRuntimeSnapshot {
  readonly modules: Readonly<LegacyModuleTable>;
  readonly cache: Readonly<LegacyModuleCache>;
  readonly makeRequire?: LegacyRequireFactory;
}

/**
 * Mission 04 deletion target. This is the only canonical-source owner of the
 * materialized runtime globals. New code must depend on this API or a narrower
 * adapter in src/legacy, never on window.__nova* directly.
 */
export class LegacyRuntime {
  private readonly host: LegacyRuntimeWindow;

  constructor(host: Window = window) {
    this.host = host as LegacyRuntimeWindow;
  }

  static fromWindow(host: Window = window): LegacyRuntime {
    return new LegacyRuntime(host);
  }

  boot(moduleId = 'main'): void {
    const boot = this.host.__bootModule;
    if (typeof boot !== 'function') {
      throw new Error('Legacy NOVA boot bridge is unavailable. The materialized runtime did not register __bootModule.');
    }
    boot(moduleId);
  }

  snapshot(): LegacyRuntimeSnapshot {
    return {
      modules: this.host.__novaModules ?? {},
      cache: this.host.__novaCache ?? {},
      makeRequire: typeof this.host.__novaMakeRequire === 'function' ? this.host.__novaMakeRequire : undefined,
    };
  }
}
