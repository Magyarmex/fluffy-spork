'use strict';
// Regression: mobile visual-viewport panning can move the canvas without
// resizing it or scrolling the layout viewport. Pointer origins must follow
// the *current* canvas rect, not a stale cached one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'nova-updates/controller-v1.3.0.js'), 'utf8');
const perf = fs.readFileSync(path.join(root, 'nova-updates/performance-v1.7.8.js'), 'utf8');
const begin = html.indexOf('window.__defineModule("game/input"');
const end = html.indexOf('window.__defineModule("game/render"', begin);
assert.ok(begin >= 0 && end > begin, 'real shipping input module must be present');

function boot(hasVisualViewport = true) {
  const listeners = { window: new Map(), viewport: new Map(), canvas: new Map(), document: new Map() };
  const add = (where, name, fn) => {
    if (!listeners[where].has(name)) listeners[where].set(name, new Set());
    listeners[where].get(name).add(fn);
  };
  const remove = (where, name, fn) => listeners[where].get(name)?.delete(fn);
  const fire = (where, name) => {
    for (const fn of [...(listeners[where].get(name) || [])]) fn();
  };
  const viewport = {
    addEventListener(name, fn) { add('viewport', name, fn); },
    removeEventListener(name, fn) { remove('viewport', name, fn); }
  };
  const window = {
    __novaModules: {},
    __defineModule(id, factory) { this.__novaModules[id] = factory; },
    addEventListener(name, fn) { add('window', name, fn); },
    removeEventListener(name, fn) { remove('window', name, fn); },
    visualViewport: hasVisualViewport ? viewport : undefined
  };
  const document = {
    hidden: false,
    addEventListener(name, fn) { add('document', name, fn); },
    removeEventListener(name, fn) { remove('document', name, fn); }
  };
  const context = {
    window, document, Math, Map, Set, Number, Object, navigator: {},
    performance: { now: () => 100 }, console: { info() {}, warn() {}, error() {} }
  };
  vm.runInNewContext(html.slice(begin, end), context);
  vm.runInNewContext(controller, context);
  vm.runInNewContext(perf, context);
  const mod = { exports: {} };
  window.__novaModules['game/input'](mod, mod.exports, () => ({}));
  const input = new mod.exports.Input();
  let left = 0, top = 0, rectReads = 0;
  const canvas = {
    getBoundingClientRect() {
      rectReads++;
      return { left, top, width: 800, height: 600 };
    },
    addEventListener(name, fn) { add('canvas', name, fn); },
    removeEventListener(name, fn) { remove('canvas', name, fn); }
  };
  input.attach(canvas);
  const touch = (id, x, y = 100) =>
    input.pd({ pointerType: 'touch', pointerId: id, clientX: x, clientY: y, target: null });
  const release = id => input.pu({ pointerType: 'touch', pointerId: id });
  return {
    input, canvas, listeners, fire, touch, release,
    setRect(x, y) { left = x; top = y; },
    rectReads: () => rectReads
  };
}

test('visualViewport scroll refreshes the real canvas rect for touch-stick origins', () => {
  const h = boot();
  h.touch(1, 120, 110);
  assert.equal(h.input.move.ox, 120);
  h.release(1);
  h.setRect(45, 30); // visual viewport panned; no window scroll/resize/ResizeObserver
  h.fire('viewport', 'scroll');
  h.touch(2, 120, 110);
  assert.equal(h.input.move.ox, 75, 'stale canvas left offset shifts movement control');
  assert.equal(h.input.move.oy, 80, 'stale canvas top offset shifts movement control');
});

test('visualViewport pan preserves left/right twin-stick ownership', () => {
  const h = boot();
  h.setRect(100, 0);
  h.fire('viewport', 'scroll');
  h.touch(3, 430);
  assert.equal(h.input.stickId.move, 3, 'x=330 within shifted canvas belongs to movement');
  assert.equal(h.input.aim.active, false, 'panning must not convert move into fire');
});

test('visualViewport scroll refresh is event-driven, not a layout read per pointer', () => {
  const h = boot();
  const before = h.rectReads();
  for (let n = 0; n < 40; n++) {
    h.touch(n + 100, 110);
    h.release(n + 100);
  }
  assert.equal(h.rectReads(), before, 'pointer hot path must reuse cached geometry');
  h.fire('viewport', 'scroll');
  assert.equal(h.rectReads(), before + 1, 'one viewport event causes one geometry refresh');
});

test('visualViewport scroll listener is removed on detach and not duplicated on reattach', () => {
  const h = boot();
  assert.equal(h.listeners.viewport.get('scroll')?.size, 1);
  h.input.detach();
  assert.equal(h.listeners.viewport.get('scroll')?.size, 0);
  h.input.attach(h.canvas);
  assert.equal(h.listeners.viewport.get('scroll')?.size, 1);
  h.input.detach();
  assert.equal(h.listeners.viewport.get('scroll')?.size, 0);
});

test('desktop input still attaches and detaches without visualViewport', () => {
  const h = boot(false);
  h.touch(5, 100);
  assert.equal(h.input.stickId.move, 5);
  h.input.detach();
  assert.equal(h.listeners.window.get('scroll')?.size || 0, 0);
});
