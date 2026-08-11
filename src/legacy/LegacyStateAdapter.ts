import { LegacyModules, type LegacyModuleView } from './LegacyModules';

/**
 * Typed read-only migration adapter for state still owned by legacy modules.
 * Mission 05+ may add explicit selectors here, but must not leak module-wrapper
 * mechanics into canonical game systems.
 */
export class LegacyStateAdapter {
  constructor(private readonly modules: LegacyModules) {}

  module<T = unknown>(id: string): LegacyModuleView<T> {
    return this.modules.inspect<T>(id);
  }

  moduleIds(): readonly string[] {
    return this.modules.ids();
  }

  hasModule(id: string): boolean {
    return this.modules.has(id);
  }
}
