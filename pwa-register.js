(() => {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  const UPDATE_INTERVAL_MS = 15 * 60 * 1000;

  async function askForLatest(registration) {
    try {
      await registration.update();
    } catch (_) {
      // Being offline is normal for an installed NOVA TANKS client.
    }

    const worker = registration.active || registration.waiting || registration.installing;
    if (worker) worker.postMessage({ type: 'NOVA_SYNC_LATEST' });
  }

  async function registerPeriodicUpdate(registration) {
    if (!('periodicSync' in registration)) return;

    try {
      if ('permissions' in navigator && navigator.permissions.query) {
        const permission = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (permission.state !== 'granted') return;
      }

      await registration.periodicSync.register('nova-update', {
        minInterval: 12 * 60 * 60 * 1000,
      });
    } catch (_) {
      // Periodic Background Sync is opportunistic and browser-controlled.
    }
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none',
      });

      await navigator.serviceWorker.ready;
      askForLatest(registration);
      registerPeriodicUpdate(registration);

      window.addEventListener('online', () => askForLatest(registration));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          askForLatest(registration);
        }
      });

      window.setInterval(() => {
        if (navigator.onLine) askForLatest(registration);
      }, UPDATE_INTERVAL_MS);
    } catch (error) {
      console.warn('[NOVA PWA] Offline runtime registration failed:', error);
    }
  });
})();
