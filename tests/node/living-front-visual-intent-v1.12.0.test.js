const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..', 'nova-updates');

for (const file of ['living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js']) {
  test(`${file} declares NOVA visual intent`, () => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /NOVA_VISUAL_INTENT:/);
  });
}
