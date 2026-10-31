'use strict';
// Living Front must not turn a stale Fair Engagement target id into live radar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
function boot(withFairViewport = true) {
  /* Isolated ecology unit harness: represent a separately verified Observer
   * sight certificate. The real Spotter geometry is tested in
   * living-front-spotter-current-sight.test.js. */
  const window = { __novaModules: {},
    __NOVA_SPOTTER_LIVE_RELAY__: (g,owner,target) =>
      owner.__novaSpotterContactId===target.id &&
      owner.__novaSpotterContactUntil>g.time };
  if (withFairViewport) window.__NOVA_FAIR_ENGAGEMENT_TEST__ = {
    inGameplayViewport(g, observer, target) {
      return Math.abs(target.x - observer.x) <= g.w / (2 * g.cam.zoom) &&
        Math.abs(target.y - observer.y) <= g.h / (2 * g.cam.zoom);
    }
  };
  const context = { window, console: { info() {}, warn() {}, error() {} },
    Math, Number, Object, Array, Date, JSON, setTimeout() {}, clearTimeout() {} };
  for (const file of ['living-front-core-v1.12.0.js',
    'living-front-instincts-v1.12.0.js', 'living-front-director-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  return window.__NOVA_LIVING_FRONT_TEST__;
}
function world(targetX = 200) {
  const target = { id: 2, kind: 'tank', x: targetX, y: 0,
    alive: true, hp: 100, maxHp: 100, spawnShieldT: 0 };
  const owner = { id: 1, x: 0, y: 0, hp: 100, maxHp: 100,
    ai: { __v1112TargetId: 2 } };
  const g = { time: 10, w: 360, h: 640, cam: { zoom: 1.2 },
    tanks: [owner, target], shapes: [],
    __lfState: { signal: { type: 'BLOOM', x: 500, y: 0,
      sector: 2, until: 20 }, queryScratch: [], queryScratch2: [] },
    getTank(id) { return id === 2 ? target : null; },
    hasLineOfSight() { return true; } };
  return { g, owner, target };
}
function bias(T, w) { return T.publicEcoBias(w.g, w.owner, {}, {}); }

test('hidden held target cannot suppress a public ecological rotation', () => {
  const T = boot(), w = world(200);
  const result = bias(T, w);
  assert.equal(result.mode, 'signal');
  assert.ok(result.weight > 0.15, result.weight);
});

test('hidden target current coordinates cannot change ecological decisions', () => {
  const T = boot(), a = world(200), b = world(500);
  const one = bias(T, a), two = bias(T, b);
  assert.equal(one.mode, 'signal');
  assert.ok(Math.abs(one.weight - two.weight) < 1e-12,
    'offscreen target movement leaked into AI ecology');
  assert.ok(Math.abs(one.x - two.x) < 1e-12);
});

test('terrain-occluded held target inside viewport cannot suppress public ecology', () => {
  const T = boot(), w = world(20);
  w.g.hasLineOfSight = () => false;
  const occluded = bias(T, w);
  w.owner.ai.__v1112TargetId = -1;
  const noTarget = bias(T, w);
  assert.equal(occluded.mode, 'signal');
  assert.equal(occluded.weight, noTarget.weight,
    'occluded live target position must not change the ecological priority');
  assert.equal(occluded.x, noTarget.x);
  assert.equal(occluded.y, noTarget.y);
});
test('active Sniper Observer relay may still prioritize a terrain-occluded contact', () => {
  const T = boot(), w = world(20);
  w.g.hasLineOfSight = () => false;
  w.owner.cls = 'railgun';
  w.owner.__novaSpotterContactId = 2;
  w.owner.__novaSpotterContactUntil = 20;
  assert.equal(bias(T, w).weight, 0, 'legitimate live Observer relay still authorizes combat priority');
  w.owner.__novaSpotterContactUntil = 9;
  assert.ok(bias(T, w).weight > .15, 'expired relay is not current sight');
});
test('visible nearby enemy remains a legitimate combat priority', () => {
  const T = boot(), w = world(20);
  assert.equal(bias(T, w).weight, 0);
});

test('rotating a phone or changing zoom updates legitimate target visibility', () => {
  const T = boot(), w = world(200);
  assert.ok(bias(T, w).weight > 0.15, 'portrait: target should be offscreen');
  w.g.w = 640; w.g.h = 360;
  assert.equal(bias(T, w).weight, 0, 'landscape: same target should be visible');
  w.g.w = 360; w.g.h = 640; w.g.cam.zoom = 0.5;
  assert.equal(bias(T, w).weight, 0, 'zoomed out: target should be visible');
  w.g.cam.zoom = 1.2;
  assert.ok(bias(T, w).weight > 0.15, 'zoomed in: target should be hidden');
});

test('valid Sniper Observer relay permits remote combat priority', () => {
  const T = boot(), w = world(200);
  w.owner.cls = 'railgun';
  w.owner.__novaSpotterContactId = 2;
  w.owner.__novaSpotterContactUntil = 20;
  assert.equal(bias(T, w).weight, 0);
  w.owner.__novaSpotterContactUntil = 9;
  assert.ok(bias(T, w).weight > 0.15,
    'expired Observer contact must not grant remote knowledge');
});

test('stale Observer fields on a non-Sniper never grant remote radar', () => {
  const T = boot(), w = world(200);
  w.owner.cls = 'carrier';
  w.owner.__novaSpotterContactId = 2;
  w.owner.__novaSpotterContactUntil = 20;
  assert.ok(bias(T, w).weight > 0.15);
});

test('spawn-protected and allied former targets do not suppress ecology', () => {
  const T = boot(), w = world(20);
  w.target.spawnShieldT = 1;
  assert.ok(bias(T, w).weight > 0.15);
  w.target.spawnShieldT = 0;
  w.g.areAllies = (a, b) => a.id === 1 && b.id === 2;
  assert.ok(bias(T, w).weight > 0.15);
  delete w.g.areAllies;
  w.g.areHostile = () => false;
  assert.ok(bias(T, w).weight > 0.15);
});

test('visible distant enemy still moderates but does not cancel ecology', () => {
  const T = boot(), w = world(500);
  w.g.w = 1200;
  const distant = bias(T, w).weight;
  w.owner.ai.__v1112TargetId = -1;
  const noTarget = bias(T, w).weight;
  assert.ok(distant > 0 && distant < noTarget);
  assert.ok(Math.abs(distant / noTarget - .55) < 1e-12);
});

test('fallback viewport geometry works without Fair Engagement test export', () => {
  const T = boot(false), w = world(200);
  assert.ok(bias(T, w).weight > 0.15);
  w.g.w = 800;
  assert.equal(bias(T, w).weight, 0);
});
