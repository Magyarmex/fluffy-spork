'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../../sw.js'), 'utf8');
const base = 'https://nova.example/';
const shell = '<!doctype html><title>NOVA TANKS</title>' +
  '<script>window.__bootModule("main");</script>' +
  '<script src="./nova-updates/controller-v1.3.0.js"></script>';
const fingerprint = createHash('sha256').update(shell).digest('hex').slice(0, 32);
const META = 'nova-tanks-real-meta-v4';
const OLD = 'nova-tanks-real-build-v4-old';
const stateURL = base + '__nova_real_active__.json';
const scriptURL = base + 'nova-updates/controller-v1.3.0.js';

function fixture({ missingScript = false, failAsset = false } = {}) {
  const data = new Map();
  const calls = [];
  const cache = name => {
    if (!data.has(name)) {
      const entries = new Map();
      data.set(name, {
        entries,
        async match(key) { const value = entries.get(String(key)); return value ? value.clone() : null; },
        async put(key, response) { entries.set(String(key), response.clone()); },
      });
    }
    return data.get(name);
  };
  const caches = {
    open: async name => cache(name),
    keys: async () => [...data.keys()],
    delete: async name => data.delete(name),
  };
  const self = {
    registration: { scope: base },
    navigator: { onLine: true },
    location: { origin: 'https://nova.example' },
    clients: { matchAll: async () => [] },
    skipWaiting: async () => {},
    addEventListener() {},
  };
  const fetch = async request => {
    calls.push(request.url);
    if (!self.navigator.onLine) throw Error('simulated offline');
    if (request.url.includes('controller-v1.3.0.js')) {
      if (failAsset) throw Error('simulated missing asset');
      return new Response('console.info("Controller loaded")', { status: 200 });
    }
    return new Response(shell, { status: 200, headers: { 'Content-Type': 'text/html' } });
  };
  const sandbox = {
    self, caches, fetch, Request, Response, crypto: webcrypto,
    TextEncoder, URL, AbortController, setTimeout, clearTimeout,
    Date, Math, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'sw.js' });
  return {
    cache, caches, calls,
    stageLatest: options => vm.runInContext('stageLatest', sandbox)(options),
    navigationResponse: () => vm.runInContext('navigationResponse', sandbox)(),
    assetResponse: url => vm.runInContext('assetResponse', sandbox)({ url }),
    goOffline() { self.navigator.onLine = false; },
    goOnline() { self.navigator.onLine = true; },
    async seed() {
      await cache(META).put(stateURL,
        new Response(JSON.stringify({ cacheName: OLD, fingerprint })));
      await cache(OLD).put(base, new Response(shell));
      if (!missingScript) await cache(OLD).put(scriptURL, new Response('cached Controller'));
    },
    async active() {
      const response = await cache(META).match(stateURL);
      return response ? response.json() : null;
    },
  };
}

test('same fingerprint with missing critical JS repairs the offline cache', async () => {
  const f = fixture({ missingScript: true });
  await f.seed();
  assert.equal(await f.cache(OLD).match(scriptURL), null);
  const result = await f.stageLatest();
  assert.equal(result.changed, true, 'shell-only cache is not a valid offline installation');
  const state = await f.active();
  assert.notEqual(state.cacheName, OLD);
  assert.ok(await f.cache(state.cacheName).match(scriptURL), 'critical script is staged');
  assert.ok(await f.cache(state.cacheName).match(base), 'canonical shell is staged');
  assert.equal((await f.caches.keys()).includes(OLD), false, 'old incomplete cache purged after promotion');
});

test('complete same-fingerprint cache keeps fast path without refetching assets', async () => {
  const f = fixture();
  await f.seed();
  const result = await f.stageLatest();
  assert.equal(result.changed, false);
  assert.equal((await f.active()).cacheName, OLD);
  assert.equal(f.calls.filter(x => x.includes('controller-v1.3.0.js')).length, 0);
});

test('failed repair preserves old active state and never promotes partial assets', async () => {
  const f = fixture({ missingScript: true, failAsset: true });
  await f.seed();
  await assert.rejects(f.stageLatest(), /simulated missing asset/);
  assert.equal((await f.active()).cacheName, OLD);
  assert.deepEqual(await f.caches.keys(), [META, OLD]);
});


test('offline navigation fails closed when a critical game script was evicted', async () => {
  const f = fixture({ missingScript: true });
  await f.seed();
  f.goOffline();
  const response = await f.navigationResponse();
  assert.equal(response.status, 503, 'a shell without its script cannot boot offline');
  assert.match(await response.text(), /cannot verify a canonical real-game build/);
  assert.equal((await f.active()).cacheName, OLD, 'no incomplete cache is promoted');
});

test('offline navigation still serves a complete validated game', async () => {
  const f = fixture();
  await f.seed();
  f.goOffline();
  const response = await f.navigationResponse();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /__bootModule/);
});

test('optional Owner Operations absence does not block a complete offline game', async () => {
  const f = fixture();
  await f.seed(); // Only the critical game script is seeded; optional Owner HUD is absent.
  f.goOffline();
  const response = await f.navigationResponse();
  assert.equal(response.status, 200);
});

test('online navigation repairs evicted scripts before serving the game', async () => {
  const f = fixture({ missingScript: true });
  await f.seed();
  const response = await f.navigationResponse();
  assert.equal(response.status, 200);
  assert.notEqual((await f.active()).cacheName, OLD);
  assert.ok(await f.cache((await f.active()).cacheName).match(scriptURL));
});

test('offline navigation without an active validated cache shows recovery', async () => {
  const f = fixture();
  f.goOffline();
  const response = await f.navigationResponse();
  assert.equal(response.status, 503);
});


test('validated critical script bytes take precedence over unverified network bytes', async () => {
  const f = fixture();
  await f.seed();
  const response = await f.assetResponse(scriptURL);
  assert.equal(await response.text(), 'cached Controller',
    'an active game must not mix a validated shell with unvalidated same-URL JS');
  assert.equal(f.calls.length, 0, 'known validated scripts must not require a network round trip');
});

test('offline critical scripts load from validated cache without a network request', async () => {
  const f = fixture();
  await f.seed();
  f.goOffline();
  const response = await f.assetResponse(scriptURL);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'cached Controller');
  assert.equal(f.calls.length, 0);
});

test('validated cross-origin CDN dependencies use the same atomic asset policy', async () => {
  const f = fixture();
  await f.seed();
  const cdn = 'https://cdn.example/react.js';
  await f.cache(OLD).put(cdn, new Response('validated React'));
  const response = await f.assetResponse(cdn);
  assert.equal(await response.text(), 'validated React');
  assert.equal(f.calls.length, 0);
});

test('non-staged assets retain a network fallback', async () => {
  const f = fixture();
  await f.seed();
  const url = base + 'noncritical-image.png';
  const response = await f.assetResponse(url);
  assert.equal(response.status, 200);
  assert.ok(f.calls.some(x => x.includes('noncritical-image.png')));
});
