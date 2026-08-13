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

test('recovery worker refuses Foundation/Vite shells and requires real-game markers', () => {
  assert.match(sw, /const UPDATER_VERSION = 4/);
  assert.match(sw, /'__bootModule'/);
  assert.match(sw, /'nova-updates\/'/);
  assert.match(sw, /'\/src\/main\.ts'/);
  assert.match(sw, /'%BASE_URL%'/);
  assert.match(sw, /Rejected Foundation\/NOVASTAR shell/);
});

test('real build is staged transactionally before it can take control', () => {
  const install = position(sw, "self.addEventListener('install'");
  const stage = sw.indexOf('await stageLatest({ force: true })', install);
  const skip = sw.indexOf('await self.skipWaiting()', install);
  assert.ok(stage > install);
  assert.ok(skip > stage);

  const critical = position(sw, 'await runPool(critical');
  const htmlWrite = position(sw, 'await stage.put(indexURL');
  const stagedValidation = position(sw, 'await validateShellResponse(staged)');
  const promotion = position(sw, 'await writeActiveState(nextState)');
  assert.ok(critical < htmlWrite);
  assert.ok(htmlWrite < stagedValidation);
  assert.ok(stagedValidation < promotion);
});

test('activation purges older NOVA caches instead of keeping legacy build fallbacks', () => {
  assert.match(sw, /key\.startsWith\('nova-tanks-'\)/);
  assert.match(sw, /await purgeNonCanonicalNovaCaches\(state\)/);
  assert.doesNotMatch(sw, /LEGACY_PREFIX/);
  assert.doesNotMatch(sw, /nova-tanks-offline-/);
  assert.doesNotMatch(sw, /Migration fallback/);
});

test('online navigation can only return a freshly or previously validated real shell', () => {
  assert.match(sw, /await stageLatest\(\)/);
  assert.match(sw, /await cachedRealShell\(\)/);
  assert.match(sw, /Fail closed to the last validated real-game shell/);
  assert.match(sw, /cannot verify a canonical real-game build/);
});

test('network checks bypass browser caches and remain timeout-bounded', () => {
  assert.match(sw, /const CACHE_BUSTER = '__nova_real_recovery'/);
  assert.match(sw, /new AbortController\(\)/);
  assert.match(sw, /cache: 'no-store'/);
  assert.match(sw, /Cache-Control': 'no-cache'/);
});

test('page-side updater aggressively checks for a newer worker', () => {
  assert.match(register, /updateViaCache: 'none'/);
  assert.match(register, /registration\.update\(\)/);
  assert.match(register, /NOVA_SYNC_LATEST/);
  assert.match(register, /controllerchange/);
  assert.match(register, /worker-message-timeout/);
});
