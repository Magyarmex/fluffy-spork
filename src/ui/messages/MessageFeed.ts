import type { ContactMessage } from '../types';

interface Rule { readonly key: string; readonly canonical: string; readonly cooldownMs: number; }

const RULES: Readonly<Record<string, Rule>> = Object.freeze({
  CONTACT: { key: 'friendly-contact', canonical: 'CONTACT RELAY', cooldownMs: 1400 },
  'CONTACT RELAY': { key: 'friendly-contact', canonical: 'CONTACT RELAY', cooldownMs: 1400 },
  SPOTTED: { key: 'hostile-contact', canonical: 'SPOTTED · RELAY', cooldownMs: 1900 },
  'SPOTTED · RELAY': { key: 'hostile-contact', canonical: 'SPOTTED · RELAY', cooldownMs: 1900 },
  'OBSERVER DOWN · LOCAL SIGHT ONLY': { key: 'observer-down', canonical: 'OBSERVER DOWN · LOCAL SIGHT ONLY', cooldownMs: 1200 },
  'OBSERVER LINK RESTORED': { key: 'observer-restored', canonical: 'OBSERVER LINK RESTORED', cooldownMs: 1200 },
});

export interface MessageDecision { readonly allow: boolean; readonly key: string; readonly text: string; }

/** Presentation-only de-duplication. Sensing, relay state, and audio remain upstream. */
export class MessageFeed {
  private readonly lastByKey = new Map<string, number>();
  private items: ContactMessage[] = [];
  private sequence = 0;

  decide(text: string, nowMs: number): MessageDecision {
    const rule = RULES[text];
    if (!rule) return { allow: true, key: `text:${text}`, text };
    const last = this.lastByKey.get(rule.key);
    if (last !== undefined && nowMs - last < rule.cooldownMs) {
      return { allow: false, key: rule.key, text: rule.canonical };
    }
    this.lastByKey.set(rule.key, nowMs);
    return { allow: true, key: rule.key, text: rule.canonical };
  }

  push(text: string, nowMs: number): ContactMessage | undefined {
    const decision = this.decide(text, nowMs);
    if (!decision.allow) return undefined;
    const message: ContactMessage = Object.freeze({
      id: ++this.sequence,
      key: decision.key,
      text: decision.text,
      createdAtMs: nowMs,
    });
    this.items = [...this.items, message].slice(-8);
    return message;
  }

  snapshot(): readonly ContactMessage[] { return this.items; }
  clear(): void { this.items = []; }
}
