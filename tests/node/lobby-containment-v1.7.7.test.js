const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../../nova-updates/lobby-history.js'), 'utf8');

test('default lobby is a hard no-scroll viewport', () => {
  assert.match(src, /\.menu-grid-bg\.nv-menu\{overflow:hidden!important/);
  assert.match(src, /overscroll-behavior:none!important/);
  assert.match(src, /touch-action:none!important/);
});

test('Blackglass is the explicit deep-inspection scroll exception', () => {
  assert.match(src, /\.nv-showroom-mode\{overflow-y:auto!important/);
  assert.match(src, /touch-action:pan-y!important/);
  assert.match(src, /classList\.toggle\('nv-showroom-mode',open\)/);
  assert.match(src, /if\(!open\)menu\.scrollTop=0/);
});

test('secondary information stays contained instead of making the lobby taller', () => {
  assert.match(src, /\.nv-util\.open\{display:block!important;position:fixed!important;inset:0!important/);
  assert.match(src, /Paged to preserve the one-screen rule/);
  assert.match(src, /\.nv-history\{[^}]*overflow:hidden/);
  assert.doesNotMatch(src, /\.nv-history\{[^}]*overflow:auto/);
});

test('future lobby extensions have hard capacity budgets', () => {
  assert.match(src, /ACTION_LIMIT=4,CARD_LIMIT=2/);
  assert.match(src, /action budget exceeded/);
  assert.match(src, /feature-card budget exceeded/);
  assert.match(src, /scrollPolicy:'viewport-only-except-deep-inspection'/);
});
