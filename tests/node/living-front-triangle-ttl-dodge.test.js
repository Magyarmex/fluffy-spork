'use strict';
// A triangle should not spend its one committed dodge on an ordinary shot
// whose lifetime ends before the projectile can enter its collision envelope.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function scenario(ttl, { shell = false, dt = 1 / 60, blocked = false } = {}) {
  const window = { __novaModules: {} };
  const context = { window, Math, Map, Set, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 },
    console: { info() {}, error() {}, warn() {} } };
  for (const name of ['living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  }
  const LF = window.__NOVA_LIVING_FRONT_INTERNAL__;
  const triangle = { id: 3, kind: 'shape', type: 'triangle',
    x: 0, y: 0, r: 16, hp: 30, vx: 0, vy: 0 };
  const shot = { id: 9, kind: 'bullet', x: -100, y: 0,
    vx: 500, vy: 0, r: 4, dead: false, ttl, shell };
  const g = { time: 10, shapes: [triangle], bullets: [shot], tanks: [],
    hasLineOfSight: () => !blocked };
  const defs = { triangle: { speed: 90 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, dt);
  return { triangle, shot, g, st, score: LF.bulletThreat(triangle, shot, 0.34, 20) };
}

test('short-lived ordinary shot cannot trigger an impossible triangle dodge', () => {
  const s = scenario(0.02);
  assert.equal(s.score, 0);
  assert.equal(s.st.stats.triangleEvasions, 0);
  assert.equal(s.triangle.__lfEvadeUntil, undefined);
});

test('a shot that expires before entering the collision envelope is ignored', () => {
  const s = scenario(0.10);
  assert.equal(s.score, 0);
  assert.equal(s.st.stats.triangleEvasions, 0);
});

test('shot expiring after first physical contact remains a credible threat', () => {
  // Closest approach is t=.20s, but the 40-unit collision envelope is
  // entered at t=.12s. A TTL of .16s must NOT suppress the dodge.
  const s = scenario(0.16);
  assert.ok(s.score > 0.13);
  assert.equal(s.st.stats.triangleEvasions, 1);
});

test('ordinary long-lived shots preserve the existing committed dodge', () => {
  const s = scenario(0.30);
  assert.ok(s.score > 0.13);
  assert.equal(s.st.stats.triangleEvasions, 1);
});

test('short-fuse Bomber shells remain conservatively threatening', () => {
  const s = scenario(0.02, { shell: true });
  assert.ok(s.score > 0.13);
  assert.equal(s.st.stats.triangleEvasions, 1);
});

test('unknown TTL preserves the historical trajectory estimate', () => {
  const s = scenario(undefined);
  assert.ok(s.score > 0.13);
  assert.equal(s.st.stats.triangleEvasions, 1);
});

test('expired ordinary projectiles do not cause dodges', () => {
  const s = scenario(0);
  assert.equal(s.score, 0);
  assert.equal(s.st.stats.triangleEvasions, 0);
});

for (const hz of [30, 60, 120, 240]) {
  test('short-TTL dodge gate stays consistent at ' + hz + 'Hz', () => {
    assert.equal(scenario(0.02, { dt: 1 / hz }).st.stats.triangleEvasions, 0);
    assert.equal(scenario(0.16, { dt: 1 / hz }).st.stats.triangleEvasions, 1);
  });
}

test('terrain occlusion remains authoritative', () => {
  const s = scenario(0.3, { blocked: true });
  assert.equal(s.st.stats.triangleEvasions, 0);
});

test('production materializer loads the same Living Front instinct source', () => {
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
