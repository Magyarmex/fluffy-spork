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
const META = 'nova-tanks-real-meta-v4';
const OLD = 'nova-tanks-real-build-v4-old';
const stateURL = base + '__nova_real_active__.json';
const scriptURL = base + 'nova-updates/controller-v1.3.0.js';

function fixture({ missingScript = false, failAsset = false, failPurge = false, failNotify = false } = {}) {
  const data = new Map();
  const calls = [];
  let rejectNextMetaWrite = false;
  let remoteShell = shell;
  let remoteScript = 'console.info("Controller loaded")';
  const cache = name => {
    if (!data.has(name)) {
      const entries = new Map();
      data.set(name, {
        entries,
        async match(key) { const value = entries.get(String(key)); return value ? value.clone() : null; },
        async put(key, response) {
          if (name === META && String(key) === stateURL && rejectNextMetaWrite) {
            rejectNextMetaWrite = false;
            throw Error('simulated active-pointer write failure');
          }
          entries.set(String(key), response.clone());
        },
      });
    }
    return data.get(name);
  };
  const caches = {
    open: async name => cache(name),
    keys: async () => [...data.keys()],
    delete: async name => {
      if (failPurge && name === OLD) throw Error('simulated old-cache purge failure');
      return data.delete(name);
    },
  };
  const self = {
    registration: { scope: base },
    navigator: { onLine: true },
    location: { origin: 'https://nova.example' },
    clients: { matchAll: async () => {
      if (failNotify) throw Error('simulated client notification failure');
      return [];
    } },
    skipWaiting: async () => {},
    addEventListener() {},
  };
  const fetch = async request => {
    calls.push(request.url);
    if (!self.navigator.onLine) throw Error('simulated offline');
    if (request.url.includes('controller-v1.3.0.js')) {
      if (failAsset) throw Error('simulated missing asset');
      return new Response(remoteScript, { status: 200 });
    }
    return new Response(remoteShell, { status: 200, headers: { 'Content-Type': 'text/html' } });
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
    setRemoteBuild(html, script) { remoteShell = html; remoteScript = script; },
    failNextMetaWrite() { rejectNextMetaWrite = true; },
    async seed({ html = shell } = {}) {
      const hash = createHash('sha256').update(html).digest('hex').slice(0, 32);
      await cache(META).put(stateURL,
        new Response(JSON.stringify({ cacheName: OLD, fingerprint: hash })));
      await cache(OLD).put(base, new Response(html));
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


test('a validated newer release replaces cached old same-URL script bytes atomically', async () => {
  const f = fixture();
  await f.seed();
  assert.equal(await (await f.assetResponse(scriptURL)).text(), 'cached Controller');
  f.setRemoteBuild(shell + '<!-- new runtime fingerprint -->', 'new validated Controller');
  const result = await f.stageLatest();
  assert.equal(result.changed, true);
  assert.notEqual((await f.active()).cacheName, OLD);
  assert.equal(await (await f.assetResponse(scriptURL)).text(), 'new validated Controller');
  f.goOffline();
  assert.equal((await f.navigationResponse()).status, 200);
});


test('offline navigation rejects a missing critical cross-origin script', async () => {
  const f = fixture();
  const cdn = 'https://cdn.example/react.js';
  await f.seed({ html: shell + '<script src="' + cdn + '"></script>' });
  f.goOffline();
  assert.equal((await f.navigationResponse()).status, 503);
  await f.cache(OLD).put(cdn, new Response('cached React'));
  assert.equal((await f.navigationResponse()).status, 200);
});

test('offline navigation rejects missing same-origin critical stylesheet', async () => {
  const f = fixture();
  const css = base + 'nova-tailwind.css';
  await f.seed({ html: shell + '<link rel="stylesheet" href="./nova-tailwind.css">' });
  f.goOffline();
  assert.equal((await f.navigationResponse()).status, 503);
  await f.cache(OLD).put(css, new Response('body{background:#000}'));
  assert.equal((await f.navigationResponse()).status, 200);
});


test('actual materialized game: all 52 scripts are required for offline boot', async () => {
  const actual = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const urls = [...actual.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => new URL(match[1], base).href);
  const orderOwner='simulation-owned-tank-order-v1.12.1.js';
  const materialized=actual.includes(orderOwner);
  assert.equal(urls.length, materialized ? 52 : 51,
    'shipping script composition changed; review offline contract');
  assert.ok(fs.existsSync(path.join(__dirname,'../../nova-updates',orderOwner)),
    'simulation-order owner must exist for offline staging');
  if(materialized)assert.ok(urls.some(url => url.includes(orderOwner)),
    'simulation-order owner must be a critical offline boot dependency');
  const f = fixture();
  await f.seed({ html: actual });
  const cache = f.cache(OLD);
  for (const url of urls) await cache.put(url, new Response('staged dependency'));
  f.goOffline();
  assert.equal((await f.navigationResponse()).status, 200);
  const critical = urls.find(url => url.includes('living-front-director-v1.12.0.js'));
  assert.ok(critical, 'real-game overlay missing');
  cache.entries.delete(critical);
  assert.equal((await f.navigationResponse()).status, 503,
    'evicting one real gameplay overlay must not serve a broken playable shell');
});


test('a cached 404 is not a valid critical script for offline boot', async () => {
  const f = fixture();
  await f.seed();
  await f.cache(OLD).put(scriptURL, new Response('Not found', { status: 404 }));
  f.goOffline();
  assert.equal((await f.navigationResponse()).status, 503);
  assert.equal((await f.assetResponse(scriptURL)).status, 0,
    'an invalid cached response cannot be served as a game module');
});

test('unchanged-build validation restages a cached 404 instead of treating it as healthy', async () => {
  const f = fixture();
  await f.seed();
  await f.cache(OLD).put(scriptURL, new Response('Not found', { status: 404 }));
  const result = await f.stageLatest();
  assert.equal(result.changed, true);
  const active = await f.active();
  assert.notEqual(active.cacheName, OLD);
  const response = await f.cache(active.cacheName).match(scriptURL);
  assert.ok(response && response.ok);
});


test('cache purge failure after promotion cannot delete the newly active playable game', async () => {
  const f = fixture({ failPurge: true });
  await f.seed();
  f.setRemoteBuild(shell + '<!-- newer build -->', 'new Controller');
  const result = await f.stageLatest();
  assert.equal(result.changed, true);
  const state = await f.active();
  assert.notEqual(state.cacheName, OLD);
  assert.ok(await f.cache(state.cacheName).match(scriptURL));
  assert.ok((await f.caches.keys()).includes(OLD), 'old cache may remain until later cleanup');
  f.goOffline();
  assert.equal((await f.navigationResponse()).status, 200);
});

test('client notification failure after promotion cannot delete the new active game', async () => {
  const f = fixture({ failNotify: true });
  await f.seed();
  f.setRemoteBuild(shell + '<!-- newer build -->', 'new Controller');
  const result = await f.stageLatest();
  assert.equal(result.changed, true);
  const state = await f.active();
  assert.notEqual(state.cacheName, OLD);
  assert.ok(await f.cache(state.cacheName).match(scriptURL));
  f.goOffline();
  assert.equal((await f.navigationResponse()).status, 200);
});


test('pre-promotion active-pointer write failure still rolls back the new stage', async () => {
  const f = fixture();
  await f.seed();
  f.setRemoteBuild(shell + '<!-- newer build -->', 'new Controller');
  f.failNextMetaWrite();
  await assert.rejects(f.stageLatest(), /simulated active-pointer write failure/);
  assert.equal((await f.active()).cacheName, OLD);
  assert.deepEqual(await f.caches.keys(), [META, OLD],
    'failed new stage must be removed without deleting the previous playable build');
  f.goOffline();
  assert.equal((await f.navigationResponse()).status, 200);
});
