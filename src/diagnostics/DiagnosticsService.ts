import { DIAGNOSTICS_SCHEMA_VERSION, DIAGNOSTIC_SECTIONS } from './types';
import type { DiagnosticProvider, DiagnosticProviders, DiagnosticSection, DiagnosticSectionName, DiagnosticSnapshot } from './types';
import type { JsonValue } from '../persistence/schema';

function sanitize(value: unknown, seen = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined') return null;
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sanitize((value as Record<string, unknown>)[key], seen);
    }
    seen.delete(value);
    return out;
  }
  return String(value);
}

function section(provider: DiagnosticProvider | undefined): DiagnosticSection {
  if (!provider) return Object.freeze({ status: 'unavailable' });
  try {
    const value = sanitize(provider());
    return Object.freeze(value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, JsonValue>
      : { value });
  } catch (error) {
    return Object.freeze({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

/** Explicit-provider diagnostics; it never scrapes globals or owns gameplay state. */
export class DiagnosticsService {
  private readonly providers = new Map<DiagnosticSectionName, DiagnosticProvider>();

  constructor(providers: DiagnosticProviders = {}) {
    for (const name of DIAGNOSTIC_SECTIONS) {
      const provider = providers[name];
      if (provider) this.providers.set(name, provider);
    }
  }

  setProvider(name: DiagnosticSectionName, provider: DiagnosticProvider): void {
    this.providers.set(name, provider);
  }

  capture(capturedAt = new Date().toISOString()): DiagnosticSnapshot {
    const sections = {} as Record<DiagnosticSectionName, DiagnosticSection>;
    for (const name of DIAGNOSTIC_SECTIONS) sections[name] = section(this.providers.get(name));
    return Object.freeze({
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      capturedAt,
      sections: Object.freeze(sections),
    });
  }

  copy(snapshot = this.capture()): string {
    return stableStringify(snapshot);
  }
}

export function stableStringify(value: unknown): string {
  const normalized = sanitize(value);
  return JSON.stringify(normalized, null, 2);
}
