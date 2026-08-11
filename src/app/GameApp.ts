declare global {
  interface Window {
    __bootModule?: (id: string) => void;
  }
}

export class GameApp {
  readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  start(): void {
    if (typeof window.__bootModule !== 'function') {
      throw new Error('Legacy NOVA boot bridge is unavailable. The materialized runtime did not register __bootModule.');
    }

    // Mission 03 owns application startup, but gameplay still intentionally
    // crosses this one explicit temporary seam. Mission 04 contains the rest
    // of the legacy access behind src/legacy/.
    window.__bootModule('main');
  }
}
