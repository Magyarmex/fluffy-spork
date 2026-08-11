import { MessageFeed } from '../messages/MessageFeed';
import { LiveSettings } from '../settings/LiveSettings';
import { selectContacts, selectEvolution, selectHUD } from '../selectors';
import type { AuthoritativeUIFrame, UIReadModel, UIScreen } from '../types';

export type UIListener = () => void;

/**
 * Read-model store for presentation. It accepts snapshots/projections only and exposes
 * no mutation path into simulation, entities, combat, targeting, or progression.
 */
export class UIStore {
  private readonly listeners = new Set<UIListener>();
  readonly settings: LiveSettings;
  readonly messages = new MessageFeed();
  private authoritative?: AuthoritativeUIFrame;
  private screen: UIScreen = 'lobby';
  private model: UIReadModel;

  constructor(settings = new LiveSettings()) {
    this.settings = settings;
    this.model = this.buildEmpty();
  }

  subscribe = (listener: UIListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): UIReadModel => this.model;

  publish(frame: AuthoritativeUIFrame): UIReadModel {
    this.authoritative = frame;
    this.rebuild();
    return this.model;
  }

  setScreen(screen: UIScreen): void {
    if (this.screen === screen) return;
    this.screen = screen;
    this.rebuild();
  }

  publishMessage(text: string, nowMs: number): boolean {
    if (!this.messages.push(text, nowMs)) return false;
    this.rebuild();
    return true;
  }

  refreshSettings(): void { this.rebuild(); }

  private rebuild(): void {
    const frame = this.authoritative;
    this.model = frame ? Object.freeze({
      screen: this.screen,
      hud: selectHUD(frame),
      evolution: selectEvolution(frame),
      contacts: selectContacts(frame),
      messages: Object.freeze([...this.messages.snapshot()]),
      settings: this.settings.snapshot(),
      tip: frame.tip,
      debug: Object.freeze({ ...(frame.debug ?? {}) }),
    }) : this.buildEmpty();
    for (const listener of this.listeners) listener();
  }

  private buildEmpty(): UIReadModel {
    return Object.freeze({
      screen: this.screen,
      hud: Object.freeze({ tick: 0, hostileContacts: 0, friendlyContacts: 0 }),
      contacts: Object.freeze([]),
      messages: Object.freeze([...this.messages.snapshot()]),
      settings: this.settings.snapshot(),
      debug: Object.freeze({}),
    });
  }
}
