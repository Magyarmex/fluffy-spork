const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Mission 03 source entry and application shell files exist', () => {
  for (const relativePath of [
    'src/main.ts',
    'src/app/bootstrap.ts',
    'src/app/lifecycle.ts',
    'src/app/GameApp.ts',
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} should exist`);
  }
});

test('Vite owns the boot seam without changing the materialized gameplay runtime', () => {
  const vite = read('vite.config.ts');
  assert.match(vite, /novaApplicationShell/);
  assert.match(vite, /src\/main\.ts/);
  assert.match(vite, /window\\\.__bootModule/);
  assert.match(vite, /pwa-register\\\.js/);

  const index = read('index.html');
  assert.match(index, /window\.__defineModule\("game\/engine"/);
  assert.match(index, /nova-updates\/visual-language-v1\.10\.9\.js/);
  assert.match(index, /window\.__bootModule\('main'\)/);
});

test('typed shell keeps one explicit temporary legacy boot seam through the compatibility boundary', () => {
  const gameApp = read('src/app/GameApp.ts');
  const legacyRuntime = read('src/legacy/LegacyRuntime.ts');
  const bootstrap = read('src/app/bootstrap.ts');
  const lifecycle = read('src/app/lifecycle.ts');

  assert.match(gameApp, /@legacy\/LegacyRuntime/);
  assert.match(gameApp, /legacyRuntime\.boot\('main'\)/);
  assert.doesNotMatch(gameApp, /window\.__bootModule/);
  assert.match(legacyRuntime, /__bootModule/);
  assert.match(bootstrap, /serviceWorker\.register\('\.\/sw\.js'/);
  assert.match(bootstrap, /renderStartupFailure/);
  assert.match(lifecycle, /__NOVA_STARTUP_STATUS/);
  assert.match(lifecycle, /nova:startup/);
});
