'use strict';
// Ecological AI should use a public Rogue Star spawn signal, then only
// its own last *visible* observation; no invisible live-position tracking.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
function boot() {
  const window = { __novaModules: {}, __NOVA_FAIR_ENGAGEMENT_TEST__: {
    inGameplayViewport(g, t, s) {
      return Math.abs(s.x - t.x) <= g.w / (2 * g.cam.zoom) &&
        Math.abs(s.y - t.y) <= g.h / (2 * g.cam.zoom);
    }
  } };
  const context = { window, console: { info() {}, warn() {}, error() {} },
    Math, Number, Object, Array, Date, JSON, Map, Set,
    performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} };
  for (const name of ['living-front-core-v1.12.0.js',
    'living-front-instincts-v1.12.0.js', 'living-front-director-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  return window.__NOVA_LIVING_FRONT_TEST__;
}
function world() {
  const owner = { id: 1, x: 0, y: 0, hp: 100, maxHp: 100,
    ai: { __v1112TargetId: -1 } };
  const star = { id: 77, kind: 'shape', type: 'star',
    x: 0, y: 150, hp: 100, r: 24 };
  const signal = { type: 'ROGUE STAR', starId: 77,
    x: 300, y: 0, until: 110 };
  const g = { time: 100, w: 360, h: 640, cam: { zoom: 1 },
    tanks: [owner], shapes: [star],
    __lfState: { signal, queryScratch: [], queryScratch2: [] },
    getShape(id) { return id === star.id ? star : null; },
    hasLineOfSight() { return true; } };
  return { owner, star, signal, g };
}
const bias = (T, w) => T.publicEcoBias(w.g, w.owner, {}, {});

test('visible Star position becomes the last-seen destination after it leaves view', () => {
  const T = boot(), w = world();
  assert.equal(bias(T, w).y, 1);
  w.star.x = -500; w.star.y = 0;
  const hidden = bias(T, w);
  assert.equal(hidden.x, 0);
  assert.equal(hidden.y, 1, 'last-seen position, not hidden live position or spawn');
  assert.equal(w.owner.ai.__lfStarSeenX, 0);
  assert.equal(w.owner.ai.__lfStarSeenY, 150);
});

test('cover break preserves last observation without updating it', () => {
  const T = boot(), w = world();
  bias(T, w);
  w.star.x = -150; w.star.y = 0;
  w.g.hasLineOfSight = () => false;
  const hidden = bias(T, w);
  assert.equal(hidden.x, 0);
  assert.equal(hidden.y, 1);
  assert.equal(w.owner.ai.__lfStarSeenX, 0);
});

test('a new Rogue Star cannot inherit another Star\'s last-seen position', () => {
  const T = boot(), w = world();
  bias(T, w);
  w.signal.starId = 78; w.star.id = 78;
  w.star.x = -500; w.star.y = 0;
  const next = bias(T, w);
  assert.equal(next.x, 1);
  assert.equal(next.y, 0);
});

test('an AI that never saw the Star only follows the public spawn signal', () => {
  const T = boot(), w = world();
  w.star.x = -500; w.star.y = 0;
  const result = bias(T, w);
  assert.equal(result.x, 1);
  assert.equal(result.y, 0);
  assert.equal(w.owner.ai.__lfStarSeenId, undefined);
});

test('a second AI does not inherit the first AI\'s private observation', () => {
  const T = boot(), a = world(), b = world();
  bias(T, a);
  b.star.x = -500; b.star.y = 0;
  assert.equal(bias(T, b).x, 1);
  a.star.x = -500; a.star.y = 0;
  assert.equal(bias(T, a).y, 1);
});

test('a new visible observation replaces the last seen direction', () => {
  const T = boot(), w = world();
  bias(T, w);
  w.star.x = -500; w.star.y = 0;
  assert.equal(bias(T, w).y, 1);
  w.star.x = 0; w.star.y = -150;
  assert.equal(bias(T, w).y, -1);
  w.star.x = -500; w.star.y = 0;
  assert.equal(bias(T, w).y, -1);
});

test('expired public signal cannot sustain last-seen tracking', () => {
  const T = boot(), w = world();
  bias(T, w);
  w.g.time = 111;
  w.star.x = -500;
  const result = bias(T, w);
  assert.equal(result.weight, 0);
  assert.equal(result.mode, 'none');
});

test('invalid cached coordinates never create a navigation direction', () => {
  const T = boot(), w = world();
  w.owner.ai.__lfStarSeenId = 77;
  w.owner.ai.__lfStarSeenX = Infinity;
  w.owner.ai.__lfStarSeenY = NaN;
  w.star.x = -500;
  const result = bias(T, w);
  assert.equal(result.x, 1);
  assert.equal(result.y, 0);
});

for (const hz of [30, 60, 120, 240]) {
  test('last-seen Star pursuit remains stable at ' + hz + 'Hz', () => {
    const T = boot(), w = world();
    bias(T, w);
    w.star.x = -500; w.star.y = 0;
    w.g.time += 1 / hz;
    assert.equal(bias(T, w).y, 1);
  });
}

test('real materialized game includes the updated Director layer', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
});
