export interface LobbyPerformancePolicyConfig {
  readonly simulationHz?: number;
  readonly renderHz?: number;
  readonly aiThinkIntervalTicks?: number;
  readonly offscreenThinkMultiplier?: number;
  readonly maxVisibleEffects?: number;
  readonly maxVisibleProjectiles?: number;
  readonly cameraPanUnitsPerSecond?: number;
  readonly reducedMotion?: boolean;
  readonly lowPower?: boolean;
}

/**
 * Scheduling and presentation policy for the menu battlefield.
 *
 * This policy may decide *when* canonical systems are asked to work and how
 * much presentation is retained. It deliberately owns no combat, movement,
 * targeting, health, allegiance, weapon, or drone tuning values.
 */
export class LobbyPerformancePolicy {
  readonly simulationHz: number;
  readonly renderHz: number;
  readonly aiThinkIntervalTicks: number;
  readonly offscreenThinkMultiplier: number;
  readonly maxVisibleEffects: number;
  readonly maxVisibleProjectiles: number;
  readonly cameraPanUnitsPerSecond: number;
  readonly reducedMotion: boolean;
  readonly lowPower: boolean;

  constructor(config: LobbyPerformancePolicyConfig = {}) {
    this.lowPower = config.lowPower ?? false;
    this.reducedMotion = config.reducedMotion ?? false;
    this.simulationHz = config.simulationHz ?? 20;
    this.renderHz = config.renderHz ?? (this.lowPower ? 20 : 30);
    this.aiThinkIntervalTicks = config.aiThinkIntervalTicks ?? (this.lowPower ? 6 : 4);
    this.offscreenThinkMultiplier = config.offscreenThinkMultiplier ?? 2;
    this.maxVisibleEffects = config.maxVisibleEffects ?? (this.lowPower ? 18 : 38);
    this.maxVisibleProjectiles = config.maxVisibleProjectiles ?? (this.lowPower ? 70 : 110);
    this.cameraPanUnitsPerSecond = config.cameraPanUnitsPerSecond ?? 13;

    for (const [name, value] of Object.entries({
      simulationHz: this.simulationHz,
      renderHz: this.renderHz,
      aiThinkIntervalTicks: this.aiThinkIntervalTicks,
      offscreenThinkMultiplier: this.offscreenThinkMultiplier,
      maxVisibleEffects: this.maxVisibleEffects,
      maxVisibleProjectiles: this.maxVisibleProjectiles,
      cameraPanUnitsPerSecond: this.cameraPanUnitsPerSecond,
    })) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Lobby performance ${name} must be positive`);
    }
  }

  get fixedStepMs(): number { return 1000 / this.simulationHz; }
  get cameraVelocity(): number { return this.reducedMotion ? 0 : this.cameraPanUnitsPerSecond; }

  shouldThink(tick: number, actorOrdinal: number, onScreen = true): boolean {
    const stride = this.aiThinkIntervalTicks * (onScreen ? 1 : this.offscreenThinkMultiplier);
    const phase = Math.abs(Math.trunc(actorOrdinal)) % stride;
    return Math.max(0, Math.trunc(tick)) % stride === phase;
  }

  shouldRender(elapsedMs: number, previousRenderMs: number): boolean {
    return elapsedMs - previousRenderMs + 1e-9 >= 1000 / this.renderHz;
  }

  capProjectiles<T>(values: readonly T[]): readonly T[] {
    return Object.freeze(values.slice(Math.max(0, values.length - this.maxVisibleProjectiles)));
  }

  capEffects<T>(values: readonly T[]): readonly T[] {
    return Object.freeze(values.slice(Math.max(0, values.length - this.maxVisibleEffects)));
  }
}

export const DEFAULT_LOBBY_PERFORMANCE_POLICY = Object.freeze(new LobbyPerformancePolicy());
