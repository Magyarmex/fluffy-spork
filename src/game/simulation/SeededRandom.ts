const UINT32_RANGE = 0x1_0000_0000;

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) throw new Error('Seed must be finite');
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export class SeededRandom {
  #state: number;

  constructor(seed = 0x4e4f5641) {
    this.#state = normalizeSeed(seed);
  }

  nextUint32(): number {
    let x = this.#state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.#state = x >>> 0;
    return this.#state;
  }

  next(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  range(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new Error('range requires finite bounds with max >= min');
    }
    return min + (max - min) * this.next();
  }

  integer(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive) || maxExclusive <= minInclusive) {
      throw new Error('integer requires integer bounds with maxExclusive > minInclusive');
    }
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }

  getState(): number {
    return this.#state;
  }

  setState(state: number): void {
    this.#state = normalizeSeed(state);
  }

  clone(): SeededRandom {
    const copy = new SeededRandom(this.#state);
    copy.#state = this.#state;
    return copy;
  }
}
