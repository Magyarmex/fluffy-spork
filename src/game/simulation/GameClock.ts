export interface ClockSnapshot {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly fixedStepMs: number;
}

export class GameClock {
  readonly fixedStepMs: number;
  #tick = 0;
  #elapsedMs = 0;

  constructor(fixedStepMs = 1000 / 60) {
    if (!Number.isFinite(fixedStepMs) || fixedStepMs <= 0) {
      throw new Error('fixedStepMs must be a finite positive number');
    }
    this.fixedStepMs = fixedStepMs;
  }

  get tick(): number {
    return this.#tick;
  }

  get elapsedMs(): number {
    return this.#elapsedMs;
  }

  advance(): ClockSnapshot {
    this.#tick += 1;
    this.#elapsedMs = this.#tick * this.fixedStepMs;
    return this.snapshot();
  }

  snapshot(): ClockSnapshot {
    return {
      tick: this.#tick,
      elapsedMs: this.#elapsedMs,
      fixedStepMs: this.fixedStepMs,
    };
  }

  restore(snapshot: ClockSnapshot): void {
    if (snapshot.fixedStepMs !== this.fixedStepMs) {
      throw new Error('Cannot restore a clock snapshot with a different fixed step');
    }
    if (!Number.isInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.elapsedMs < 0) {
      throw new Error('Invalid clock snapshot');
    }
    this.#tick = snapshot.tick;
    this.#elapsedMs = snapshot.elapsedMs;
  }

  reset(): void {
    this.#tick = 0;
    this.#elapsedMs = 0;
  }
}
