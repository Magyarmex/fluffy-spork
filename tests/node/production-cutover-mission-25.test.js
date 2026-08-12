const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Mission 25 production shell boots only canonical TypeScript source', () => {
  const html = read('index.html');
  assert.match(html, /type="module" src="\/src\/main\.ts"/);
  for (const legacy of ['nova-updates/', 'nova-gz/', '__novaModules', '__bootModule', 'react.production.min.js']) {
    assert.equal(html.includes(legacy), false, `${legacy} must not be in the production shell`);
  }
});

test('Mission 25 deployment publishes dist rather than materializing index.html', () => {
  const workflow = read('.github/workflows/deploy.yml');
  assert.match(workflow, /npm ci --no-audit --no-fund/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run validate:dist/);
  assert.match(workflow, /path: dist/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.doesNotMatch(workflow, /nova-gz|nova-updates|Materialize|index\.html\.new|git push/);
});

test('Mission 25 build emits the preserved PWA contract and validates legacy absence', () => {
  const vite = read('vite.config.ts');
  const validator = read('scripts/validate-dist.mjs');
  for (const asset of ['manifest.webmanifest', 'nova-icon.svg', 'sw.js']) assert.match(vite, new RegExp(asset.replace('.', '\\.')));
  assert.match(validator, /Legacy production dependency survived build/);
  assert.match(validator, /NOVA_SYNC_LATEST/);
  assert.match(validator, /32 \* 1024/);
});
