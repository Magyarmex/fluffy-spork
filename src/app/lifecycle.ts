export type StartupPhase = 'idle' | 'booting' | 'running' | 'failed';

export interface StartupSnapshot {
  phase: StartupPhase;
  startedAt: number | null;
  readyAt: number | null;
  error: string | null;
}

declare global {
  interface Window {
    __NOVA_STARTUP_STATUS?: StartupSnapshot;
  }
}

const snapshot: StartupSnapshot = {
  phase: 'idle',
  startedAt: null,
  readyAt: null,
  error: null,
};

function publish(): void {
  window.__NOVA_STARTUP_STATUS = { ...snapshot };
  document.documentElement.dataset.novaStartup = snapshot.phase;
  window.dispatchEvent(new CustomEvent('nova:startup', { detail: { ...snapshot } }));
}

export function markBooting(): void {
  snapshot.phase = 'booting';
  snapshot.startedAt = performance.now();
  snapshot.readyAt = null;
  snapshot.error = null;
  publish();
}

export function markRunning(): void {
  snapshot.phase = 'running';
  snapshot.readyAt = performance.now();
  snapshot.error = null;
  publish();
}

export function markFailed(error: unknown): void {
  snapshot.phase = 'failed';
  snapshot.error = error instanceof Error ? error.message : String(error);
  publish();
}

export function getStartupSnapshot(): StartupSnapshot {
  return { ...snapshot };
}
