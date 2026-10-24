'use strict';
// Production Zero Churn hash returns whole buckets, not an exact-radius
// neighbor set. Circle flock cohesion must reject distant bucket occupants.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function scenario({ far = 8, near = true, nearX = 20, indexed = true, dt = .1 } = {}) {
  const window = { __novaModules: {} };
  const context = { window, Math, Map, Set, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 },
    console: { info() {}, error() {}, warn() {} } };
  for (const file of [
    'nova-updates/performance-v1.7.8.js',
    'nova-updates/living-front-core-v1.12.0.js',
    'nova-updates/living-front-instincts-v1.12.0.js'
  ]) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'),
    context, { filename: file });
  const LF = window.__NOVA_LIVING_FRONT_INTERNAL__;
  const target = { id: 1, kind: 'shape', type: 'circle',
    x: -5, y: 0, hp: 20, r: 12, vx: 0, vy: 0 };
  const distant = Array.from({ length: far }, (_, i) => ({
    id: i + 2, kind: 'shape', type: 'circle',
    x: -170 - i, y: 0, hp: 20, r: 12, vx: 0, vy: 0
  }));
  const nearby = { id: 50, kind: 'shape', type: 'circle',
    x: nearX, y: 0, hp: 20, r: 12, vx: 0, vy: 0 };
  const g = { time: 10, shapes: [target, ...distant, ...(near ? [nearby] : [])],
    bullets: [], tanks: [] };
  const rays = [];
  g.hasLineOfSight = (ax, ay, bx, by) => {
    if (ax === target.x && ay === target.y) rays.push({ bx, by });
    return true;
  };
  if (indexed) {
    const hash = window.__NOVA_PERFORMANCE_2_TEST__.optimizeHash({
      cell: 180, map: new Map()
    });
    for (const shape of g.shapes) hash.insert(shape);
    g.hash = hash;
  }
  const defs = { circle: { speed: 60 } };
  const st = LF.ensure(g, defs);
  const queried = LF.query(g, st, target.x, target.y, 145, 0).map(s => s.id);
  LF.behaviorTick(g, st, defs, dt);
  return { target, queried, rays };
}

test('real production hash returns out-of-radius circles in a bucket', () => {
  const s = scenario();
  assert.ok(s.queried.includes(2), 'distant bucket occupant should reproduce');
  assert.ok(s.queried.includes(50), 'nearby legitimate neighbor is present');
});

test('eight distant bucket occupants cannot displace a nearby flockmate', () => {
  const s = scenario();
  assert.ok(s.target.vx > 0,
    'a Circle should school toward its actual local neighbor, not a distant bucket');
});

test('a lone out-of-radius Circle does not exert false cohesion', () => {
  const s = scenario({ far: 1, near: false });
  assert.ok(Math.abs(s.target.vx) < 1e-9);
  assert.ok(Math.abs(s.target.vy) < 1e-9);
});

test('distant bucket occupants are rejected before expensive LOS calls', () => {
  const s = scenario();
  assert.equal(s.rays.filter(p => p.bx <= -170).length, 0);
});

test('exact 145-unit neighbor is included, 146-unit neighbor is excluded', () => {
  const on = scenario({ far: 0, nearX: -150 });
  const off = scenario({ far: 0, nearX: -151 });
  assert.ok(on.target.vx < 0, 'boundary is inclusive');
  assert.ok(Math.abs(off.target.vx) < 1e-9, 'outside neighbor is ignored');
});

test('fallback exact-radius query still follows the same local neighbor', () => {
  const s = scenario({ indexed: false });
  assert.ok(s.target.vx > 0);
});

for (const hz of [30, 60, 120, 240]) {
  test('dense local-cohesion radius is frame-rate stable at ' + hz + 'Hz', () => {
    assert.ok(scenario({ dt: 1 / hz }).target.vx > 0);
  });
}

test('the materialized game loads the production hash and Living Front source', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/performance-v1.7.8.js'));
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
