const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('shipping index is the real pre-NOVASTAR NOVA TANKS runtime', () => {
  assert.match(html, /NOVA TANKS/);
  assert.match(html, /__bootModule/);
  assert.match(html, /nova-updates\//);
  assert.doesNotMatch(html, /<script[^>]+type=["']module["'][^>]+\/src\/main\.tsx?/i);
  assert.doesNotMatch(html, /%BASE_URL%/);
});

test('shipping index contains the current real-game runtime release chain', () => {
  assert.match(html, /nova-updates\/second-body-live-vector-v1\.10\.7\.js/);
  assert.match(html, /nova-updates\/visual-language-v1\.10\.9\.js/);
  assert.match(html, /nova-updates\/lobby-battlefield-v1\.10\.10\.js/);
});
