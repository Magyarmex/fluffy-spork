import { LegacyRuntime } from '@legacy/LegacyRuntime';

export class GameApp {
  readonly root: HTMLElement;

  constructor(
    root: HTMLElement,
    private readonly legacyRuntime: LegacyRuntime = LegacyRuntime.fromWindow(),
  ) {
    this.root = root;
  }

  start(): void {
    // Gameplay is still intentionally legacy-owned at this stage, but the
    // application shell no longer understands its browser-global boot seam.
    this.legacyRuntime.boot('main');
  }
}
