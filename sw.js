/* NOVA TANKS offline runtime.
 *
 * Design goals:
 * - Keep the last known-good game playable with no network.
 * - Discover the scripts referenced by the newest GitHub Pages index.
 * - Cache those dependencies before promoting that index to the offline copy.
 * - Revalidate assets in the background while the game is online.
 * - Never force a reload in the middle of a run.
 */

const CACHE_NAME = 'nova-tanks-offline-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './nova-icon.svg',
  './pwa-register.js',
  './nova-updates/releases.json',
];

let syncInFlight = null;

function absoluteURL(value) {
  return new URL(value, self.registration.scope).href;
}

function isCacheable(response) {
  return Boolean(response) && (response.ok || response.type === 'opaque');
}

async function fetchFresh(url) {
  const target = new URL(url, self.registration.scope);
  const options = { cache: 'no-store' };

  if (target.origin !== self.location.origin) {
    try {
      return await fetch(new Request(target.href, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      }));
    } catch (_) {
      return fetch(new Request(target.href, {
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
      }));
    }
  }

  return fetch(new Request(target.href, options));
}

async function cacheOne(cache, url) {
  const response = await fetchFresh(url);
  if (!isCacheable(response)) {
    throw new Error(`Uncacheable response for ${url}`);
  }
  await cache.put(absoluteURL(url), response.clone());
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

async function syncLatest() {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const cache = await caches.open(CACHE_NAME);
    const indexURL = absoluteURL('./');
    const indexResponse = await fetchFresh(indexURL);

    if (!indexResponse.ok) {
      throw new Error(`Latest NOVA index returned ${indexResponse.status}`);
    }

    const html = await indexResponse.clone().text();
    if (!html.includes('NOVA TANKS')) {
      throw new Error('Latest page did not identify itself as NOVA TANKS');
    }

    const { criticalScripts, optionalAssets } = discoverAssets(html, indexURL);

    // Critical scripts must all be cached before the new HTML becomes the
    // offline entry point. If any one fails, the previous known-good index
    // remains in place and the update can be retried later.
    for (const scriptURL of criticalScripts) {
      await cacheOne(cache, scriptURL);
    }

    await cacheBestEffort(cache, [
      './manifest.webmanifest',
      './nova-icon.svg',
      './pwa-register.js',
      './nova-updates/releases.json',
      ...optionalAssets,
    ]);

    await cache.put(indexURL, indexResponse.clone());
    await cache.put(absoluteURL('./index.html'), indexResponse.clone());
  })();

  try {
    await syncInFlight;
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

async function navigationResponse(request) {
  try {
    // Online navigation gets the freshest GitHub Pages version immediately.
    // It is intentionally not promoted to the offline copy here; syncLatest()
    // does that only after all referenced scripts have been staged safely.
    return await fetch(request);
  } catch (_) {
    return cachedOfflineIndex();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (isCacheable(response)) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Let the revalidation continue even after the cached response is returned.
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

    // A failed first sync should not prevent the worker from installing; the
    // currently open online page can retry immediately after activation.
    try {
      await syncLatest();
    } catch (_) {}

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('nova-tanks-offline-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();

    try {
      await syncLatest();
    } catch (_) {}
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'NOVA_SYNC_LATEST') return;
  event.waitUntil(syncLatest().catch(() => undefined));
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'nova-update') return;
  event.waitUntil(syncLatest().catch(() => undefined));
});
