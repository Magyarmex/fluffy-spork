'use strict';
// Living Front Triangle evasion is a projectile-specific commitment.
// Fast tanks and neutral shapes have velocity, but are not bullets.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function scenario(kind, { indexed = false, blocked = false, dt = 1 / 60 } = {}) {
  const window = { __novaModules: {} };
  const context = { window, Math, Map, Set, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 }, console: { info() {}, error() {}, warn() {} } };
  for (const name of ['living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  const LF = window.__NOVA_LIVING_FRONT_INTERNAL__;
  const tri = { id: 3, kind: 'shape', type: 'triangle', x: 0, y: 0,
    r: 16, hp: 30, vx: 0, vy: 0 };
  const candidate = { id: 9, kind, type: kind === 'shape' ? 'circle' : undefined,
    x: -100, y: 0, vx: 500, vy: 0, r: 4, hp: 50, alive: true,
    ttl: .3, dead: false };
  const g = { time: 10, shapes: [tri, ...(kind === 'shape' ? [candidate] : [])],
    tanks: kind === 'tank' ? [candidate] : [],
    bullets: kind === 'bullet' ? [candidate] : [],
    hasLineOfSight: () => !blocked };
  if (indexed) {
    g.hash = { query(x, y, r, out) {
      for (const e of [...g.shapes, ...g.tanks])
        if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) out.push(e);
    } };
  }
  const defs = { triangle: { speed: 90 }, circle: { speed: 60 } };
  const st = LF.ensure(g, defs);
  const threat = LF.bulletThreat(tri, candidate, .34, 20);
  LF.behaviorTick(g, st, defs, dt);
  return { tri, candidate, st, threat };
}

for (const kind of ['tank', 'shape']) {
  for (const indexed of [false, true]) {
    test('fast ' + kind + ' does not consume Triangle projectile dodge (indexed=' + indexed + ')', () => {
      const s = scenario(kind, { indexed });
      assert.equal(s.threat, 0, 'non-projectile velocity is not a projectile threat');
      assert.equal(s.st.stats.triangleEvasions, 0, 'only projectiles can trigger the committed evade');
      assert.equal(s.tri.__lfEvadeUntil, undefined);
      assert.equal(s.tri.__lfEvadeReady, undefined);
    });
  }
}

test('a real visible incoming projectile still triggers the committed dodge', () => {
  for (const indexed of [false, true]) {
    const s = scenario('bullet', { indexed });
    assert.ok(s.threat > .13);
    assert.equal(s.st.stats.triangleEvasions, 1);
    assert.ok(s.tri.__lfEvadeUntil > 10);
  }
});

test('terrain occlusion still prevents projectile-triggered dodges', () => {
  assert.equal(scenario('bullet', { blocked: true }).st.stats.triangleEvasions, 0);
});

for (const hz of [30, 60, 120, 240]) {
  test('non-projectile rejection remains stable at ' + hz + ' Hz', () => {
    for (const kind of ['tank', 'shape'])
      assert.equal(scenario(kind, { dt: 1 / hz }).st.stats.triangleEvasions, 0);
    assert.equal(scenario('bullet', { dt: 1 / hz }).st.stats.triangleEvasions, 1);
  });
}

test('actual shipping game includes the fixed Living Front instinct module', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
  assert.ok(html.includes('nova-updates/living-front-core-v1.12.0.js'));
});
