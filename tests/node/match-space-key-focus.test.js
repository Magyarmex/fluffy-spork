const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('Space fire cannot trigger the browser default action on focused match controls', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  assert.match(
    runtime,
    /onKeyDown=\(event:KeyboardEvent\)=>\{if\(this\.#screen==='match'&&event\.code==='Space'\)event\.preventDefault\(\);this\.#pressed\.add\(event\.code\);\}/,
    'Space is a gameplay fire binding during matches, so its browser default must be cancelled before a focused PAUSE/upgrade/redeploy button can also activate.'
  );
});
