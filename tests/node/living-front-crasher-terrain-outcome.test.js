'use strict';
// Regression: a terrain-interrupted Crasher charge must register exactly one
// hit or miss regardless of whether it was in charge or overshoot.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function boot() {
  const window = { __novaModules: {} };
  const ctx = { window, Math, Map, Set, WeakMap, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 },
    console: { info() {}, warn() {}, error() {} } };
  for (const file of ['living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      ctx, { filename: file });
  return window.__NOVA_LIVING_FRONT_INTERNAL__;
}

function scenario({ phase = 'charge', hit = false, bump = .22,
  phaseT = .30, dt = .12 } = {}) {
  const LF = boot();
  const cr = { id: 1, kind: 'shape', type: 'crasher',
    x: 0, y: 0, r: 15, hp: 95, maxHp: 95, vx: 10, vy: 0,
    __lfPredatorState: phase, __lfPredatorT: phaseT,
    __lfChargeHit: hit, __lfTargetId: -1, __lfTargetKind: '',
    __lfCommitAngle: 0, __novaTerrainBumpT: bump };
  const g = { time: 10, shapes: [cr], tanks: [], bullets: [],
    hasLineOfSight: () => true };
  const defs = { crasher: { speed: 105 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, dt);
  return { LF, cr, g, defs, st, dt,
    tick() { g.time += dt; LF.behaviorTick(g, st, defs, dt); } };
}

for (const phase of ['charge', 'overshoot']) {
  for (const hit of [false, true]) {
    for (const hz of [8, 10]) {
      test(`terrain bump records one ${hit ? 'hit' : 'miss'} from ${phase} at ${hz}Hz`, () => {
        const s = scenario({ phase, hit, dt: 1 / hz });
        assert.equal(s.cr.__lfPredatorState, 'recover');
        assert.equal(s.st.stats.crasherHits, Number(hit));
        assert.equal(s.st.stats.crasherMisses, Number(!hit));
        for (let i = 0; i < 8; i++) s.tick();
        assert.equal(s.st.stats.crasherHits, Number(hit),
          'recovery/track ticks must not recount a completed charge');
        assert.equal(s.st.stats.crasherMisses, Number(!hit));
      });
    }
  }
}

for (const hit of [false, true]) {
  test(`ordinary overshoot expiry still records exactly one ${hit ? 'hit' : 'miss'}`, () => {
    const s = scenario({ phase: 'overshoot', hit, bump: 0, phaseT: .01 });
    assert.equal(s.cr.__lfPredatorState, 'recover');
    assert.equal(s.st.stats.crasherHits, Number(hit));
    assert.equal(s.st.stats.crasherMisses, Number(!hit));
  });
  test(`simultaneous overshoot expiry and bump records one ${hit ? 'hit' : 'miss'}`, () => {
    const s = scenario({ phase: 'overshoot', hit, phaseT: .01 });
    assert.equal(s.cr.__lfPredatorState, 'recover');
    assert.equal(s.st.stats.crasherHits, Number(hit));
    assert.equal(s.st.stats.crasherMisses, Number(!hit));
  });
  test(`charge-to-overshoot transition interrupted by terrain records one ${hit ? 'hit' : 'miss'}`, () => {
    const s = scenario({ phase: 'charge', hit, phaseT: .01 });
    assert.equal(s.cr.__lfPredatorState, 'recover');
    assert.equal(s.st.stats.crasherHits, Number(hit));
    assert.equal(s.st.stats.crasherMisses, Number(!hit));
  });
}

test('active charges without terrain collision are not counted as completed', () => {
  for (const phase of ['charge', 'overshoot']) {
    const s = scenario({ phase, bump: 0, phaseT: .30 });
    assert.equal(s.cr.__lfPredatorState, phase);
    assert.equal(s.st.stats.crasherHits + s.st.stats.crasherMisses, 0);
  }
});

test('Crasher telemetry fix executes in the real materialized overlay', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(html.split('src="./nova-updates/living-front-instincts-v1.12.0.js"').length - 1, 1);
  assert.ok(html.indexOf('living-front-core-v1.12.0.js') <
    html.indexOf('living-front-instincts-v1.12.0.js'));
});
