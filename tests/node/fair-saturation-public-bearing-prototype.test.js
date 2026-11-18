'use strict';
// Research-only #1025: compare hidden-slot saturation with public turret-bearing
// evidence. This is NOT a production AI replacement or a natural-match verdict.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
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
function bearingCount(T, g, observer, target, C = classes) {
  let count = 0;
  for (const q of g.tanks) {
    if (!q || q.id === observer.id || q.id === target.id || !alive(q) ||
        !allied(g, observer, q) || !T.canPerceive(g, C, observer, q)) continue;
    const dx = target.x - q.x, dy = target.y - q.y;
    if (dx * dx + dy * dy > 500 * 500 || dx * dx + dy * dy < 1) continue;
    if (!Number.isFinite(q.angle)) continue;
    // A hull visible in the camera rectangle may still be behind solid cover.
    if (typeof g.hasLineOfSight === 'function' &&
        (!g.hasLineOfSight(observer.x, observer.y, q.x, q.y, 18) ||
         !g.hasLineOfSight(q.x, q.y, target.x, target.y, 18))) continue;
    const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - q.angle),
      Math.cos(Math.atan2(dy, dx) - q.angle));
    if (Math.abs(delta) <= 0.32) count++;
  }
  return count;
}
// Battle Sense currently remembers only the latest witnessed shooter, so this
// can certify at most one public attacker; it is not a multi-attacker census.
function witnessedShotCount(T, g, observer, target, C = classes) {
  const a = observer.ai || {};
  const at = Number(a.__v181ObservedShotAt);
  if (!Number.isFinite(at) || g.time - at < 0 || g.time - at > 1.25) return 0;
  const shooter = g.tanks.find(q => q && q.id === a.__v181ObservedShotId);
  if (!shooter || !alive(shooter) || shooter.id === observer.id ||
      shooter.id === target.id || !allied(g, observer, shooter) ||
      !T.canPerceive(g, C, observer, shooter)) return 0;
  const angle = Number(a.__v181ObservedShotAngle);
  if (!Number.isFinite(angle)) return 0;
  const toward = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  if (Math.cos(angle - toward) < Math.cos(0.32)) return 0;
  if (typeof g.hasLineOfSight === 'function' &&
      !g.hasLineOfSight(shooter.x, shooter.y, target.x, target.y, 18)) return 0;
  return 1;
}
function publicChoice(T, g, observer, C = classes, mode = 'bearing') {
  let best = null, bestScore = -Infinity;
  for (const target of g.tanks) {
    if (!target || target.id === observer.id || !alive(target) ||
        allied(g, observer, target)) continue;
    const shipping = T.scoreTarget(g, C, observer, observer.ai, target, g.time);
    if (!Number.isFinite(shipping)) continue;
    // Recover the unchanged score before private-slot saturation and apply the
    // alternative public penalty. This is an observational score experiment.
    const score = shipping + privateCount(g, observer, target) * T.saturationPenalty -
      (mode === 'shot' ? witnessedShotCount(T, g, observer, target, C) :
       bearingCount(T, g, observer, target, C)) * T.saturationPenalty;
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

test('public bearing cannot see through cover between observer, shooter or target', () => {
  const T = boot(), { g, observer, a } = world();
  const witness = tank(3, 0, 100, 1, Math.atan2(-100, 100));
  g.tanks.push(witness);
  g.hasLineOfSight = (x1, y1, x2, y2) => !(x1 === observer.x &&
    y1 === observer.y && x2 === witness.x && y2 === witness.y);
  assert.equal(bearingCount(T, g, observer, a), 0, 'hidden hull is not evidence');
  g.hasLineOfSight = (x1, y1, x2, y2) => !(x1 === witness.x &&
    y1 === witness.y && x2 === a.x && y2 === a.y);
  assert.equal(bearingCount(T, g, observer, a), 0, 'blocked shot lane is not evidence');
  g.hasLineOfSight = () => true;
  assert.equal(bearingCount(T, g, observer, a), 1);
});
test('latest witnessed shot is bounded, public and cannot imply multiple attackers', () => {
  const T = boot(), { g, observer, a, b } = world();
  const shooter = tank(3, 0, 100, 1);
  g.tanks.push(shooter);
  observer.ai.__v181ObservedShotId = shooter.id;
  observer.ai.__v181ObservedShotAt = g.time - 0.2;
  observer.ai.__v181ObservedShotAngle = Math.atan2(-100, 100);
  assert.equal(witnessedShotCount(T, g, observer, a), 1);
  assert.equal(witnessedShotCount(T, g, observer, b), 0);
  shooter.ai.__v1112TargetId = b.id;
  assert.equal(witnessedShotCount(T, g, observer, a), 1,
    'witness must not consume private shooter target slots');
  observer.ai.__v181ObservedShotAt = g.time - 1.3;
  assert.equal(witnessedShotCount(T, g, observer, a), 0);
  observer.ai.__v181ObservedShotAt = g.time - 0.2;
  shooter.team = 2;
  assert.equal(witnessedShotCount(T, g, observer, a), 0);
});
test('natural composed worlds report public-bearing sensitivity without changing gameplay', () => {
  const { bootGame, withSeed, digest, physical } =
    require('../research/audio-rng-causal-pilot.cjs');
  const seeds = [1517800, 1517802, 1517810];
  function run(seed, observe) {
    return withSeed(seed, draws => {
      const g = bootGame();
      g.sfx.muted = true;
      g.sfx.startMusic = () => {};
      const T = g.__testFair;
      const C = g.__testWindow.__novaMakeRequire('')('game/classes');
      const result = { observerSamples: 0, multiVisible: 0,
        changedSelections: 0, shotChangedSelections: 0,
        publicBearingContacts: 0, publicShotContacts: 0, selected: 0 };
      try {
        g.status = 'playing';
        g.paused = false;
        for (let tick = 1; tick <= 720; tick++) {
          g.update(1 / 60);
          if (!observe || tick % 12 || g.status !== 'playing') continue;
          for (const observer of g.tanks) {
            if (!observer || !observer.ai || observer.isPlayer || !alive(observer)) continue;
            result.observerSamples++;
            const visible = g.tanks.filter(q => q && q.id !== observer.id &&
              alive(q) && !allied(g, observer, q) &&
              T.canPerceive(g, C, observer, q) && !(q.spawnShieldT > 0));
            if (visible.length < 2) continue;
            result.multiVisible++;
            const shipping = T.chooseTarget(g, C, observer, observer.ai, g.time);
            const proposed = publicChoice(T, g, observer, C);
            const shotProposed = publicChoice(T, g, observer, C, 'shot');
            if (shipping && proposed) {
              result.selected++;
              if (shipping.id !== proposed.id) result.changedSelections++;
              if (shotProposed && shipping.id !== shotProposed.id)
                result.shotChangedSelections++;
            }
            for (const target of visible)
              result.publicBearingContacts += bearingCount(T, g, observer, target, C);
              result.publicShotContacts += witnessedShotCount(T, g, observer, target, C);
          }
        }
        return { ...result, hash: digest(physical(g)), draws: draws() };
      } finally { g.destroy(); }
    });
  }
  const rows = [];
  for (const seed of seeds) {
    const control = run(seed, false);
    const observed = run(seed, true);
    assert.equal(observed.hash, control.hash, 'research changed physical state');
    assert.equal(observed.draws, control.draws, 'research consumed gameplay RNG');
    assert.ok(observed.observerSamples > 0, 'must inspect live AI observers');
    rows.push({ seed, observerSamples: observed.observerSamples,
      multiVisible: observed.multiVisible, selected: observed.selected,
      changedSelections: observed.changedSelections,
      shotChangedSelections: observed.shotChangedSelections,
      publicBearingContacts: observed.publicBearingContacts,
      publicShotContacts: observed.publicShotContacts });
  }
  console.log('NOVA_PUBLIC_BEARING_SATURATION_CENSUS ' + JSON.stringify(rows));
});
