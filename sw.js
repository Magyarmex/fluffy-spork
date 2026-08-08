/* NOVA TANKS offline runtime.
 *
 * Goals:
 * - Keep the last known-good build playable offline.
 * - Bypass browser/CDN staleness when checking GitHub Pages for a new build.
 * - Stage every critical script before promoting a new HTML shell.
 * - On an online app launch, resolve the newest staged build before rendering.
 * - Never replace the offline copy with a partially downloaded release.
 */

const CACHE_NAME = 'nova-tanks-offline-v2';
const CACHE_BUSTER = '__nova_update';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './nova-icon.svg',
  './pwa-register.js',
  './nova-updates/releases.json',
  './nova-updates/version-v1.7.4.json',
];

let syncInFlight = null;

function absoluteURL(value) {
  return new URL(value, self.registration.scope).href;
}

function canonicalURL(value) {
  const url = new URL(value, self.registration.scope);
  url.searchParams.delete(CACHE_BUSTER);
  return url.href;
}

function networkURL(value) {
  const url = new URL(value, self.registration.scope);
  if (url.origin === self.location.origin) {
    url.searchParams.set(CACHE_BUSTER, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }
  return url.href;
}

function isCacheable(response) {
  return Boolean(response) && (response.ok || response.type === 'opaque');
}

async function fetchFresh(value) {
  const canonical = new URL(value, self.registration.scope);
  const target = networkURL(canonical.href);

  if (canonical.origin !== self.location.origin) {
    try {
      return await fetch(new Request(target, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      }));
    } catch (_) {
      return fetch(new Request(target, {
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
      }));
    }
  }

  return fetch(new Request(target, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }));
}

async function cacheOne(cache, value) {
  const response = await fetchFresh(value);
  if (!isCacheable(response)) {
    throw new Error(`Uncacheable response for ${value}`);
  }
  await cache.put(canonicalURL(value), response.clone());
  return response;
}

async function cacheBestEffort(cache, urls) {
  await Promise.allSettled(urls.map((url) => cacheOne(cache, url)));
}

function discoverAssets(html, baseURL) {
  const criticalScripts = new Set();
  const optionalAssets = new Set();

  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    criticalScripts.add(new URL(match[1], baseURL).href);
  }

  for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const href = new URL(match[1], baseURL).href;
    if (/\.(?:css|svg|png|webp|ico)(?:[?#].*)?$/i.test(href) || href.includes('fonts.googleapis.com')) {
      optionalAssets.add(href);
    }
  }

  return {
    criticalScripts: [...criticalScripts],
    optionalAssets: [...optionalAssets],
  };
}

async function readCachedIndex(cache, indexURL) {
  const cached = await cache.match(indexURL);
  if (!cached) return null;
  try {
    return await cached.clone().text();
  } catch (_) {
    return null;
  }
}

async function notifyClients(payload) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage(payload);
}

async function syncLatest() {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const cache = await caches.open(CACHE_NAME);
    const indexURL = absoluteURL('./');
    const previousHTML = await readCachedIndex(cache, indexURL);
    const indexResponse = await fetchFresh(indexURL);

    if (!indexResponse.ok) {
      throw new Error(`Latest NOVA index returned ${indexResponse.status}`);
    }

    const html = await indexResponse.clone().text();
    if (!html.includes('NOVA TANKS')) {
      throw new Error('Latest page did not identify itself as NOVA TANKS');
    }

    const changed = previousHTML !== html;

    if (changed) {
      const { criticalScripts, optionalAssets } = discoverAssets(html, indexURL);

      // Promotion is atomic from the user's point of view: all critical scripts
      // must be locally available before this HTML becomes the offline entry.
      for (const scriptURL of criticalScripts) {
        await cacheOne(cache, scriptURL);
      }

      await cacheBestEffort(cache, [
        './manifest.webmanifest',
        './nova-icon.svg',
        './pwa-register.js',
        './nova-updates/releases.json',
        './nova-updates/version-v1.7.4.json',
        ...optionalAssets,
      ]);

      await cache.put(indexURL, indexResponse.clone());
      await cache.put(absoluteURL('./index.html'), indexResponse.clone());
      await notifyClients({ type: 'NOVA_UPDATE_READY' });
    } else {
      // Metadata may change independently of the HTML shell.
      await cacheBestEffort(cache, [
        './manifest.webmanifest',
        './nova-icon.svg',
        './pwa-register.js',
        './nova-updates/releases.json',
        './nova-updates/version-v1.7.4.json',
      ]);
    }

    return { changed };
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

async function cachedOfflineIndex() {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match(absoluteURL('./'))) ||
    (await cache.match(absoluteURL('./index.html'))) ||
    Response.error()
  );
}

async function navigationResponse() {
  try {
    // The update check happens before rendering an online app launch. This is
    // what makes an installed NOVA icon behave like an auto-updating app rather
    // than a stale shortcut to a cached web page.
    await syncLatest();
    const latest = await cachedOfflineIndex();
    if (latest && latest.ok) return latest;
  } catch (_) {
    // Offline or transient network failure: use the last fully staged build.
  }

  return cachedOfflineIndex();
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = canonicalURL(request.url);
  const cached = await cache.match(key);

  const network = fetchFresh(request.url)
    .then(async (response) => {
      if (isCacheable(response)) {
        await cache.put(key, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    void network;
    return cached;
  }

  const response = await network;
  return response || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cacheBestEffort(cache, APP_SHELL);

    try {
      await syncLatest();
    } catch (_) {}

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();

    // Keep v1 around until v2 has had a chance to stage a valid build. Once
    // sync succeeds, the old cache can be safely removed.
    try {
      await syncLatest();
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('nova-tanks-offline-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    } catch (_) {}
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse());
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'NOVA_SYNC_LATEST') return;

  event.waitUntil((async () => {
    try {
      const result = await syncLatest();
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ ok: true, changed: result.changed });
      }
    } catch (error) {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ ok: false, error: String(error) });
      }
    }
  })());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'nova-update') return;
  event.waitUntil(syncLatest().catch(() => undefined));
});
