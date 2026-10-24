'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const register = fs.readFileSync(path.join(root, 'pwa-register.js'), 'utf8');
const deploy = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
const base = 'https://nova.example/';
const ownerPath = './nova-updates/owner-operations-v1.11.1.js';
const ownerURL = new URL(ownerPath, base).href;
const coreURL = base + 'nova-updates/controller-v1.3.0.js';
const shell = '<!doctype html><title>NOVA TANKS</title>' +
  '<script>window.__bootModule("main");</script>' +
  '<script src="./nova-updates/controller-v1.3.0.js"></script>';

function fixture({ ownerUnavailable = false } = {}) {
  const stores = new Map();
  const requests = [];
  let offline = false;
  const open = name => {
    if (!stores.has(name)) {
      const entries = new Map();
      stores.set(name, {
        entries,
        async match(key) {
          const value = entries.get(String(key));
          return value ? value.clone() : null;
        },
        async put(key, value) { entries.set(String(key), value.clone()); },
      });
    }
    return stores.get(name);
  };
  const caches = {
    open: async name => open(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
  };
  const self = {
    registration: { scope: base },
    location: { origin: 'https://nova.example' },
    clients: { matchAll: async () => [] },
    skipWaiting: async () => {},
    addEventListener() {},
  };
  const fetch = async request => {
    requests.push(request.url);
    if (offline) throw new Error('offline');
    if (request.url.includes('owner-operations-v1.11.1.js')) {
      if (ownerUnavailable) throw new Error('optional owner script unavailable');
      return new Response('window.__NOVA_OWNER_OPERATIONS__=true;', { status: 200 });
    }
    if (request.url.includes('controller-v1.3.0.js')) {
      return new Response('window.__NOVA_CONTROLLER__=true;', { status: 200 });
    }
    return new Response(shell, { status: 200 });
  };
  const sandbox = {
    self, caches, fetch, Request, Response, crypto: webcrypto,
    TextEncoder, URL, AbortController, setTimeout, clearTimeout,
    Date, Math, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(sw, sandbox, { filename: 'sw.js' });
  return {
    requests,
    goOffline() { offline = true; },
    goOnline() { offline = false; },
    stageLatest: options => vm.runInContext('stageLatest', sandbox)(options),
    assetResponse: url => vm.runInContext('assetResponse', sandbox)({ url }),
    async activeCache() {
      const stateResponse = await open('nova-tanks-real-meta-v4')
        .match(base + '__nova_real_active__.json');
      assert.ok(stateResponse, 'validated active state must exist');
      const state = await stateResponse.json();
      return { state, cache: open(state.cacheName) };
    },
  };
}

test('the optional offline asset matches the actual dynamic Owner loader', () => {
  assert.match(register, /script\.src = '\.\/nova-updates\/owner-operations-v1\.11\.1\.js'/);
  assert.match(sw, /owner-operations-v1\.11\.1\.js/);
  assert.match(deploy, /'nova-updates\/owner-operations-v1\.11\.1\.js'/,
    'an Owner script update must invalidate the materialized runtime fingerprint');
});

test('validated online install stages dynamically loaded Owner HUD for offline reload', async () => {
  const f = fixture();
  const stage = await f.stageLatest();
  assert.equal(stage.changed, true);
  const { cache } = await f.activeCache();
  assert.ok(await cache.match(base), 'canonical game shell staged');
  assert.ok(await cache.match(coreURL), 'core gameplay dependency staged');
  assert.ok(await cache.match(ownerURL), 'dynamic optional HUD staged');
  f.goOffline();
  const response = await f.assetResponse(ownerURL);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /__NOVA_OWNER_OPERATIONS__/);
});

test('optional Owner download failure never blocks canonical game promotion', async () => {
  const f = fixture({ ownerUnavailable: true });
  const stage = await f.stageLatest();
  assert.equal(stage.changed, true);
  const { cache } = await f.activeCache();
  assert.ok(await cache.match(base), 'game still stages');
  assert.ok(await cache.match(coreURL), 'critical gameplay script still stages');
  assert.equal(await cache.match(ownerURL), null, 'unavailable optional script is not forged');
  f.goOffline();
  const response = await f.assetResponse(coreURL);
  assert.equal(response.status, 200, 'offline gameplay still works');
  const missing = await f.assetResponse(ownerURL);
  assert.equal(missing.status, 0, 'unavailable optional Owner HUD fails closed');
});

test('unchanged build repairs missing optional HUD without replacing the active game', async () => {
  const f = fixture();
  await f.stageLatest();
  const { state, cache } = await f.activeCache();
  cache.entries.delete(ownerURL);
  assert.equal(await cache.match(ownerURL), null);
  const result = await f.stageLatest();
  assert.equal(result.changed, false, 'critical game is already current');
  assert.equal((await f.activeCache()).state.cacheName, state.cacheName);
  assert.ok(await cache.match(ownerURL), 'optional HUD is repaired in-place');
});

test('complete unchanged build does not refetch optional Owner asset', async () => {
  const f = fixture();
  await f.stageLatest();
  const before = f.requests.filter(url => url.includes('owner-operations-v1.11.1.js')).length;
  const result = await f.stageLatest();
  assert.equal(result.changed, false);
  const after = f.requests.filter(url => url.includes('owner-operations-v1.11.1.js')).length;
  assert.equal(after, before);
});
