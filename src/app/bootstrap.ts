import { GameApp } from '@app/GameApp';
import { markBooting, markFailed, markRunning } from '@app/lifecycle';
import { resolveDevelopmentRuntime } from '@app/runtimeSelector';

declare global {
  interface Window {
    __NOVA_UPDATE_STATUS?: unknown;
    __NOVA_UPDATE_READY?: unknown;
  }
}

const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
const MESSAGE_TIMEOUT_MS = 15_000;
let syncPromise: Promise<unknown> | null = null;

function domReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
}

function ensureApplicationRoot(): HTMLElement {
  const existing = document.getElementById('root');
  if (existing) return existing;
  const root = document.createElement('div');
  root.id = 'root';
  document.body.prepend(root);
  return root;
}

function ensureManifestLink(): void {
  if (document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = './manifest.webmanifest';
  document.head.append(link);
}

function postWithReply(worker: ServiceWorker | null, message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    if (!worker) { resolve({ ok: false, error: 'no-active-worker' }); return; }
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      resolve({ ok: false, error: 'worker-message-timeout' });
    }, MESSAGE_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(event.data ?? { ok: false, error: 'empty-worker-response' });
    };
    worker.postMessage(message, [channel.port2]);
  });
}

async function syncLatest(registration: ServiceWorkerRegistration): Promise<unknown> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try { await registration.update(); } catch { /* offline clients remain usable */ }
    const ready = await navigator.serviceWorker.ready.catch(() => registration);
    const worker = ready.active ?? registration.active ?? registration.waiting ?? registration.installing;
    const result = await postWithReply(worker, { type: 'NOVA_SYNC_LATEST' });
    if (typeof result === 'object' && result !== null && 'ok' in result && result.ok) window.__NOVA_UPDATE_STATUS = result;
    return result;
  })();
  try { return await syncPromise; } finally { syncPromise = null; }
}

async function registerPeriodicUpdate(registration: ServiceWorkerRegistration): Promise<void> {
  const periodicRegistration = registration as ServiceWorkerRegistration & {
    periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> };
  };
  if (!periodicRegistration.periodicSync) return;
  try {
    const permissions = navigator.permissions as Permissions & {
      query(descriptor: PermissionDescriptor | { name: string }): Promise<PermissionStatus>;
    };
    if (permissions?.query) {
      const permission = await permissions.query({ name: 'periodic-background-sync' });
      if (permission.state !== 'granted') return;
    }
    await periodicRegistration.periodicSync.register('nova-update', { minInterval: 6 * 60 * 60 * 1000 });
  } catch { /* browser-controlled optional capability */ }
}

async function registerPwaRuntime(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    void syncLatest(registration);
    void registerPeriodicUpdate(registration);
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: string; fingerprint?: string } | null;
      if (!data || data.type !== 'NOVA_UPDATE_READY') return;
      window.__NOVA_UPDATE_READY = data;
      try {
        localStorage.setItem('nova:lastUpdateReadyAt', String(Date.now()));
        if (data.fingerprint) localStorage.setItem('nova:lastUpdateFingerprint', data.fingerprint);
      } catch { /* storage optional */ }
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => window.setTimeout(() => void syncLatest(registration), 250));
    window.addEventListener('online', () => void syncLatest(registration));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void syncLatest(registration);
    });
    window.setInterval(() => { if (navigator.onLine) void syncLatest(registration); }, UPDATE_INTERVAL_MS);
  } catch (error) {
    console.warn('[NOVA PWA] Offline runtime registration failed:', error);
  }
}

function renderStartupFailure(root: HTMLElement, error: unknown): void {
  root.replaceChildren();
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = 'box-sizing:border-box;max-width:42rem;margin:12vh auto;padding:1.25rem;font:600 16px/1.5 system-ui,sans-serif;color:#dff8ff;background:#0a1122;border:1px solid rgba(77,227,255,.35);border-radius:12px';
  panel.textContent = `NOVA failed to start: ${error instanceof Error ? error.message : String(error)}`;
  root.append(panel);
}

export async function bootstrapApplication(): Promise<void> {
  markBooting();
  await domReady();
  const root = ensureApplicationRoot();
  ensureManifestLink();
  try {
    const runtime = resolveDevelopmentRuntime(window.location.search, import.meta.env.DEV);
    if (runtime.selected === 'legacy') {
      if (!import.meta.env.DEV) throw new Error('Legacy runtime is development-only');
      const { LegacyRuntime } = await import('@legacy/LegacyRuntime');
      LegacyRuntime.fromWindow().boot('main');
      markRunning();
      void registerPwaRuntime();
      return;
    }
    const app = new GameApp(root);
    app.start();
    markRunning();
    void registerPwaRuntime();
  } catch (error) {
    markFailed(error);
    renderStartupFailure(root, error);
    throw error;
  }
}
