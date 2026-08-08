const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const register = fs.readFileSync(path.join(root, 'pwa-register.js'), 'utf8');

function position(source, needle) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `Expected updater source to contain: ${needle}`);
  return index;
}

test('updater uses cache-busted network checks with explicit timeouts', () => {
  assert.match(sw, /const CACHE_BUSTER = '__nova_update'/);
  assert.match(sw, /new AbortController\(\)/);
  assert.match(sw, /cache: 'no-store'/);
  assert.match(sw, /Cache-Control': 'no-cache'/);
});

test('new builds are immutable candidates and promote only after critical staging + validation', () => {
  assert.match(sw, /const BUILD_PREFIX = `nova-tanks-build-v\$\{UPDATER_VERSION\}-`/);
  const critical = position(sw, 'await runPool(critical');
  const htmlWrite = position(sw, 'await stage.put(indexURL');
  const validation = position(sw, 'await validateStagedBuild(stage');
  const promotion = position(sw, 'await writeActiveState(nextState)');
  assert.ok(critical < htmlWrite, 'critical dependencies must stage before HTML');
  assert.ok(htmlWrite < validation, 'HTML must exist before final staged-build validation');
  assert.ok(validation < promotion, 'active pointer must move only after full validation');
});

test('partial candidates are deleted instead of poisoning the active build', () => {
  assert.match(sw, /await caches\.delete\(cacheName\);\s*throw error;/s);
  assert.match(sw, /previousCacheName:/);
});

test('matching fingerprints are not trusted when their cache is incomplete', () => {
  const sameFingerprint = position(sw, 'current.fingerprint === buildFingerprint');
  const validation = sw.indexOf('await validateStagedBuild(currentCache', sameFingerprint);
  const corruptionComment = sw.indexOf('matching-but-incomplete cache is corruption', sameFingerprint);
  assert.ok(validation > sameFingerprint);
  assert.ok(corruptionComment > validation);
});

test('worker installation is transactional', () => {
  const install = position(sw, "self.addEventListener('install'");
  const stage = sw.indexOf('await stageLatest({ force: true })', install);
  const skip = sw.indexOf('await self.skipWaiting()', install);
  assert.ok(stage > install);
  assert.ok(skip > stage, 'worker must not replace its predecessor until a complete build is staged');
});

test('updater preserves a rollback build and removes old NOVA caches only after promotion', () => {
  assert.match(sw, /activeState && activeState\.previousCacheName/);
  const promotion = position(sw, 'await writeActiveState(nextState)');
  const cleanup = sw.indexOf('await cleanupCaches(nextState)', promotion);
  assert.ok(cleanup > promotion);
});

test('page-side updater can observe worker completion and self-update independently', () => {
  assert.match(register, /updateViaCache: 'none'/);
  assert.match(register, /new MessageChannel\(\)/);
  assert.match(register, /NOVA_SYNC_LATEST/);
  assert.match(register, /controllerchange/);
  assert.match(register, /worker-message-timeout/);
});
