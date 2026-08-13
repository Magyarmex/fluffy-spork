/* NOVA TANKS real-game recovery service worker v4.
 *
 * This worker exists to make the pre-NOVASTAR playable game fail closed:
 * - only shells with the real legacy module runtime + versioned nova-updates are promotable;
 * - Vite/Foundation shells are rejected even if they say "NOVA TANKS";
 * - all older NOVA caches are purged after a validated real build is staged;
 * - online navigations prefer a freshly validated network shell;
 * - offline fallback can only come from the last validated real-game cache.
 */

const UPDATER_VERSION = 4;
const META_CACHE = `nova-tanks-real-meta-v${UPDATER_VERSION}`;
const BUILD_PREFIX = `nova-tanks-real-build-v${UPDATER_VERSION}-`;
const ACTIVE_STATE_URL = new URL('./__nova_real_active__.json', self.registration.scope).href;
const CACHE_BUSTER = '__nova_real_recovery';
const NETWORK_TIMEOUT_MS = 10000;
const STAGE_CONCURRENCY = 6;

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
    url.searchParams.set(
      CACHE_BUSTER,
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
  }
  return url.href;
}

function isCacheable(response) {
  return Boolean(response) && (response.ok || response.type === 'opaque');
}

async function fetchFresh(value, timeoutMs = NETWORK_TIMEOUT_MS) {
  const canonical = new URL(value, self.registration.scope);
  const target = networkURL(canonical.href);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new Request(target, {
      cache: 'no-store',
      signal: controller.signal,
      credentials: canonical.origin === self.location.origin ? 'same-origin' : 'omit',
      headers: canonical.origin === self.location.origin ? {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      } : undefined,
    }));
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function assertRealGameHTML(html) {
  const required = ['NOVA TANKS', '__bootModule', 'nova-updates/'];
  const forbidden = ['/src/main.ts', '/src/main.tsx', '%BASE_URL%'];

  for (const marker of required) {
    if (!html.includes(marker)) {
      throw new Error(`Rejected non-canonical NOVA shell: missing ${marker}`);
    }
  }
  for (const marker of forbidden) {
    if (html.includes(marker)) {
      throw new Error(`Rejected Foundation/NOVASTAR shell: found ${marker}`);
    }
  }
}

async function validateShellResponse(response) {
  if (!response || !response.ok) {
    throw new Error('Real NOVA shell was not fetchable');
  }
  const html = await response.clone().text();
  assertRealGameHTML(html);
  return html;
}

function discoverCriticalAssets(html, baseURL) {
  const urls = new Set();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const url = new URL(match[1], baseURL);
    if (url.origin === self.location.origin) urls.add(url.href);
  }
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const relMatch = attrs.match(/\brel=["']([^"']+)["']/i);
    const rel = relMatch ? relMatch[1].toLowerCase() : '';
    const url = new URL(hrefMatch[1], baseURL);
    if (url.origin === self.location.origin && rel.split(/\s+/).includes('stylesheet')) {
      urls.add(url.href);
    }
  }
  return [...urls];
}

async function runPool(values, worker, concurrency = STAGE_CONCURRENCY) {
  let cursor = 0;
  const count = Math.min(concurrency, Math.max(1, values.length));
  const runners = Array.from({ length: count }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      await worker(values[index]);
    }
  });
  await Promise.all(runners);
}

async function fingerprint(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function readActiveState() {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(ACTIVE_STATE_URL);
  if (!response) return null;
  try {
    const state = await response.json();
    if (!state || typeof state.cacheName !== 'string') return null;
    return state;
  } catch (_) {
    return null;
  }
}

async function writeActiveState(state) {
  const cache = await caches.open(META_CACHE);
  await cache.put(
    ACTIVE_STATE_URL,
    new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

async function activeBuildCache() {
  const state = await readActiveState();
  if (!state) return { state: null, cache: null };
  const keys = await caches.keys();
  if (!keys.includes(state.cacheName)) return { state: null, cache: null };
  return { state, cache: await caches.open(state.cacheName) };
}

async function cacheRequired(cache, value) {
  const response = await fetchFresh(value);
  if (!isCacheable(response)) throw new Error(`Failed to stage ${value}`);
  await cache.put(canonicalURL(value), response.clone());
}

async function purgeNonCanonicalNovaCaches(activeState) {
  const keep = new Set([META_CACHE, activeState && activeState.cacheName].filter(Boolean));
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => (
        (key.startsWith('nova-tanks-') || key.startsWith('nova-tanks-real-')) &&
        !keep.has(key)
      ))
      .map((key) => caches.delete(key)),
  );
}

async function stageLatest({ force = false } = {}) {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const indexURL = absoluteURL('./');
    const indexResponse = await fetchFresh(indexURL);
    const html = await validateShellResponse(indexResponse);
    const buildFingerprint = await fingerprint(html);
    const current = await readActiveState();

    if (!force && current && current.fingerprint === buildFingerprint) {
      const cache = await caches.open(current.cacheName);
      const cached = await cache.match(indexURL);
      if (cached) {
        await validateShellResponse(cached);
        return { changed: false, fingerprint: buildFingerprint };
      }
    }

    const cacheName = `${BUILD_PREFIX}${buildFingerprint}-${Date.now().toString(36)}`;
    const stage = await caches.open(cacheName);

    try {
      const critical = discoverCriticalAssets(html, indexURL);
      await runPool(critical, (value) => cacheRequired(stage, value));
      await stage.put(indexURL, indexResponse.clone());
      await stage.put(absoluteURL('./index.html'), indexResponse.clone());

      const staged = await stage.match(indexURL);
      await validateShellResponse(staged);

      const nextState = {
        updaterVersion: UPDATER_VERSION,
        cacheName,
        fingerprint: buildFingerprint,
        promotedAt: Date.now(),
      };
      await writeActiveState(nextState);
      await purgeNonCanonicalNovaCaches(nextState);

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'NOVA_UPDATE_READY', fingerprint: buildFingerprint });
      }

      return { changed: true, fingerprint: buildFingerprint };
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

async function cachedRealShell() {
  const { cache } = await activeBuildCache();
  if (!cache) return null;
  const response =
    (await cache.match(absoluteURL('./'))) ||
    (await cache.match(absoluteURL('./index.html')));
  if (!response) return null;
  try {
    await validateShellResponse(response);
    return response;
  } catch (_) {
    return null;
  }
}

async function navigationResponse() {
  if (self.navigator.onLine) {
    try {
      await stageLatest();
      const fresh = await cachedRealShell();
      if (fresh) return fresh;
    } catch (_) {
      // Fail closed to the last validated real-game shell.
    }
  }

  const cached = await cachedRealShell();
  if (cached) return cached;

  return new Response(
    '<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#04060d;color:#bfe9ff;font-family:sans-serif;padding:24px">NOVA TANKS cannot verify a canonical real-game build. Connect to the network and reopen the game.</body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function assetResponse(request) {
  try {
    const response = await fetchFresh(request.url);
    if (isCacheable(response)) return response;
  } catch (_) {}

  const { cache } = await activeBuildCache();
  if (cache) {
    const cached = await cache.match(canonicalURL(request.url));
    if (cached) return cached;
  }
  return Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await stageLatest({ force: true });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const state = await readActiveState();
    await purgeNonCanonicalNovaCaches(state);
    await self.clients.claim();
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

  event.respondWith(assetResponse(request));
});

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'NOVA_SYNC_LATEST') {
    event.waitUntil((async () => {
      try {
        const result = await stageLatest();
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: true, ...result });
        }
      } catch (error) {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: false, error: String(error) });
        }
      }
    })());
    return;
  }

  if (event.data.type === 'NOVA_UPDATER_STATUS') {
    event.waitUntil((async () => {
      const state = await readActiveState();
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          ok: true,
          updaterVersion: UPDATER_VERSION,
          active: state,
        });
      }
    })());
  }
});
