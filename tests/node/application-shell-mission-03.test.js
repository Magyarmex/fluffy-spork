const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Mission 03 source shell remains present after Mission 25 cutover', () => {
  for (const relativePath of ['src/main.ts','src/app/bootstrap.ts','src/app/lifecycle.ts','src/app/GameApp.ts']) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} should exist`);
  }
});

test('Vite now owns the canonical production boot seam', () => {
  const vite = read('vite.config.ts');
  const index = read('index.html');
  assert.match(vite, /nova-canonical-pwa-assets/);
  assert.match(index, /<div id="root"><\/div>/);
  assert.match(index, /<script type="module" src="\/src\/main\.ts"><\/script>/);
  assert.doesNotMatch(index, /nova-updates\/|nova-gz\/|__novaModules|__bootModule/);
});

test('legacy boot is development-only and production GameApp is Foundation-owned', () => {
  const gameApp = read('src/app/GameApp.ts');
  const legacyRuntime = read('src/legacy/LegacyRuntime.ts');
  const bootstrap = read('src/app/bootstrap.ts');
  const lifecycle = read('src/app/lifecycle.ts');

  assert.doesNotMatch(gameApp, /LegacyRuntime/);
  assert.match(legacyRuntime, /__bootModule/);
  assert.match(bootstrap, /resolveDevelopmentRuntime/);
  assert.match(bootstrap, /runtime\.selected === 'legacy'/);
  assert.match(bootstrap, /serviceWorker\.register\('\.\/sw\.js'/);
  assert.match(bootstrap, /renderStartupFailure/);
  assert.match(lifecycle, /__NOVA_STARTUP_STATUS/);
  assert.match(lifecycle, /nova:startup/);
});
