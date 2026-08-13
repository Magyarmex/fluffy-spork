const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sw = fs.readFileSync(path.join(__dirname, '../../sw.js'), 'utf8');

function position(source, needle) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `Expected updater source to contain: ${needle}`);
  return index;
}

test('all script dependencies remain critical so the validated real game can boot offline', () => {
  const scripts = position(sw, 'for (const match of html.matchAll(/<script');
  const links = position(sw, 'for (const match of html.matchAll(/<link');
  const addEveryScript = sw.indexOf('urls.add(new URL(match[1], baseURL).href);', scripts);
  assert.ok(addEveryScript > scripts && addEveryScript < links,
    'script staging must include cross-origin React/ReactDOM dependencies');
  assert.match(sw, /Script dependencies are critical regardless of origin/);
});
