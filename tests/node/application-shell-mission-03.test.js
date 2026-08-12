const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Foundation source shell is the only application boot path', () => {
  for (const relativePath of ['src/main.ts','src/app/bootstrap.ts','src/app/lifecycle.ts','src/app/GameApp.ts','src/app/FoundationRuntime.ts']) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} should exist`);
  }
  const bootstrap = read('src/app/bootstrap.ts');
  assert.match(bootstrap, /new GameApp\(root\)/);
  assert.match(bootstrap, /serviceWorker\.register\('\.\/sw\.js'/);
  assert.match(bootstrap, /renderStartupFailure/);
  assert.doesNotMatch(bootstrap, /resolveDevelopmentRuntime|LegacyRuntime|@legacy|runtime\.selected/);
});

test('Vite owns a small canonical production shell with no runtime injection seam', () => {
  const vite = read('vite.config.ts');
  const index = read('index.html');
  assert.match(vite, /nova-canonical-pwa-assets/);
  assert.match(index, /<div id="root"><\/div>/);
  assert.match(index, /<script type="module" src="\/src\/main\.ts"><\/script>/);
  assert.doesNotMatch(index, /nova-updates\/|nova-gz\/|nova-payload\/|__novaModules|__novaCache|__novaMakeRequire|__bootModule/);
  assert.ok(Buffer.byteLength(index) < 32 * 1024);
});

test('production composition wires desktop, touch and gamepad to canonical commands', () => {
  const runtime = read('src/app/FoundationRuntime.ts');
  const ui = read('src/ui/CanonicalUI.tsx');
  const touch = read('src/ui/controls/TouchControls.tsx');
  assert.match(runtime, /GamepadInputAdapter/);
  assert.match(runtime, /navigator\.getGamepads/);
  assert.match(runtime, /issuePlayerCommand/);
  assert.match(ui, /TouchControls/);
  assert.match(touch, /TouchInputAdapter/);
  assert.match(touch, /data-touch-stick/);
  for (const token of ["'move'", "'aim'", "'fire'", "'ability'", "'ultimate'"]) assert.match(touch, new RegExp(token));
});
