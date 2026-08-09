const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/upgrade-dwell-v1.9.2.js'), 'utf8');

function boot() {
  let hookState;
  let cleanup = null;
  const timers = [];
  const cleared = new Set();
  const React = {
    createElement(type, props) { return { type, props }; },
    useState(initial) {
      if (hookState === undefined) hookState = initial;
      return [hookState, (next) => { hookState = typeof next === 'function' ? next(hookState) : next; }];
    },
    useEffect(effect) {
      if (cleanup) cleanup();
      cleanup = effect() || null;
    }
  };
  const window = { React };
  const context = {
    window,
    console: { info() {}, warn() {}, error() {} },
    setTimeout(fn, ms) { const id = timers.length + 1; timers.push({ id, fn, ms }); return id; },
    clearTimeout(id) { cleared.add(id); },
    Object,
    Array
  };
  vm.runInNewContext(source, context, { filename: 'upgrade-dwell-v1.9.2.js' });
  return { window, React, timers, cleared, getState: () => hookState };
}

test('release installs a strict 500 ms upgrade dwell', () => {
  const { window } = boot();
  assert.equal(window.__NOVA_VERSION, '1.9.2');
  assert.equal(window.__NOVA_UPGRADE_DWELL__.dwellMs, 500);
  assert.equal(window.__NOVA_UPGRADE_DWELL_TEST__.effectiveInputActive(false, true), true);
  assert.equal(window.__NOVA_UPGRADE_DWELL_TEST__.effectiveInputActive(false, false), false);
});

test('UpgradeTray is wrapped and remains collapsed while the dwell timer is pending', () => {
  const { React, timers } = boot();
  function UpgradeTray() {}
  const wrapped = React.createElement(UpgradeTray, { sticksActive: false, marker: 7 });
  assert.notEqual(wrapped.type, UpgradeTray);
  const inner = wrapped.type(wrapped.props);
  assert.equal(inner.type, UpgradeTray);
  assert.equal(inner.props.marker, 7);
  assert.equal(inner.props.sticksActive, true);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 500);
});

test('renewed stick input cancels the pending dwell and keeps collapse immediate', () => {
  const { React, timers, cleared } = boot();
  function UpgradeTray() {}
  let wrapped = React.createElement(UpgradeTray, { sticksActive: false });
  wrapped.type(wrapped.props);
  assert.equal(timers.length, 1);

  wrapped = React.createElement(UpgradeTray, { sticksActive: true });
  const inner = wrapped.type(wrapped.props);
  assert.equal(cleared.has(timers[0].id), true);
  assert.equal(inner.props.sticksActive, true);
});

test('the tray is released after the half-second timer completes', () => {
  const { React, timers, getState } = boot();
  function UpgradeTray() {}
  let wrapped = React.createElement(UpgradeTray, { sticksActive: false });
  wrapped.type(wrapped.props);
  timers[0].fn();
  assert.equal(getState(), false);
  wrapped = React.createElement(UpgradeTray, { sticksActive: false });
  const inner = wrapped.type(wrapped.props);
  assert.equal(inner.props.sticksActive, false);
});
