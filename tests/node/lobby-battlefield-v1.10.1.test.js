const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/lobby-battlefield-v1.10.1.js'), 'utf8');

function metadataBoot() {
  const window = {};
  const context = { window, document: undefined, navigator: {}, console, Math };
  vm.runInNewContext(source, context, { filename: 'lobby-battlefield-v1.10.1.js' });
  return window;
}

test('War Room ships the complete 36-tank roster at level 30', () => {
  const window = metadataBoot();
  const hooks = window.__NOVA_LOBBY_BATTLEFIELD_TEST__;
  assert.equal(window.__NOVA_VERSION, '1.10.1');
  assert.equal(window.__NOVA_LOBBY_BATTLEFIELD_RELEASE__.codename, 'War Room');
  assert.equal(hooks.level, 30);
  assert.equal(hooks.roster.length, 36);
  assert.equal(new Set(hooks.roster.map(([id]) => id)).size, 36);
  for (const lineage of ['basic', 'gunner', 'cannon', 'sniper', 'controller', 'guardian']) {
    assert.ok(hooks.roster.some(([, value]) => value === lineage), `missing ${lineage}`);
  }
});

test('background has explicit simulation and presentation budgets', () => {
  const window = metadataBoot();
  const hooks = window.__NOVA_LOBBY_BATTLEFIELD_TEST__;
  assert.equal(hooks.simHz, 20);
  assert.equal(hooks.renderHz, 30);
  assert.ok(hooks.panSpeed > 0 && hooks.panSpeed <= 16);
  assert.match(source, /deviceMemory/);
  assert.match(source, /hardwareConcurrency/);
  assert.match(source, /Math\.min\(window\.devicePixelRatio\|\|1,this\.low\?1:1\.25\)/);
  assert.match(source, /this\.low\?70:110/);
  assert.match(source, /this\.low\?18:38/);
});

test('camera drifts upward and reduced-motion freezes the pan', () => {
  assert.match(source, /if\(!this\.reduced\)this\.cameraY=wrap\(this\.cameraY-PAN_SPEED\*dt,this\.worldH\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /var target=this\.reduced\?12:/);
});

test('battlefield remains a noninteractive, subdued menu background', () => {
  assert.match(source, /pointer-events:none!important/);
  assert.match(source, /\.nv-lobby-battlefield\{z-index:0;opacity:\.46/);
  assert.match(source, /\.nv-lobby-atmosphere\{z-index:1/);
  assert.match(source, /\.menu-grid-bg\.nv-war-room>\.nv-lobby-foreground\{z-index:2\}/);
  assert.match(source, /c\.setAttribute\('aria-hidden','true'\)/);
});

test('runtime sleeps when the menu or browser tab is not visible', () => {
  assert.match(source, /!document\.hidden/);
  assert.match(source, /if\(!visibleMenu\(this\.menu\)\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange',reconcile/);
  assert.match(source, /MutationObserver\(reconcile\)/);
});
