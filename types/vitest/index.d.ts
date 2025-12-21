declare module 'vitest' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;
  export function expect<T = any>(value: T): {
    toBeCloseTo(expected: number, precision?: number): void;
    toBe(value: any): void;
    toBeLessThan(value: number): void;
    toBeGreaterThan(value: number): void;
    toBeLessThanOrEqual(value: number): void;
    toBeGreaterThanOrEqual(value: number): void;
  };
}
