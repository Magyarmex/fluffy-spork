'use strict';
// Crashers should not lock onto an invulnerable spawn. Their charge is
// an announced physical commitment, so an already-telegraphed charge stays committed.
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

function scenario({ shield = 0, neutral = false, held = false, telegraph = false, dt = 1/60 } = {}) {
  const LF = boot();
  const cr = { id: 11, kind: 'shape', type: 'crasher', x: 0, y: 0,
    hp: 95, r: 15, vx: 10, vy: 0, angle: 0, __lfPredatorState: telegraph ? 'telegraph' : 'track',
    __lfPredatorT: telegraph ? .01 : .2, __lfTargetId: held || telegraph ? 12 : -1,
    __lfTargetKind: held || telegraph ? 'tank' : '', __lfCommitAngle: 0 };
  const tank = { id: 12, kind: 'tank', x: 100, y: 0,
    hp: 10, maxHp: 100, r: 18, alive: true, spawnShieldT: shield };
  const square = { id: 13, kind: 'shape', type: 'square', x: 125, y: 0,
    hp: 8, maxHp: 40, r: 14, vx: 0, vy: 0 };
  const g = { time: 10, shapes: neutral ? [cr, square] : [cr],
    tanks: [tank], bullets: [], getTank: id => id === 12 ? tank : null,
    getShape: id => id === 13 && neutral ? square : null,
    hasLineOfSight: () => true };
  const defs = { crasher: { speed: 105 }, square: { xp: 40, speed: 0 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, dt);
  return { cr, tank, square, g, st };
}

test('unshielded vulnerable tank remains legitimate Crasher prey', () => {
  const { cr } = scenario();
  assert.equal(cr.__lfTargetId, 12);
  assert.equal(cr.__lfTargetKind, 'tank');
});

test('spawn-shielded tank alone cannot bait a new Crasher telegraph', () => {
  const { cr, st } = scenario({ shield: 2 });
  assert.equal(cr.__lfTargetId, -1);
  assert.equal(cr.__lfPredatorState, 'track');
  assert.equal(st.stats.crasherCharges, 0);
});

test('Crasher prefers exposed neutral prey over an invulnerable spawn', () => {
  const { cr } = scenario({ shield: 2, neutral: true });
  assert.equal(cr.__lfTargetId, 13);
  assert.equal(cr.__lfTargetKind, 'shape');
});

test('tracked tank becoming shielded is dropped before the next telegraph', () => {
  const { cr } = scenario({ shield: 2, neutral: true, held: true });
  assert.equal(cr.__lfTargetId, 13);
  assert.equal(cr.__lfTargetKind, 'shape');
});

for (const hz of [30, 60, 120, 240]) {
  test('spawn-shield targeting gate is frame-rate independent at ' + hz + 'Hz', () => {
    const { cr } = scenario({ shield: .25, dt: 1/hz });
    assert.equal(cr.__lfTargetId, -1);
  });
}

test('an already telegraphed Crasher keeps its advertised charge if target shields', () => {
  const { cr } = scenario({ shield: 2, telegraph: true, dt: .12 });
  assert.equal(cr.__lfPredatorState, 'charge');
  assert.ok(cr.vx > 100);
  assert.equal(cr.__lfCommitAngle, 0);
});

test('the production HTML loads the actual Crasher instinct owner', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
