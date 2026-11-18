'use strict';
// Research-only #1025: compare hidden-slot saturation with public turret-bearing
// evidence. This is NOT a production AI replacement or a natural-match verdict.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/fair-engagement-v1.11.2.js'), 'utf8');
function boot() {
  const window = { __novaModules: {} };
  vm.runInNewContext(source, { window, Math, Number, Object, Array, Map,
    console: { info() {}, warn() {}, error() {} } });
  return window.__NOVA_FAIR_ENGAGEMENT_TEST__;
}
const classes = { lineageForClass() { return 'gunner'; } };
function alive(t) { return t && t.alive !== false && (t.hp == null || t.hp > 0); }
function allied(g, a, b) {
  if (typeof g.areAllies === 'function') return !!g.areAllies(a, b);
  for (const key of ['teamId', 'team', 'factionId', 'faction', 'side']) {
    if (a[key] != null && b[key] != null) return a[key] === b[key];
  }
  return false; // No evidence of alliance: do not assume cooperation.
}
function assigned(a) {
  return a.__v1112TargetId >= 0 ? a.__v1112TargetId :
    a.__v1105TargetId >= 0 ? a.__v1105TargetId :
    a.__v180TargetId >= 0 ? a.__v180TargetId : a.targetId;
}
function active(a) {
  return a.state === 'hunt' || ['pressure', 'flank', 'route'].includes(a.__v180Posture);
}
function privateCount(g, observer, target) {
  return g.tanks.filter(q => q && q.id !== observer.id && q.ai && alive(q) &&
    active(q.ai) && assigned(q.ai) === target.id).length;
}
// Prototype: only allied, directly visible hulls physically pointing toward a
// visible target. A bearing is a weak public signal, NOT proof of an attack.
// No private AI slot or other tank's speed/upgrade data is read here.
function bearingCount(T, g, observer, target) {
  let count = 0;
  for (const q of g.tanks) {
    if (!q || q.id === observer.id || q.id === target.id || !alive(q) ||
        !allied(g, observer, q) || !T.canPerceive(g, classes, observer, q)) continue;
    const dx = target.x - q.x, dy = target.y - q.y;
    if (dx * dx + dy * dy > 500 * 500 || dx * dx + dy * dy < 1) continue;
    if (!Number.isFinite(q.angle)) continue;
    const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - q.angle),
      Math.cos(Math.atan2(dy, dx) - q.angle));
    if (Math.abs(delta) <= 0.32) count++;
  }
  return count;
}
function publicChoice(T, g, observer) {
  let best = null, bestScore = -Infinity;
  for (const target of g.tanks) {
    if (!target || target.id === observer.id || !alive(target) ||
        allied(g, observer, target)) continue;
    const shipping = T.scoreTarget(g, classes, observer, observer.ai, target, g.time);
    if (!Number.isFinite(shipping)) continue;
    // Recover the unchanged score before private-slot saturation and apply the
    // alternative public penalty. This is an observational score experiment.
    const score = shipping + privateCount(g, observer, target) * T.saturationPenalty -
      bearingCount(T, g, observer, target) * T.saturationPenalty;
    if (score > bestScore) { bestScore = score; best = target; }
  }
  return best;
}
function tank(id, x, y, team, angle = 0) {
  return { id, x, y, team, angle, hp: 100, maxHp: 100, alive: true,
    spawnShieldT: 0, cls: 'twin', tier: 1,
    ai: { state: 'wander', __v1112TargetId: -1, targetId: -1 } };
}
function world() {
  const observer = tank(1, 0, 0, 1);
  const a = tank(10, 100, 0, 2);
  const b = tank(11, -100, 0, 2);
  const hidden = tank(2, 2000, 2000, 1);
  hidden.ai.state = 'hunt';
  const g = { tanks: [observer, a, b, hidden], w: 900, h: 700,
    cam: { zoom: 1 }, time: 10 };
  return { g, observer, a, b, hidden };
}
test('public-bearing prototype is invariant to offscreen private target assignments', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  hidden.ai.__v1112TargetId = a.id;
  const first = publicChoice(T, g, observer)?.id;
  const shippingFirst = T.chooseTarget(g, classes, observer, observer.ai, g.time)?.id;
  hidden.ai.__v1112TargetId = b.id;
  const second = publicChoice(T, g, observer)?.id;
  const shippingSecond = T.chooseTarget(g, classes, observer, observer.ai, g.time)?.id;
  assert.equal(first, second, 'offscreen private slot must not change public score');
  assert.notEqual(shippingFirst, shippingSecond,
    'fixture must remain sensitive to shipping private-slot scoring');
});
test('visible allied bearing is public evidence, not hidden target ID', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  hidden.ai.state = 'wander';
  const witness = tank(3, 0, 100, 1, Math.atan2(-100, 100));
  g.tanks.push(witness);
  assert.equal(bearingCount(T, g, observer, a), 1);
  assert.equal(bearingCount(T, g, observer, b), 0);
  witness.ai.state = 'hunt';
  witness.ai.__v1112TargetId = b.id;
  assert.equal(bearingCount(T, g, observer, a), 1,
    'private assignment must not override public turret direction');
  witness.x = 2000; witness.y = 2000;
  assert.equal(bearingCount(T, g, observer, a), 0,
    'offscreen hull direction is not observer evidence');
});
test('bearing prototype excludes non-allies, dead hulls, and non-finite angles', () => {
  const T = boot(), { g, observer, a } = world();
  const witness = tank(3, 0, 100, 2, Math.atan2(-100, 100));
  g.tanks.push(witness);
  assert.equal(bearingCount(T, g, observer, a), 0);
  witness.team = 1; witness.alive = false;
  assert.equal(bearingCount(T, g, observer, a), 0);
  witness.alive = true; witness.angle = NaN;
  assert.equal(bearingCount(T, g, observer, a), 0);
});
