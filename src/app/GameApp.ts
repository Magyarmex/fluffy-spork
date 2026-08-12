import { FoundationRuntime } from './FoundationRuntime';

export class GameApp {
  readonly root: HTMLElement;
  readonly runtime: FoundationRuntime;

  constructor(root: HTMLElement, runtime?: FoundationRuntime) {
    this.root = root;
    this.runtime = runtime ?? new FoundationRuntime(root);
  }

  start(): void { this.runtime.start(); }
  stop(): void { this.runtime.stop(); }
}
