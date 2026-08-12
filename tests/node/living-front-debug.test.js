const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

test('Living Front diagnostics are exposed through the copyable canonical Debug surface', () => {
  const runtime = readFileSync(path.join(root, 'src/app/FoundationRuntime.ts'), 'utf8');
  const ui = readFileSync(path.join(root, 'src/ui/CanonicalUI.tsx'), 'utf8');
  assert.match(runtime, /livingFront:battle\.livingFront/, 'gameplay publishes the canonical Living Front snapshot into Debug data');
  assert.match(ui, /JSON\.stringify\(ui\.debug,null,2\)/, 'Debug data remains copyable as formatted JSON');
});
