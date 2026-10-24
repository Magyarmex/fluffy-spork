'use strict';
// Circle awareness must not spend terrain visibility rays on candidates that
// cannot influence cohesion, local tank avoidance, or nearest-fire herding.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function scenario({ tankX = null, bullets = [], blocked = false, indexed = true,
  dt = .12, nearbyCircle = false } = {}) {
  const window = { __novaModules: {} };
  const context = { window, Math, Map, Set, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 }, console: { info() {}, error() {}, warn() {} } };
  for (const name of ['living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  const LF = window.__NOVA_LIVING_FRONT_INTERNAL__;
  const circle = { id: 1, kind: 'shape', type: 'circle', x: 0, y: 0,
    r: 12, hp: 20, vx: 0, vy: 0 };
  const other = { id: 2, kind: 'shape', type: 'circle', x: 30, y: 0,
    r: 12, hp: 20, vx: 0, vy: 0 };
  const tank = tankX == null ? null : { id: 3, kind: 'tank', x: tankX, y: 0,
    hp: 100, alive: true, vx: 0, vy: 0 };
  const g = { time: 10, shapes: nearbyCircle ? [circle, other] : [circle],
    tanks: tank ? [tank] : [], bullets, hasLineOfSight: () => !blocked };
  const rays = [];
  g.hasLineOfSight = (_ax, _ay, bx, by) => { rays.push([bx, by]); return !blocked; };
  if (indexed) {
    // Production Zero Churn hash returns entire buckets; it is not an
    // exact-radius filter. Its entity index also omits bullets.
    g.hash = { query(_x, _y, _r, out) {
      out.push(...g.shapes, ...g.tanks);
    } };
  }
  const defs = { circle: { speed: 60 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, dt);
  return { circle, st, rays };
}

const shot = (id, x, dead = false) => ({ id, kind: 'bullet', x, y: 0,
  vx: 500, vy: 0, r: 3, dead });

test('out-of-range hash-bucket tank does not trigger Circle LOS ray', () => {
  const s = scenario({ tankX: 250 });
  assert.equal(s.rays.length, 0);
  assert.equal(s.circle.vx, 0);
});

test('in-range visible tank still causes Circle avoidance', () => {
  const s = scenario({ tankX: 50 });
  assert.equal(s.rays.length, 2); // Circle awareness and canonical local herding
  assert.ok(s.circle.vx < 0);
});

test('solid terrain still blocks in-range tank avoidance', () => {
  const s = scenario({ tankX: 50, blocked: true });
  assert.equal(s.rays.length, 2);
  assert.equal(s.circle.vx, 0);
});

test('nearest visible bullet is sensed; farther bullet cannot waste a ray', () => {
  const s = scenario({ bullets: [shot(5, 40), shot(6, 100)] });
  assert.equal(s.rays.filter(p => p[0] === 40).length, 1);
  assert.equal(s.rays.filter(p => p[0] === 100).length, 0);
  assert.ok(s.st.stats.nearFireHerds > 0);
  assert.ok(s.circle.vx < 0);
});

test('dead bullet never triggers Circle visibility or disturbance', () => {
  const s = scenario({ bullets: [shot(5, 40, true)] });
  assert.equal(s.rays.length, 0);
  assert.equal(s.st.stats.nearFireHerds, 0);
});

test('valid Circle flockmate still contributes cohesion', () => {
  const s = scenario({ nearbyCircle: true });
  assert.ok(s.rays.some(p => p[0] === 30));
  assert.ok(s.circle.vx > 0);
});

test('fallback exact-radius query retains Circle cohesion and nearby fire', () => {
  const s = scenario({ indexed: false, nearbyCircle: true, bullets: [shot(5, 40)] });
  assert.ok(s.circle.vx < 0, 'fire disturbance should overcome gentle cohesion');
  assert.ok(s.st.stats.nearFireHerds > 0);
});

for (const hz of [30, 60, 120, 240]) {
  test('Circle LOS prefilter remains correct at ' + hz + 'Hz', () => {
    const s = scenario({ tankX: 250, bullets: [shot(5, 40), shot(6, 100)],
      dt: 1 / hz });
    assert.equal(s.rays.filter(p => p[0] === 250).length, 0);
    assert.equal(s.rays.filter(p => p[0] === 40).length, 1);
    assert.equal(s.rays.filter(p => p[0] === 100).length, 0);
  });
}

test('materialized production path loads the Circle instinct owner', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
