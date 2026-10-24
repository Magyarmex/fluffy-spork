'use strict';
// A Crasher's visible telegraph is a commitment to the actual charge vector.
// Do not silently snap to the target's new position on the launch tick.
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

function scenario({ angle = 0, targetX = 0, targetY = 150, ttl = .01,
  dt = .12, blocked = false, bump = 0 } = {}) {
  const LF = boot();
  const cr = { id: 1, kind: 'shape', type: 'crasher',
    x: 0, y: 0, hp: 95, r: 15, vx: 10, vy: 0,
    __lfPredatorState: 'telegraph', __lfPredatorT: ttl,
    __lfTargetId: 2, __lfTargetKind: 'tank',
    __lfCommitAngle: angle, __novaTerrainBumpT: bump };
  const target = { id: 2, kind: 'tank', x: targetX, y: targetY,
    hp: 100, r: 18, alive: true };
  const g = { time: 10, shapes: [cr], tanks: [target], bullets: [],
    getTank: id => id === 2 ? target : null,
    hasLineOfSight: () => !blocked };
  const defs = { crasher: { speed: 105 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, dt);
  return { LF, cr, target, g, st, defs };
}

function angleError(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

test('Crasher launches along its last visible telegraph, not the new target bearing', () => {
  const s = scenario({ angle: 0, targetX: 0, targetY: 150 });
  assert.equal(s.cr.__lfPredatorState, 'charge');
  assert.equal(s.st.stats.crasherCharges, 1);
  assert.ok(angleError(s.cr.__lfCommitAngle, 0) < 1e-9);
  assert.ok(s.cr.vx > 100, 'charge must follow the telegraphed eastward line');
  assert.ok(Math.abs(s.cr.vy) < 1e-9);
});

test('Crasher does not reverse a telegraphed charge at the last instant', () => {
  const s = scenario({ angle: Math.PI / 2, targetX: 0, targetY: -150 });
  assert.ok(angleError(s.cr.__lfCommitAngle, Math.PI / 2) < 1e-9);
  assert.ok(s.cr.vy > 100);
});

test('telegraph still tracks a visible target until the final commitment tick', () => {
  const s = scenario({ angle: 0, targetX: 0, targetY: 150, ttl: .30 });
  assert.equal(s.cr.__lfPredatorState, 'telegraph');
  assert.ok(angleError(s.cr.__lfCommitAngle, Math.PI / 2) < 1e-9);
  s.target.x = -150;
  s.target.y = 0;
  s.cr.__lfPredatorT = .01;
  s.LF.behaviorTick(s.g, s.st, s.defs, .12);
  assert.equal(s.cr.__lfPredatorState, 'charge');
  assert.ok(angleError(s.cr.__lfCommitAngle, Math.PI / 2) < 1e-9,
    'launch must not silently rotate after the last visible telegraph');
});

test('a target lost behind cover does not alter a stored zero-angle telegraph', () => {
  const s = scenario({ angle: 0, targetX: 0, targetY: 150, blocked: true });
  assert.equal(s.cr.__lfPredatorState, 'charge');
  assert.ok(angleError(s.cr.__lfCommitAngle, 0) < 1e-9);
  assert.ok(s.cr.vx > 100);
});

test('charge remains terrain-interruptible', () => {
  const s = scenario({ angle: 0, targetX: 0, targetY: 150, bump: .22 });
  assert.equal(s.cr.__lfPredatorState, 'recover');
  assert.ok(Math.hypot(s.cr.vx, s.cr.vy) < 50);
});

for (const hz of [30, 60, 120, 240]) {
  test('telegraph-to-charge heading remains stable at ' + hz + 'Hz', () => {
    const s = scenario({ angle: -.5, targetX: 0, targetY: 150,
      ttl: .001, dt: 1 / hz });
    assert.equal(s.cr.__lfPredatorState, 'charge');
    assert.ok(angleError(s.cr.__lfCommitAngle, -.5) < 1e-9);
    assert.ok(angleError(Math.atan2(s.cr.vy, s.cr.vx), -.5) < 1e-9);
  });
}

test('materialized NOVA TANKS actually loads the Crasher instinct owner', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
