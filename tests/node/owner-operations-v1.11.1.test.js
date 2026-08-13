const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'nova-updates/owner-operations-v1.11.1.js'), 'utf8');
const register = fs.readFileSync(path.join(root, 'pwa-register.js'), 'utf8');

function position(text, needle) {
  const at = text.indexOf(needle);
  assert.notEqual(at, -1, `expected source to contain ${needle}`);
  return at;
}

test('owner operations is fail-closed behind a phone bridge', () => {
  assert.match(source, /const BRIDGE = 'NOVAOwnerPhone'/);
  assert.match(source, /owner\.owner === true/);
  assert.match(source, /owner\.phoneBound === true/);
  assert.match(source, /bindingId/);
  assert.match(source, /if \(!candidate \|\| typeof candidate\.getOwnerState !== 'function'\) return false/);
  assert.match(source, /if \(!validOwner\(owner\)\) \{ disconnect\(\); return false; \}/);
});

test('owner queue covers all requested agent sources and useful states', () => {
  for (const sourceName of ['codex', 'chatgpt', 'claude', 'jarvis']) {
    assert.match(source, new RegExp(`${sourceName}:`));
  }
  for (const stateName of ['attention', 'failed', 'working', 'completed']) {
    assert.match(source, new RegExp(`${stateName}:`));
  }
  assert.ok(position(source, "attention: 0") < position(source, "working: 2"));
  assert.ok(position(source, "failed: 1") < position(source, "completed: 3"));
});

test('events must match the active phone binding', () => {
  assert.match(source, /clean\(raw\.bindingId, 160\) !== bindingId/);
  assert.match(source, /clean\(owner\.bindingId, 160\)\.length >= 16/);
});

test('the queue is always visible after authorization and notifications are non-modal', () => {
  assert.match(source, /root\.id = 'nova-owner-ops'/);
  assert.match(source, /PHONE LINK/);
  assert.match(source, /aria-live/);
  assert.match(source, /nvo-toast/);
  assert.doesNotMatch(source, /alert\(/);
  assert.doesNotMatch(source, /confirm\(/);
  assert.doesNotMatch(source, /prompt\(/);
});

test('owner identity is not inferred from browser fingerprinting', () => {
  assert.doesNotMatch(source, /navigator\.userAgent/);
  assert.doesNotMatch(source, /deviceMemory/);
  assert.doesNotMatch(source, /hardwareConcurrency/);
});

test('canonical PWA bootstrap loads the owner runtime without replacing the real game shell', () => {
  assert.match(register, /owner-operations-v1\.11\.1\.js/);
  assert.match(register, /__NOVA_OWNER_OPERATIONS_LOADER__/);
  assert.match(register, /loadOwnerOperations\(\)/);
});
