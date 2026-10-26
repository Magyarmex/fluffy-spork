'use strict';
// Living Front triangles must not dodge or herd from projectiles that have
// already died/expired but remain in a stale broadphase bucket this frame.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function scenario(shots, visible = () => true, type = 'triangle') {
  const window = { __novaModules: {} };
  const ctx = { window, Math, Map, Set, WeakMap, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 },
    console: { info() {}, error() {}, warn() {} } };
  for (const file of ['living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      ctx, { filename: file });
  const LF = window.__NOVA_LIVING_FRONT_INTERNAL__;
  const s = { id: 3, kind: 'shape', type, x: 0, y: 0,
    r: 16, hp: 30, vx: 0, vy: 0 };
  const rays = [];
  const g = { time: 10, shapes: [s], bullets: [], tanks: [],
    // Zero Churn hash is a broadphase snapshot: entries can outlive the
    // projectile until the next spatial rebuild.
    hash: { query(_x, _y, _r, out) { out.push(...shots); } },
    hasLineOfSight(_x, _y, x, y) { rays.push([x, y]); return visible(x, y); } };
  const defs = { triangle: { speed: 90 }, circle: { speed: 60 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, 1 / 60);
  return { s, rays, st };
}
function shot(id, x, opts = {}) {
  return { id, kind: 'bullet', x, y: 0, vx: 0, vy: 0,
    ttl: 1, r: 3, dead: false, shell: false, ...opts };
}

test('dead projectile still in the spatial bucket cannot herd a triangle', () => {
  const { s, rays, st } = scenario([shot(1, 30, { dead: true })]);
  assert.equal(rays.length, 0, 'dead rounds must not spend terrain visibility rays');
  assert.equal(st.stats.nearFireHerds, 0);
  assert.equal(s.__lfDisturbance, undefined);
  assert.equal(s.vx, 0);
});

test('expired ordinary projectile cannot trigger a ghost fire response', () => {
  const { s, rays, st } = scenario([shot(1, 30, { ttl: 0 })]);
  assert.equal(rays.length, 0);
  assert.equal(st.stats.nearFireHerds, 0);
  assert.equal(s.__lfDisturbance, undefined);
});

test('dead closer round cannot mask the actual nearest live round', () => {
  const live = shot(2, 70);
  const expected = scenario([live]);
  const mixed = scenario([shot(1, 10, { dead: true }), live]);
  assert.equal(mixed.rays.length, expected.rays.length);
  assert.equal(mixed.st.stats.nearFireHerds, 1);
  assert.ok(Math.abs(mixed.s.vx - expected.s.vx) < 1e-9);
  assert.ok(Math.abs(mixed.s.vy - expected.s.vy) < 1e-9);
});

test('active visible fire still herds and occluded fire does not', () => {
  const visible = scenario([shot(1, 40)]);
  const blocked = scenario([shot(1, 40)], () => false);
  assert.equal(visible.st.stats.nearFireHerds, 1);
  assert.ok(visible.s.vx < 0);
  assert.equal(blocked.st.stats.nearFireHerds, 0);
  assert.equal(blocked.s.vx, 0);
});

test('dead projectile never suppresses a real incoming dodge', () => {
  const incoming = shot(2, -100, { vx: 500, ttl: .4 });
  const expected = scenario([incoming]);
  const mixed = scenario([shot(1, -10, { dead: true }), incoming]);
  assert.equal(expected.st.stats.triangleEvasions, 1);
  assert.equal(mixed.st.stats.triangleEvasions, 1);
  assert.equal(mixed.s.__lfEvadeDirX, expected.s.__lfEvadeDirX);
  assert.equal(mixed.s.__lfEvadeDirY, expected.s.__lfEvadeDirY);
});


test('expired ordinary shot cannot herd a Circle or conceal live fire', () => {
  const expired = shot(1, 10, { ttl: 0 });
  const live = shot(2, 70);
  const noFire = scenario([expired], () => true, 'circle');
  assert.equal(noFire.rays.length, 0);
  assert.equal(noFire.st.stats.nearFireHerds, 0);
  assert.equal(noFire.s.__lfDisturbance, undefined);
  const reference = scenario([live], () => true, 'circle');
  const mixed = scenario([expired, live], () => true, 'circle');
  assert.equal(mixed.st.stats.nearFireHerds, 1);
  assert.ok(Math.abs(mixed.s.vx - reference.s.vx) < 1e-9);
  assert.ok(Math.abs(mixed.s.vy - reference.s.vy) < 1e-9);
});


test('seeded neutral perception matches a reference with stale rounds removed', () => {
  const window = { __novaModules: {} };
  const ctx = { window, Math, Map, Set, WeakMap, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 },
    console: { info() {}, error() {}, warn() {} } };
  for (const file of ['living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      ctx, { filename: file });
  const LF = window.__NOVA_LIVING_FRONT_INTERNAL__;
  const defs = { triangle: { speed: 90 }, circle: { speed: 60 } };
  const visible = (x, y) => Math.floor(Math.abs(x) * .13 + Math.abs(y) * .17) % 7 !== 0;
  function run(type, shots) {
    const s = { id: 3, kind: 'shape', type, x: 0, y: 0, r: 16,
      hp: 30, vx: 0, vy: 0 };
    let rays = 0;
    const g = { time: 10, shapes: [s], bullets: [], tanks: [],
      hash: { query(_x, _y, _r, out) { out.push(...shots); } },
      hasLineOfSight(_x, _y, x, y) { rays++; return visible(x, y); } };
    const st = LF.ensure(g, defs);
    LF.behaviorTick(g, st, defs, 1 / 60);
    return { vx: s.vx, vy: s.vy, disturbance: s.__lfDisturbance || 0,
      evades: st.stats.triangleEvasions, herds: st.stats.nearFireHerds,
      dirX: s.__lfEvadeDirX || 0, dirY: s.__lfEvadeDirY || 0, rays };
  }
  let seed = 0x3702026;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  let invalid = 0, meaningful = 0;
  for (let world = 0; world < 1200; world++) {
    const shots = Array.from({ length: 4 + Math.floor(rand() * 22) }, (_, i) => {
      const dead = rand() < .25, expired = rand() < .25, shell = rand() < .15;
      const b = { id: i + 10, kind: 'bullet', x: (rand() - .5) * 440,
        y: (rand() - .5) * 440, vx: (rand() - .5) * 1200,
        vy: (rand() - .5) * 1200, r: 3, dead, shell,
        ttl: expired ? 0 : .01 + rand() * .6 };
      if (dead || (expired && !shell)) invalid++;
      return b;
    });
    const filtered = shots.filter(b => !b.dead && (b.shell || !Number.isFinite(b.ttl) || b.ttl > 0));
    for (const type of ['circle', 'triangle']) {
      const expected = run(type, filtered), actual = run(type, shots);
      assert.deepEqual(actual, expected, 'stale round altered ' + type + ' in world ' + world);
      if (actual.herds || actual.evades) meaningful++;
    }
  }
  assert.ok(invalid > 3000, 'exercise real stale projectile pressure');
  assert.ok(meaningful > 200, 'exercise genuine responses, not just empty scenes');
});

test('fix belongs to the materialized shipping Living Front overlay', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
