export type DebugLevel = 'info' | 'warn' | 'error';

export interface DebugEvent {
  id: string;
  level: DebugLevel;
  message: string;
  detail?: string;
  timestamp: number;
}

class DebugBus {
  private listeners: Array<(event: DebugEvent) => void> = [];

  subscribe(cb: (event: DebugEvent) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  emit(event: DebugEvent) {
    for (const l of this.listeners) l(event);
  }
}

export const debugBus = new DebugBus();

export function recordDebug(level: DebugLevel, message: string, detail?: string) {
  const event: DebugEvent = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    level,
    message,
    detail,
    timestamp: Date.now()
  };
  debugBus.emit(event);
}

export function attachGlobalErrorHooks() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    recordDebug('error', `Unhandled error: ${e.message}`, e.error?.stack ?? '');
  });
  window.addEventListener('unhandledrejection', (e) => {
    recordDebug('error', `Unhandled promise rejection`, String(e.reason ?? 'unknown'));
  });
}
