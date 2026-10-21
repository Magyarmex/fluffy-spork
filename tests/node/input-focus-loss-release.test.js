'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'nova-updates/controller-v1.3.0.js'), 'utf8');
const performance = fs.readFileSync(path.join(root, 'nova-updates/performance-v1.7.8.js'), 'utf8');
const start = html.indexOf('window.__defineModule("game/input"');
const end = html.indexOf('window.__defineModule("game/render"', start);
assert.ok(start >= 0 && end > start, 'real shipping Input module is present');
function boot() {
  const events = { window: new Map(), document: new Map(), canvas: new Map() };
  function add(where, type, fn) {
    if (!events[where].has(type)) events[where].set(type, new Set());
    events[where].get(type).add(fn);
  }
  function remove(where, type, fn) { events[where].get(type)?.delete(fn); }
  function fire(where, type) { for (const fn of [...(events[where].get(type) || [])]) fn(); }
  const window = {
    __novaModules: {},
    __defineModule(id, fn) { this.__novaModules[id] = fn; },
    addEventListener(type, fn) { add('window', type, fn); },
    removeEventListener(type, fn) { remove('window', type, fn); },
  };
  const document = {
    hidden: false,
    addEventListener(type, fn) { add('document', type, fn); },
    removeEventListener(type, fn) { remove('document', type, fn); },
  };
  const silent = { info() {}, warn() {}, error() {} };
  vm.runInNewContext(html.slice(start, end), { window, document, console: silent });
  vm.runInNewContext(controller, { window, document, console: silent, navigator: {}, performance: { now: () => 100 }, Math });
  vm.runInNewContext(performance, { window, document, console: silent, Math, Map, Number });
  const module = { exports: {} };
  window.__novaModules['game/input'](module, module.exports, () => ({}));
  const input = new module.exports.Input();
  const canvas = {
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    addEventListener(type, fn) { add('canvas', type, fn); },
    removeEventListener(type, fn) { remove('canvas', type, fn); },
  };
  const changes = [];
  input.onStickChange = (kind, stick) => changes.push([kind, stick.active]);
  input.attach(canvas);
  function down(id, x) { input.pd({ pointerType: 'touch', pointerId: id, clientX: x, clientY: 100, target: null }); }
  function move(id, x) { input.pm({ pointerType: 'touch', pointerId: id, clientX: x, clientY: 100 }); }
  function release(id) { input.pu({ pointerType: 'touch', pointerId: id }); }
  function held() { down(11, 100); move(11, 180); down(12, 700); move(12, 750); }
  return { input, document, events, fire, down, move, release, held, changes };
}
function resetOK(input) {
  assert.equal(input.move.active, false); assert.equal(input.aim.active, false);
  assert.equal(input.stickId.move, -1); assert.equal(input.stickId.aim, -1);
  assert.equal(input.move.dx, 0); assert.equal(input.aim.dx, 0);
  assert.equal(input.firing, false); assert.equal(input.mouseActive, false);
}
test('blur clears both held touch sticks and performance UI cache', () => {
  const { input, held, fire, changes } = boot();
  held(); assert.ok(input.move.dx > 0 && input.aim.dx > 0);
  fire('window', 'blur'); resetOK(input);
  assert.ok(changes.some(([k, a]) => k === 'move' && !a));
  assert.ok(changes.some(([k, a]) => k === 'aim' && !a));
  assert.equal(input.__novaEmittedActive?.move, false);
  assert.equal(input.__novaEmittedActive?.aim, false);
});
test('background transition releases touch without blur', () => {
  const { input, document, held, fire } = boot();
  held(); document.hidden = true; fire('document', 'visibilitychange'); resetOK(input);
});
test('visible transition does not interrupt a legitimate held stick', () => {
  const { input, document, held, fire } = boot();
  held(); document.hidden = false; fire('document', 'visibilitychange');
  assert.equal(input.move.active, true); assert.equal(input.aim.active, true);
});
test('fresh touch after blur reclaims both pointer owners', () => {
  const { input, held, fire, down } = boot();
  held(); fire('window', 'blur'); down(21, 100); down(22, 700);
  assert.equal(input.stickId.move, 21); assert.equal(input.stickId.aim, 22);
});
test('pointerup continues releasing only its own stick', () => {
  const { input, held, release } = boot();
  held(); release(11);
  assert.equal(input.move.active, false); assert.equal(input.aim.active, true);
  release(12); resetOK(input);
});
test('blur clears queued abilities and mouse fire', () => {
  const { input, fire } = boot();
  input.abilityQueued = true; input.mouseActive = true; input.firing = true;
  fire('window', 'blur'); resetOK(input); assert.equal(input.abilityQueued, false);
});
test('detach removes new visibility and blur listeners', () => {
  const { input, events } = boot();
  assert.equal(events.document.get('visibilitychange')?.size, 1);
  input.detach();
  assert.equal(events.document.get('visibilitychange')?.size, 0);
  assert.equal(events.window.get('blur')?.size, 0);
});
test('single movement stick does not produce phantom aim', () => {
  const { input, down, move, fire } = boot();
  down(11, 100); move(11, 170); fire('window', 'blur'); resetOK(input);
  assert.equal(input.__novaEmittedActive?.aim, false);
});
test('background followed by blur is idempotent', () => {
  const { input, document, held, fire, changes } = boot();
  held(); const before = changes.length;
  document.hidden = true; fire('document', 'visibilitychange');
  const after = changes.length; fire('window', 'blur');
  assert.equal(changes.length, after); assert.equal(after - before, 2); resetOK(input);
});
test('background clears aim-only stick and queued keyboard motion', () => {
  const { input, document, down, move, fire } = boot();
  down(12, 700); move(12, 750);
  input.keyboard.right = true; input.abilityQueued = true;
  document.hidden = true; fire('document', 'visibilitychange');
  resetOK(input); assert.equal(input.keyboard.right, false); assert.equal(input.abilityQueued, false);
});
test('reattach after detach registers exactly one active visibility listener', () => {
  const { input, events } = boot(); input.detach();
  const canvas = { getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }, addEventListener() {}, removeEventListener() {} };
  input.attach(canvas);
  assert.equal(events.document.get('visibilitychange')?.size, 1);
  input.detach(); assert.equal(events.document.get('visibilitychange')?.size, 0);
});

test('twenty attach/detach cycles release both legacy and new blur listeners', () => {
  const { input, events } = boot();
  const canvas = {
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    addEventListener() {},
    removeEventListener() {},
  };
  for (let cycle = 0; cycle < 20; cycle++) {
    assert.equal(events.window.get('blur')?.size, 2, 'exactly two blur handlers while attached');
    input.detach();
    assert.equal(events.window.get('blur')?.size, 0, 'no orphaned blur handlers after detach');
    input.attach(canvas);
  }
  input.detach();
  assert.equal(events.window.get('blur')?.size, 0);
  assert.equal(events.document.get('visibilitychange')?.size, 0);
});
