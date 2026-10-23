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
    location: { origin: 'https://nova.example' },
    clients: { matchAll: async () => [] },
    skipWaiting: async () => {},
    addEventListener() {},
  };
  const fetch = async request => {
    calls.push(request.url);
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
