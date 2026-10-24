'use strict';
// Neutral herding must not cast terrain rays at tanks outside its physical
// reaction radius. The LOS result matters only for an in-range candidate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function boot() {
  const window = { __novaModules: {} };
  const context = { window, Math, Map, Set, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 }, console: { info() {}, error() {}, warn() {} } };
  for (const name of ['living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  return window.__NOVA_LIVING_FRONT_INTERNAL__;
}

function scenario(LF, tanks, { type = 'triangle', blocked = () => false } = {}) {
  const shape = { id: 1, kind: 'shape', type, x: 0, y: 0, hp: 30,
    r: 16, vx: 0, vy: 0 };
  const rays = [];
  const g = { time: 10, shapes: [shape], bullets: [], tanks,
    hasLineOfSight: (ax, ay, bx, by) => {
      rays.push([bx, by]);
      return !blocked(bx, by);
    } };
  const defs = { triangle: { speed: 90 }, circle: { speed: 60 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, .12);
  return { shape, rays };
}

test('far tanks cause zero terrain rays in Triangle herding', () => {
  const LF = boot();
  const tanks = Array.from({ length: 100 }, (_, i) => ({
    id: i + 2, kind: 'tank', alive: true, hp: 100,
    x: 250 + i * 10, y: 200, vx: 0, vy: 0 }));
  const { shape, rays } = scenario(LF, tanks);
  assert.equal(rays.length, 0, '100 out-of-range tanks must not trigger LOS');
  assert.equal(shape.vx, 0);
  assert.equal(shape.vy, 0);
});

test('one nearby tank gets one ray; distant tanks do not consume rays', () => {
  const LF = boot();
  const near = { id: 2, kind: 'tank', hp: 100, x: 50, y: 0 };
  const far = Array.from({ length: 100 }, (_, i) => ({
    id: i + 3, kind: 'tank', hp: 100, x: -400 - i * 4, y: 0 }));
  const { shape, rays } = scenario(LF, [...far, near]);
  assert.equal(rays.length, 1);
  assert.deepEqual(rays[0], [50, 0]);
  assert.ok(shape.vx < 0, 'nearby visible tank still repels Triangle');
});

test('nearby tank behind solid terrain causes no physical herding', () => {
  const LF = boot();
  const near = { id: 2, kind: 'tank', hp: 100, x: 50, y: 0 };
  const { shape, rays } = scenario(LF, [near], { blocked: () => true });
  assert.equal(rays.length, 1);
  assert.equal(shape.vx, 0);
  assert.equal(shape.vy, 0);
});

test('exact physical radius boundary excludes the tank before LOS', () => {
  const LF = boot();
  const { rays } = scenario(LF, [
    { id: 2, kind: 'tank', hp: 100, x: 115, y: 0 },
    { id: 3, kind: 'tank', hp: 100, x: 0, y: 0 },
    { id: 4, kind: 'tank', hp: 100, x: 114.9, y: 0 } ]);
  assert.equal(rays.length, 1);
  assert.deepEqual(rays[0], [114.9, 0]);
});

test('neutral herding motion preserves the original bounded force formula', () => {
  const LF = boot();
  let seed = 81237;
  function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  for (let k = 0; k < 600; k++) {
    const tanks = Array.from({ length: 12 }, (_, i) => ({
      id: i + 2, kind: 'tank', hp: 100, x: (rnd() - .5) * 1100,
      y: (rnd() - .5) * 1100, alive: rnd() > .1 }));
    const visible = (x, y) => Math.sin(x * .037 + y * .013) > -.4;
    let fx = 0, fy = 0, expectedRays = 0;
    for (const t of tanks) {
      if (t.alive === false) continue;
      const d = Math.hypot(t.x, t.y);
      if (d >= 115 || d < 1) continue;
      expectedRays++;
      if (!visible(t.x, t.y)) continue;
      const q = 1 - d / 115;
      fx += -t.x / d * q * .85;
      fy += -t.y / d * q * .85;
    }
    const { shape, rays } = scenario(LF, tanks, { blocked: (x, y) => !visible(x, y) });
    assert.equal(rays.length, expectedRays, 'only in-range tanks may cast rays');
    assert.ok(Math.abs(shape.vx - fx) < 1e-9, 'x herding force must not change');
    assert.ok(Math.abs(shape.vy - fy) < 1e-9, 'y herding force must not change');
  }
});

test('production materializer loads the optimized Living Front instincts', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
