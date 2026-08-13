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
  const listeners = new Map();
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
  const document = {
    addEventListener(type, fn, capture) { listeners.set(type, { fn, capture }); }
  };
  const window = { React };
  const context = {
    window,
    document,
    console: { info() {}, warn() {}, error() {} },
    setTimeout(fn, ms) { const id = timers.length + 1; timers.push({ id, fn, ms }); return id; },
    clearTimeout(id) { cleared.add(id); },
    Date,
    Object,
    Array
  };
  vm.runInNewContext(source, context, { filename: 'upgrade-dwell-v1.9.2.js' });
  return { window, React, timers, cleared, listeners, getState: () => hookState };
}

function classList(...values) {
  const set = new Set(values);
  return { contains(value) { return set.has(value); } };
}

function ultimateFixture() {
  const holder = { classList: classList('absolute', 'bottom-6', 'right-4', 'z-20') };
  let clicks = 0;
  const button = {
    classList: classList('h-[68px]', 'w-[68px]', 'rounded-full'),
    parentElement: holder,
    click() { clicks += 1; }
  };
  const target = { closest(selector) { return selector === 'button[data-ui]' ? button : null; } };
  return { button, target, clicks: () => clicks };
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

test('ultimate pointer capture is installed before gameplay boots', () => {
  const { listeners, window } = boot();
  assert.equal(listeners.get('pointerdown').capture, true);
  assert.equal(listeners.get('click').capture, true);
  assert.equal(window.__NOVA_MULTITOUCH_ULTIMATE__.touchClickGuardMs, 900);
});

test('a non-primary second touch activates the ultimate immediately', () => {
  const { window } = boot();
  const fx = ultimateFixture();
  let prevented = 0;
  let stopped = 0;
  window.__NOVA_MULTITOUCH_ULTIMATE_TEST__.onPointerDown({
    pointerType: 'touch',
    pointerId: 22,
    isPrimary: false,
    target: fx.target,
    cancelable: true,
    preventDefault() { prevented += 1; },
    stopPropagation() { stopped += 1; }
  });
  assert.equal(fx.clicks(), 1);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
});

test('the synthetic click after touch activation is swallowed instead of double-firing', () => {
  const { window } = boot();
  const fx = ultimateFixture();
  window.__NOVA_MULTITOUCH_ULTIMATE_TEST__.onPointerDown({
    pointerType: 'touch', target: fx.target, cancelable: true,
    preventDefault() {}, stopPropagation() {}
  });
  let prevented = 0;
  let stopped = 0;
  window.__NOVA_MULTITOUCH_ULTIMATE_TEST__.onClickCapture({
    target: fx.target,
    cancelable: true,
    preventDefault() { prevented += 1; },
    stopImmediatePropagation() { stopped += 1; }
  });
  assert.equal(fx.clicks(), 1);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
});

test('mouse pointer-down is left alone so normal desktop click behavior is unchanged', () => {
  const { window } = boot();
  const fx = ultimateFixture();
  window.__NOVA_MULTITOUCH_ULTIMATE_TEST__.onPointerDown({
    pointerType: 'mouse', target: fx.target, cancelable: true,
    preventDefault() { throw new Error('mouse pointerdown must not be prevented'); },
    stopPropagation() { throw new Error('mouse pointerdown must not be stopped'); }
  });
  assert.equal(fx.clicks(), 0);
});
