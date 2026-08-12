const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Mission 03 source shell remains the sole application boot path after final retirement', () => {
  for (const relativePath of ['src/main.ts','src/app/bootstrap.ts','src/app/lifecycle.ts','src/app/GameApp.ts','src/app/FoundationRuntime.ts']) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} should exist`);
  }
  assert.equal(fs.existsSync(path.join(root, 'src/legacy')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/app/runtimeSelector.ts')), false);
});

test('Vite owns the canonical production boot seam with no alternate runtime', () => {
  const vite = read('vite.config.ts');
  const index = read('index.html');
  const bootstrap = read('src/app/bootstrap.ts');
  assert.match(vite, /nova-canonical-pwa-assets/);
  assert.match(index, /<div id="root"><\/div>/);
  assert.match(index, /<script type="module" src="\/src\/main\.ts"><\/script>/);
  assert.match(bootstrap, /new GameApp\(root\)/);
  assert.match(bootstrap, /serviceWorker\.register\('\.\/sw\.js'/);
  assert.doesNotMatch(bootstrap, /resolveDevelopmentRuntime|LegacyRuntime|runtime\.selected/);
  assert.doesNotMatch(vite, /@legacy/);
  assert.doesNotMatch(index, /nova-updates\/|nova-gz\/|__novaModules|__bootModule/);
});
