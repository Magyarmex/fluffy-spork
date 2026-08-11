export interface Identified { readonly id: string }

export class ContentRegistry<T extends Identified> {
  readonly #items: ReadonlyMap<string, T>;
  readonly #values: readonly T[];

  constructor(values: readonly T[]) {
    const map = new Map<string, T>();
    for (const value of values) {
      if (map.has(value.id)) throw new Error(`Duplicate content id: ${value.id}`);
      map.set(value.id, value);
    }
    this.#items = map;
    this.#values = Object.freeze([...values]);
  }

  get(id: string): T {
    const value = this.#items.get(id);
    if (!value) throw new Error(`Unknown content id: ${id}`);
    return value;
  }

  find(id: string): T | undefined { return this.#items.get(id); }
  has(id: string): boolean { return this.#items.has(id); }
  all(): readonly T[] { return this.#values; }
  get size(): number { return this.#values.length; }
}
