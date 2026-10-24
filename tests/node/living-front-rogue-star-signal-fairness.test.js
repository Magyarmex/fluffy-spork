'use strict';
// A public ROGUE STAR signal reveals its original spawn location, not a
// continuous remote feed of a moving Star behind cover or outside view.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function boot(fair = true) {
  const window = { __novaModules: {} };
  if (fair) window.__NOVA_FAIR_ENGAGEMENT_TEST__ = {
    inGameplayViewport(g, observer, shape) {
      return Math.abs(shape.x - observer.x) <= g.w / (2 * g.cam.zoom) &&
        Math.abs(shape.y - observer.y) <= g.h / (2 * g.cam.zoom);
    }
  };
  const context = { window, console: { info() {}, warn() {}, error() {} },
    Math, Number, Object, Array, Date, JSON, Map, Set,
    performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} };
  for (const name of ['living-front-core-v1.12.0.js',
    'living-front-instincts-v1.12.0.js',
    'living-front-director-v1.12.0.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  }
  return window.__NOVA_LIVING_FRONT_TEST__;
}

function world(x, y, { blocked = false, zoom = 1, width = 360,
  height = 640, missing = false } = {}) {
  const star = { id: 77, kind: 'shape', type: 'star',
    x, y, r: 24, hp: 100 };
  const owner = { id: 1, kind: 'tank', x: 0, y: 0,
    hp: 100, maxHp: 100, alive: true, ai: { __v1112TargetId: -1 } };
  const signal = { type: 'ROGUE STAR', starId: 77,
    x: 300, y: 0, started: 98, until: 110 };
  const g = { time: 100, w: width, h: height, cam: { zoom },
    tanks: [owner], shapes: missing ? [] : [star],
    __lfState: { signal, queryScratch: [], queryScratch2: [] },
    getShape(id) { return !missing && id === 77 ? star : null; },
    hasLineOfSight() { return !blocked; } };
  return { g, owner, star, signal };
}
function bias(T, w) { return T.publicEcoBias(w.g, w.owner, {}, {}); }

test('unseen Rogue Star movements cannot steer AI using hidden live coordinates', () => {
  const T = boot();
  const a = bias(T, world(0, 500)), b = bias(T, world(-500, 0));
  const c = bias(T, world(500, 0));
  for (const v of [a, b, c]) {
    assert.equal(v.mode, 'signal');
    assert.equal(v.key, 'ROGUE STAR:77');
    assert.equal(v.x, 1, 'must follow the publicly announced eastward spawn');
    assert.equal(v.y, 0);
    assert.ok(v.weight > .2);
  }
  assert.equal(a.weight, b.weight);
  assert.equal(b.weight, c.weight);
});

test('visible moving Rogue Star remains a legitimate local tactical target', () => {
  const T = boot(), w = world(0, 150), v = bias(T, w);
  assert.equal(v.mode, 'signal');
  assert.equal(v.x, 0);
  assert.equal(v.y, 1);
  assert.ok(v.weight > .2);
});

test('cover blocks remote tracking even inside the gameplay viewport', () => {
  const T = boot(), v = bias(T, world(0, 150, { blocked: true }));
  assert.equal(v.x, 1);
  assert.equal(v.y, 0);
});

test('zooming out legitimately reveals and updates a Star route', () => {
  const T = boot(), w = world(0, 500);
  assert.equal(bias(T, w).x, 1);
  w.g.cam.zoom = .3;
  assert.equal(bias(T, w).x, 0);
  assert.equal(bias(T, w).y, 1);
  w.g.cam.zoom = 1;
  assert.equal(bias(T, w).x, 1);
});

test('portrait and landscape share the Fair Engagement visibility contract', () => {
  const T = boot(), w = world(250, 150);
  assert.equal(bias(T, w).x, 1, 'portrait hides the moving Star');
  w.g.w = 640; w.g.h = 360;
  const v = bias(T, w);
  assert.ok(v.x > .8 && v.y > .4, 'landscape reveals its actual bearing');
});

test('fallback viewport calculation remains fair without test export', () => {
  const T = boot(false), w = world(0, 500);
  assert.equal(bias(T, w).x, 1);
  w.g.cam.zoom = .3;
  assert.equal(bias(T, w).y, 1);
});

test('a missing Star cannot turn a stale signal into an invented target', () => {
  const T = boot(), v = bias(T, world(0, 500, { missing: true }));
  assert.equal(v.weight, 0);
  assert.equal(v.mode, 'none');
});

test('the public signal position remains immutable during local observation', () => {
  const T = boot(), w = world(0, 150);
  bias(T, w);
  assert.equal(w.signal.x, 300);
  assert.equal(w.signal.y, 0);
  w.star.x = -500;
  const v = bias(T, w);
  assert.equal(v.x, 1);
  assert.equal(w.signal.x, 300);
});

test('the shipping runtime loads the same Living Front director', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-core-v1.12.0.js'));
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
  assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
});
