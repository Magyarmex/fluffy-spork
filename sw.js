/* NOVA TANKS offline runtime v4.
 *
 * The updater treats every published game build as immutable:
 * 1. Fetch a cache-busted GitHub Pages shell.
 * 2. Discover and fully stage every critical dependency into a fresh cache.
 * 3. Validate the staged build.
 * 4. Atomically switch a tiny metadata pointer to the new cache.
 * 5. Keep the previous complete build as a rollback reserve.
 *
 * A failed/partial download never mutates the currently active offline build.
 */

const UPDATER_VERSION = 4;
const META_CACHE = `nova-tanks-meta-v${UPDATER_VERSION}`;
const RUNTIME_CACHE = `nova-tanks-runtime-v${UPDATER_VERSION}`;
const BUILD_PREFIX = `nova-tanks-build-v${UPDATER_VERSION}-`;
const LEGACY_PREFIX = 'nova-tanks-offline-';
const ACTIVE_STATE_URL = new URL('./__nova_active_build__.json', self.registration.scope).href;
const CACHE_BUSTER = '__nova_update';
const NETWORK_TIMEOUT_MS = 10000;
const LAUNCH_UPDATE_BUDGET_MS = 3500;
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

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const base = {
      cache: 'no-store',
      signal: controller.signal,
    };

    if (canonical.origin !== self.location.origin) {
      try {
        return await fetch(new Request(target, {
          ...base,
          mode: 'cors',
          credentials: 'omit',
        }));
      } catch (error) {
        if (controller.signal.aborted) throw error;
        return fetch(new Request(target, {
          ...base,
          mode: 'no-cors',
          credentials: 'omit',
        }));
      }
    }

    return await fetch(new Request(target, {
      ...base,
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }));
  } finally {
    clearTimeout(timer);
  }
}

async function ensureNonEmpty(response, label) {
  if (!isCacheable(response)) {
    throw new Error(`Uncacheable response for ${label}`);
  }
  if (response.type === 'opaque') return;
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new Error(`Empty response for ${label}`);
  }
}

async function fingerprint(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function discoverAssets(html, baseURL) {
  const critical = new Set();
  const optional = new Set();

  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    critical.add(new URL(match[1], baseURL).href);
  }

  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const href = new URL(hrefMatch[1], baseURL).href;
    const relMatch = attrs.match(/\brel=["']([^"']+)["']/i);
    const rel = relMatch ? relMatch[1].toLowerCase() : '';

    if (rel.split(/\s+/).includes('stylesheet') && !href.includes('fonts.googleapis.com')) {
      critical.add(href);
    } else if (
      /\.(?:css|svg|png|webp|ico|woff2?)(?:[?#].*)?$/i.test(href) ||
      href.includes('fonts.googleapis.com')
    ) {
      optional.add(href);
    }
  }

  return {
    critical: [...critical],
    optional: [...optional],
  };
}

function isCanonicalShell(html) {
  return html.includes('NOVA TANKS') &&
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']*assets\//i.test(html);
}

async function cacheRequired(cache, value) {
  const response = await fetchFresh(value);
  await ensureNonEmpty(response, value);
  await cache.put(canonicalURL(value), response.clone());
}

async function cacheOptional(cache, value) {
  try {
    const response = await fetchFresh(value);
    if (isCacheable(response)) {
      await cache.put(canonicalURL(value), response.clone());
    }
  } catch (_) {
    // Optional presentation resources must never block an otherwise valid build.
  }
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

async function validateStagedBuild(cache, html, baseURL) {
  const { critical } = discoverAssets(html, baseURL);
  const required = [baseURL, absoluteURL('./index.html'), ...critical];
  for (const value of required) {
    const response = await cache.match(canonicalURL(value));
    if (!response || !isCacheable(response)) {
      throw new Error(`Staged NOVA build is missing ${value}`);
    }
  }
}

async function notifyClients(payload) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage(payload);
}

async function cleanupCaches(activeState) {
  const keep = new Set([
    activeState && activeState.cacheName,
    activeState && activeState.previousCacheName,
  ].filter(Boolean));

  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(BUILD_PREFIX) && !keep.has(key))
      .map((key) => caches.delete(key)),
  );
}

async function cleanupLegacyCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => {
        if (key.startsWith(LEGACY_PREFIX)) return true;
        if (/^nova-tanks-meta-v\d+$/.test(key)) return key !== META_CACHE;
        if (/^nova-tanks-runtime-v\d+$/.test(key)) return key !== RUNTIME_CACHE;
        return false;
      })
      .map((key) => caches.delete(key)),
  );
}

async function stageLatest({ force = false } = {}) {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const indexURL = absoluteURL('./');
    const indexResponse = await fetchFresh(indexURL);
    await ensureNonEmpty(indexResponse, 'NOVA index');

    const html = await indexResponse.clone().text();
    if (!isCanonicalShell(html)) {
      throw new Error('Latest page failed NOVA canonical-shell validation');
    }

    const buildFingerprint = await fingerprint(html);
    const current = await readActiveState();

    if (!force && current && current.fingerprint === buildFingerprint) {
      const currentCache = await caches.open(current.cacheName);
      try {
        await validateStagedBuild(currentCache, html, indexURL);
        return { changed: false, fingerprint: buildFingerprint };
      } catch (_) {
        // A matching-but-incomplete cache is corruption, not a valid no-op.
        // Restage it below instead of trusting the fingerprint alone.
      }
    }

    const cacheName = `${BUILD_PREFIX}${buildFingerprint}-${Date.now().toString(36)}`;
    const stage = await caches.open(cacheName);

    try {
      const { critical, optional } = discoverAssets(html, indexURL);

      // Critical dependencies are fully downloaded before HTML is promotable.
      await runPool(critical, (value) => cacheRequired(stage, value));

      // These resources improve installability/presentation but are not allowed
      // to invalidate a playable build if a font/icon endpoint is unavailable.
      await runPool([
        './manifest.webmanifest',
        './nova-icon.svg',
        ...optional,
      ], (value) => cacheOptional(stage, value));

      // HTML is written only after every critical dependency is local.
      await stage.put(indexURL, indexResponse.clone());
      await stage.put(absoluteURL('./index.html'), indexResponse.clone());

      await validateStagedBuild(stage, html, indexURL);

      // This metadata write is the atomic promotion point. Until it succeeds,
      // all navigations continue using the previous complete build cache.
      const nextState = {
        updaterVersion: UPDATER_VERSION,
        cacheName,
        fingerprint: buildFingerprint,
        previousCacheName: current && current.cacheName !== cacheName ? current.cacheName : current && current.previousCacheName,
        promotedAt: Date.now(),
      };
      await writeActiveState(nextState);

      // Only current-version candidate caches are pruned here. Caches owned by
      // the currently active older worker survive until this worker has claimed
      // clients, preventing migration from pulling the floor out mid-load.
      await cleanupCaches(nextState);
      await notifyClients({
        type: 'NOVA_UPDATE_READY',
        fingerprint: buildFingerprint,
      });

      return { changed: true, fingerprint: buildFingerprint };
    } catch (error) {
      // A partially populated candidate is never eligible for serving.
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

async function activeIndex() {
  const { cache } = await activeBuildCache();
  if (cache) {
    const response =
      (await cache.match(absoluteURL('./'))) ||
      (await cache.match(absoluteURL('./index.html')));
    if (response) return response;
  }

  // Migration fallback: an older worker may still own a complete shell while
  // this worker is installing. Never strand an existing user during cutover.
  const keys = await caches.keys();
  const legacy = keys
    .filter((key) => key.startsWith(LEGACY_PREFIX))
    .sort()
    .reverse();
  for (const key of legacy) {
    const cache = await caches.open(key);
    const response =
      (await cache.match(absoluteURL('./'))) ||
      (await cache.match(absoluteURL('./index.html')));
    if (response) return response;
  }

  return null;
}

async function navigationResponse(stagePromise) {
  if (stagePromise) {
    // Fast networks can update before launch; slow/unreliable networks never
    // hold the game hostage. Staging continues under event.waitUntil().
    await Promise.race([
      stagePromise.catch(() => undefined),
      timeout(LAUNCH_UPDATE_BUDGET_MS),
    ]);
  }

  const cached = await activeIndex();
  if (cached) return cached;

  // First-ever uncontrolled bootstrap fallback.
  try {
    return await fetchFresh('./');
  } catch (_) {
    return new Response(
      '<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#04060d;color:#bfe9ff;font-family:sans-serif;padding:24px">NOVA TANKS has no complete offline build yet. Connect once and reopen the game.</body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function assetResponse(request) {
  const key = canonicalURL(request.url);
  const { cache } = await activeBuildCache();
  if (cache) {
    const response = await cache.match(key);
    if (response) return response;
  }

  const runtime = await caches.open(RUNTIME_CACHE);
  const cached = await runtime.match(key);
  if (cached) return cached;

  try {
    const response = await fetchFresh(request.url);
    if (isCacheable(response)) {
      await runtime.put(key, response.clone());
    }
    return response;
  } catch (_) {
    return Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Installation is intentionally transactional. If a complete build cannot
    // be staged, this worker does not replace the existing worker.
    await stageLatest({ force: true });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const state = await readActiveState();
    if (state) {
      await cleanupCaches(state);
      await cleanupLegacyCaches();
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate') {
    const stagePromise = navigator.onLine ? stageLatest().catch(() => undefined) : null;
    if (stagePromise) event.waitUntil(stagePromise);
    event.respondWith(navigationResponse(stagePromise));
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

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'nova-update') return;
  event.waitUntil(stageLatest().catch(() => undefined));
});