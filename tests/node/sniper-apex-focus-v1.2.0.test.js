const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function source(name) {
  return fs.readFileSync(path.join(__dirname, '../../nova-updates', name), 'utf8');
}

test('Apex rails expose class-specific focus durations', () => {
  const context = { window: { __novaModules: {} }, console, Math, navigator: {}, performance: { now: () => 0 } };
  vm.runInNewContext(source('sniper-v1.2.0.js'), context, { filename: 'sniper-v1.2.0.js' });
  const focusMs = context.window.__NOVA_RAIL_FOCUS_MS;
  assert.equal(typeof focusMs, 'function');
  assert.equal(focusMs({ cls: 'prism' }), 400);
  assert.equal(focusMs({ cls: 'railgun' }), 520);
  assert.equal(focusMs({ cls: 'singularity' }), 650);
  assert.equal(focusMs({ cls: 'ghost' }), 520);
  assert.equal(200 / focusMs({ cls: 'prism' }), 0.5);
  assert.equal(260 / focusMs({ cls: 'railgun' }), 0.5);
  assert.equal(325 / focusMs({ cls: 'singularity' }), 0.5);
});

test('Forward Observer reconstructs normalized focus through the shared class clock', () => {
  const src = source('stability-v1.4.0.js');
  assert.match(src, /__novaFocusStart=now-q\*railFocusMs\(t\)/);
  assert.match(src, /__novaFocusStart=performance\.now\(\)-railFocusMs\(t\);t\.__novaFocus=1/);
  assert.match(src, /t\.__novaFocusStart=performance\.now\(\)-railFocusMs\(t\)/);
  assert.doesNotMatch(src, /__novaFocusStart=now-q\*520/);
  assert.doesNotMatch(src, /__novaFocusStart=performance\.now\(\)-(?:520|530)/);
});

test('Silent Horizon uses the class clock for held and released focus', () => {
  const src = source('sniper-v1.2.0.js');
  assert.match(src, /elapsed \/ railFocusMs\(t\)/);
  assert.match(src, /pl\.__novaFocusStart\) \/ railFocusMs\(pl\)/);
  assert.doesNotMatch(src, /elapsed \/ FULL_CHARGE_MS/);
});
