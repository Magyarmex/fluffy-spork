const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const deploy = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
const validator = fs.readFileSync(path.join(root, 'scripts/validate-dist.mjs'), 'utf8');

test('Mission 25 retires materialization from the production workflow', () => {
  for (const legacy of ['nova-gz/', 'nova-updates/', 'index.html.new', 'Materialize NOVA TANKS', 'git push']) {
    assert.equal(deploy.includes(legacy), false, `${legacy} must not remain in production deployment`);
  }
  assert.match(deploy, /path: dist/);
  assert.match(deploy, /actions\/deploy-pages@v4/);
});

test('legacy payload and patch assets remain repository validation artifacts until Mission 26', () => {
  assert.ok(fs.existsSync(path.join(root, 'nova-gz')));
  assert.ok(fs.existsSync(path.join(root, 'nova-updates', 'blackglass-mirror-v1.10.6.js')));
  assert.ok(fs.existsSync(path.join(root, 'nova-updates', 'showroom-fit-v1.7.3.js')));
});

test('canonical artifact validation rejects production dependencies on the legacy runtime', () => {
  assert.match(validator, /nova-updates\//);
  assert.match(validator, /nova-gz\//);
  assert.match(validator, /__novaModules/);
  assert.match(validator, /__bootModule/);
  assert.match(validator, /Legacy production dependency survived build/);
});
