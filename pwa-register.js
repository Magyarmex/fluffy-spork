(() => {
  'use strict';

  function loadOwnerOperations() {
    if (window.__NOVA_OWNER_OPERATIONS_LOADER__) return;
    window.__NOVA_OWNER_OPERATIONS_LOADER__ = true;

    const script = document.createElement('script');
    script.src = './nova-updates/owner-operations-v1.11.1.js';
    script.async = false;
    script.dataset.novaOwnerOperations = '1.11.1';
    script.addEventListener('error', () => {
      window.__NOVA_OWNER_OPERATIONS_LOADER__ = false;
      console.warn('[NOVA Owner Operations] private HUD runtime could not be loaded');
    }, { once: true });
    document.head.appendChild(script);
  }

  loadOwnerOperations();

  if (!('serviceWorker' in navigator)) return;

  const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
  const MESSAGE_TIMEOUT_MS = 15000;
  let syncPromise = null;

  function postWithReply(worker, message) {
    return new Promise((resolve) => {
      if (!worker) return resolve({ ok: false, error: 'no-active-worker' });

      const channel = new MessageChannel();
      const timer = window.setTimeout(() => {
        channel.port1.close();
        resolve({ ok: false, error: 'worker-message-timeout' });
      }, MESSAGE_TIMEOUT_MS);

      channel.port1.onmessage = (event) => {
        window.clearTimeout(timer);
        channel.port1.close();
        resolve(event.data || { ok: false, error: 'empty-worker-response' });
      };

      worker.postMessage(message, [channel.port2]);
    });
  }

  async function syncLatest(registration) {
    if (syncPromise) return syncPromise;

    syncPromise = (async () => {
      try {
        // updateViaCache:none on registration plus this explicit check lets a
        // newer updater replace itself independently of game-content updates.
        await registration.update();
      } catch (_) {
        // Offline is an expected state for an installed NOVA client.
      }

      const ready = await navigator.serviceWorker.ready.catch(() => registration);
      const worker = ready.active || registration.active || registration.waiting || registration.installing;
      const result = await postWithReply(worker, { type: 'NOVA_SYNC_LATEST' });

      if (result && result.ok) {
        window.__NOVA_UPDATE_STATUS = result;
      }
      return result;
    })();

    try {
      return await syncPromise;
    } finally {
      syncPromise = null;
    }
  }

  async function registerPeriodicUpdate(registration) {
    if (!('periodicSync' in registration)) return;

    try {
      if ('permissions' in navigator && navigator.permissions.query) {
        const permission = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (permission.state !== 'granted') return;
      }

      await registration.periodicSync.register('nova-update', {
        minInterval: 6 * 60 * 60 * 1000,
      });
    } catch (_) {
      // Periodic Background Sync remains browser-controlled/opportunistic.
    }
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none',
      });

      await navigator.serviceWorker.ready;
      void syncLatest(registration);
      void registerPeriodicUpdate(registration);

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'NOVA_UPDATE_READY') return;
        window.__NOVA_UPDATE_READY = event.data;
        try {
          localStorage.setItem('nova:lastUpdateReadyAt', String(Date.now()));
          if (event.data.fingerprint) {
            localStorage.setItem('nova:lastUpdateFingerprint', event.data.fingerprint);
          }
        } catch (_) {}
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // A newer updater has taken control. Give activation a moment, then
        // immediately let that updater reconcile the latest game build.
        window.setTimeout(() => void syncLatest(registration), 250);
      });

      window.addEventListener('online', () => void syncLatest(registration));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void syncLatest(registration);
        }
      });

      window.setInterval(() => {
        if (navigator.onLine) void syncLatest(registration);
      }, UPDATE_INTERVAL_MS);
    } catch (error) {
      console.warn('[NOVA PWA] Offline runtime registration failed:', error);
    }
  });
})();
