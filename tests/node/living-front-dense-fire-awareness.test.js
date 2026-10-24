'use strict';
// Dense Living Front schools must still sense local shots after their capped
// flock-neighbor sample is full. Exercises the production core + instincts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const files = [
  'nova-updates/living-front-core-v1.12.0.js',
  'nova-updates/living-front-instincts-v1.12.0.js'
];
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function scenario({ neighbors = 9, blocked = false, indexed = false, fire = true, distant = false } = {}) {
  const window = { __novaModules: {} };
  const context = {
    window, Math, Map, Set, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 },
    console: { info() {}, error() {}, warn() {} }
  };
  for (const file of files) {
    vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'),
      context, { filename: file });
  }
  const LF = window.__NOVA_LIVING_FRONT_INTERNAL__;
  const circle = { id: 1, kind: 'shape', type: 'circle',
    x: 0, y: 0, r: 12, hp: 20, vx: 0, vy: 0 };
  const others = Array.from({ length: neighbors }, (_, i) => ({
    id: i + 2, kind: 'shape', type: 'circle',
    x: 10 + i * 2, y: 5, r: 12, hp: 20, vx: 0, vy: 0
  }));
  const shot = { id: 500, kind: 'bullet', x: distant ? -250 : -40,
    y: 0, r: 3, dead: false, vx: 500, vy: 0 };
  const g = {
    time: 10, shapes: [circle, ...others], bullets: fire ? [shot] : [],
    tanks: [], hasLineOfSight: (_ax, _ay, bx, by) =>
      !(blocked && bx === shot.x && by === shot.y)
  };
  if (indexed) {
    // Production hash returns shapes first; Living Front appends live bullets.
    g.hash = { query(x, y, r, out) {
      for (const s of g.shapes)
        if ((s.x - x) ** 2 + (s.y - y) ** 2 <= r * r) out.push(s);
    } };
  }
  const defs = { circle: { speed: 60 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, 0.1);
  return { circle, st, g };
}

test('dense flock reacts to nearby visible fire after eight flockmates', () => {
  const s = scenario();
  assert.ok(s.circle.__lfDisturbance > 0,
    'ninth flockmate must not hide a real incoming shot');
  assert.ok(s.circle.vx > 10, 'fire response must change actual movement');
  assert.ok(s.st.stats.nearFireHerds > 0);
});

test('same dense-fire behavior works with shipping spatial hash composition', () => {
  const s = scenario({ indexed: true });
  assert.ok(s.circle.__lfDisturbance > 0,
    'bullets appended by Living Front index must still be considered');
});

test('cover still blocks dense-flock fire response', () => {
  const s = scenario({ blocked: true });
  assert.equal(s.circle.__lfDisturbance, undefined);
});

test('distant fire outside the local sensing radius is ignored', () => {
  const s = scenario({ distant: true });
  assert.equal(s.circle.__lfDisturbance, undefined);
});

test('flock cohesion still samples only eight neighbors', () => {
  const eight = scenario({ neighbors: 8, fire: false }).circle;
  const twenty = scenario({ neighbors: 20, fire: false }).circle;
  assert.ok(Math.abs(eight.vx - twenty.vx) < 1e-9);
  assert.ok(Math.abs(eight.vy - twenty.vy) < 1e-9);
});

test('the fixed instinct layer is in the actual materialized game path', () => {
  assert.match(html, /nova-updates\\/living-front-instincts-v1\\.12\\.0\\.js/);
  assert.match(html, /nova-updates\\/living-front-core-v1\\.12\\.0\\.js/);
});
