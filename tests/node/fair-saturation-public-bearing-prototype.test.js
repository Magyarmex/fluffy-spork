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
function hostile(g, a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (typeof g.areAllies === 'function' && g.areAllies(a, b)) return false;
  if (typeof g.areHostile === 'function') return !!g.areHostile(a, b);
  for (const key of ['teamId', 'team', 'factionId', 'faction', 'side']) {
    if (a[key] != null && b[key] != null) return a[key] !== b[key];
  }
  return true; // Free-for-all: every distinct tank can be a third-party attacker.
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
// Prototype: only directly visible, target-hostile hulls pointing toward a
// visible target. A bearing is a weak public signal, NOT proof of an attack.
// No private AI slot or other tank's speed/upgrade data is read here.
function bearingCount(T, g, observer, target, C = classes) {
  let count = 0;
  for (const q of g.tanks) {
    if (!q || q.id === observer.id || q.id === target.id || !alive(q) ||
        !hostile(g, q, target) || !T.canPerceive(g, C, observer, q)) continue;
    const dx = target.x - q.x, dy = target.y - q.y;
    if (dx * dx + dy * dy > 500 * 500 || dx * dx + dy * dy < 1) continue;
    if (!Number.isFinite(q.angle)) continue;
    const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - q.angle),
      Math.cos(Math.atan2(dy, dx) - q.angle));
    if (Math.abs(delta) > 0.32) continue;
    // Cheap angle/distance gates precede both potentially costly terrain
    // queries; only plausible public attack bearings ask about solid cover.
    if (typeof g.hasLineOfSight === 'function' &&
        (!g.hasLineOfSight(observer.x, observer.y, q.x, q.y, 18) ||
         !g.hasLineOfSight(q.x, q.y, target.x, target.y, 18))) continue;
    count++;
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
      shooter.id === target.id || !hostile(g, shooter, target) ||
      !T.canPerceive(g, C, observer, shooter)) return 0;
  const angle = Number(a.__v181ObservedShotAngle);
  if (!Number.isFinite(angle)) return 0;
  const toward = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  if (Math.cos(angle - toward) < Math.cos(0.32)) return 0;
  if (typeof g.hasLineOfSight === 'function' &&
      !g.hasLineOfSight(shooter.x, shooter.y, target.x, target.y, 18)) return 0;
  return 1;
}
// Exact non-saturation terms from shipping scoreTarget. Unlike subtracting a
// private count after calling scoreTarget, this candidate NEVER reads another
// AI's private target slots. The source-parity regression below detects drift.
function basePublicScore(T, g, C, observer, target) {
  if (!alive(target) || !hostile(g, observer, target) || target.spawnShieldT > 0 ||
      !T.canPerceive(g, C, observer, target)) return -Infinity;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = Math.hypot(target.x - observer.x, target.y - observer.y);
  const near = 1 / (1 + dist / 720);
  const hp = clamp(Number(target.hp) /
    Math.max(1, Number(target.maxHp) || Number(target.hp) || 1), 0, 1);
  const ln = C && typeof C.lineageForClass === 'function' ?
    C.lineageForClass(target.cls) : null;
  let danger = .45;
  if (ln === 'sniper') danger = .78;
  else if (ln === 'cannon') danger = .72;
  else if (ln === 'controller') danger = .68;
  else if (ln === 'guardian') danger = .64;
  else if (ln === 'gunner') danger = .62;
  if (target.tier >= 3) danger += .12;
  danger = clamp(danger, 0, 1);
  let score = near * 1.16 + (1 - hp) * .48 + danger * .30;
  const a = observer.ai;
  if (a && a.__v1112TargetId === target.id) score += .16;
  if (a && a.__v180LastAttacker === target.id &&
      g.time - Number(a.__v180HitAt || -99) < 2.2) score += .34;
  const seed = Math.sin((observer.id || 1) * 17.17 +
    (target.id || 1) * 31.73) * 43758.5453;
  score += (seed - Math.floor(seed) - .5) * .04;
  return score;
}
function publicChoice(T, g, observer, C = classes, mode = 'bearing') {
  let best = null, bestScore = -Infinity;
  for (const target of g.tanks) {
    if (!target || target.id === observer.id || !alive(target) ||
        allied(g, observer, target)) continue;
    const base = basePublicScore(T, g, C, observer, target);
    if (!Number.isFinite(base)) continue;
    const score = base - (mode === 'shot' ?
      witnessedShotCount(T, g, observer, target, C) :
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
test('public base score exactly matches shipping before private saturation', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  for (const target of [a, b]) {
    for (const id of [a.id, b.id, -1]) {
      hidden.ai.__v1112TargetId = id;
      const raw = T.scoreTarget(g, classes, observer, observer.ai, target, g.time);
      const recovered = raw + privateCount(g, observer, target) * T.saturationPenalty;
      const publicScore = basePublicScore(T, g, classes, observer, target);
      assert.ok(Math.abs(recovered - publicScore) < 1e-12,
        'base score diverged from materialized scoreTarget');
    }
  }
});
test('public score reconstruction preserves all five lineage danger bands and own commitments', () => {
  const T = boot(), { g, observer, a, hidden } = world();
  const C = { lineageForClass(id) { return id; } };
  for (const lineage of ['gunner', 'sniper', 'cannon', 'controller', 'guardian', 'unknown']) {
    for (const tier of [0, 1, 3, 4]) {
      for (const hp of [20, 65, 100]) {
        a.cls = lineage; a.tier = tier; a.hp = hp;
        observer.ai.__v1112TargetId = a.id;
        observer.ai.__v180LastAttacker = a.id;
        observer.ai.__v180HitAt = g.time - 0.4;
        hidden.ai.__v1112TargetId = a.id;
        const shipping = T.scoreTarget(g, C, observer, observer.ai, a, g.time);
        const recovered = shipping + privateCount(g, observer, a) * T.saturationPenalty;
        const publicScore = basePublicScore(T, g, C, observer, a);
        assert.ok(Math.abs(recovered - publicScore) < 1e-12,
          'source parity drift: ' + lineage + ' tier=' + tier + ' hp=' + hp);
      }
    }
  }
});
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
test('public choices never read other bots private target slots', () => {
  const T = boot(), { g, observer, hidden } = world();
  const forbidden = new Set(['__v1112TargetId', '__v1105TargetId',
    '__v180TargetId', 'targetId', '__lfEcoKey']);
  for (const q of g.tanks) {
    if (q.id === observer.id || !q.ai) continue;
    q.ai = new Proxy(q.ai, { get(target, key, receiver) {
      if (forbidden.has(key)) throw new Error('private AI slot read: ' + key);
      return Reflect.get(target, key, receiver);
    } });
  }
  assert.ok(publicChoice(T, g, observer));
  assert.ok(publicChoice(T, g, observer, classes, 'shot'));
  assert.equal(hidden.ai.state, 'hunt');
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
test('bearing prototype excludes target allies, dead hulls, and non-finite angles', () => {
  const T = boot(), { g, observer, a } = world();
  const witness = tank(3, 0, 100, 2, Math.atan2(-100, 100));
  g.tanks.push(witness);
  assert.equal(bearingCount(T, g, observer, a), 0);
  witness.team = 1; witness.alive = false;
  assert.equal(bearingCount(T, g, observer, a), 0);
  witness.alive = true; witness.angle = NaN;
  assert.equal(bearingCount(T, g, observer, a), 0);
});

test('free-for-all third-party attack bearings remain observable without team metadata', () => {
  const T = boot(), { g, observer, a, b } = world();
  b.angle = Math.PI; // Prevent the other visible opponent from also aiming at a.
  for (const t of g.tanks) delete t.team;
  const witness = tank(3, 0, 100, 3, Math.atan2(-100, 100));
  delete witness.team;
  g.tanks.push(witness);
  assert.equal(bearingCount(T, g, observer, a), 1,
    'free-for-all pressure must not disappear when team IDs are absent');
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
test('public witnessed fire can redirect a real target score without private intent', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  hidden.ai.state = 'wander';
  a.hp = 85; // Modest public vulnerability makes a preferable before evidence.
  const shooter = tank(3, 0, 100, 1, Math.atan2(-100, 100));
  g.tanks.push(shooter);
  const before = publicChoice(T, g, observer, classes, 'shot')?.id;
  observer.ai.__v181ObservedShotId = shooter.id;
  observer.ai.__v181ObservedShotAt = g.time - 0.2;
  observer.ai.__v181ObservedShotAngle = shooter.angle;
  const after = publicChoice(T, g, observer, classes, 'shot')?.id;
  assert.equal(before, a.id, 'vulnerable target should initially win');
  assert.equal(after, b.id, 'witnessed third-party pressure should redirect choice');
  shooter.ai.__v1112TargetId = b.id;
  assert.equal(publicChoice(T, g, observer, classes, 'shot')?.id, b.id,
    'changing private target slot must not undo public evidence');
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
        publicBearingContacts: 0, publicShotContacts: 0, selected: 0,
        publicLineOfSightCalls: 0 };
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
            // Instrument candidate-only LOS work. The game's existing perf
            // counter does not necessarily include these direct terrain calls.
            // Restore the exact original method before the next game update.
            const originalLOS = g.hasLineOfSight;
            if (typeof originalLOS === 'function') {
              g.hasLineOfSight = function (...args) {
                result.publicLineOfSightCalls++;
                return originalLOS.apply(this, args);
              };
            }
            try {
              const proposed = publicChoice(T, g, observer, C);
              const shotProposed = publicChoice(T, g, observer, C, 'shot');
              if (shipping && proposed) {
                result.selected++;
                if (shipping.id !== proposed.id) result.changedSelections++;
                if (shotProposed && shipping.id !== shotProposed.id)
                  result.shotChangedSelections++;
              }
              for (const target of visible) {
                result.publicBearingContacts += bearingCount(T, g, observer, target, C);
                result.publicShotContacts += witnessedShotCount(T, g, observer, target, C);
              }
            } finally {
              g.hasLineOfSight = originalLOS;
            }
          }
        }
        return { ...result,
          battlefieldQueries: Number(g.__novaPerf?.battlefieldQueries || 0),
          hash: digest(physical(g)),
          privateHash: digest((g.tanks || []).map(t => t && t.ai ?
            [t.id, t.ai.state, t.ai.__v180Posture, t.ai.__v1112TargetId,
             t.ai.__v1105TargetId, t.ai.__v180TargetId, t.ai.targetId,
             t.ai.__v1112NextThink, t.ai.__v181ObservedShotId,
             t.ai.__v181ObservedShotAt] : null)),
          draws: draws() };
      } finally { g.destroy(); }
    });
  }
  const rows = [];
  for (const seed of seeds) {
    const control = run(seed, false);
    const observed = run(seed, true);
    assert.equal(observed.hash, control.hash, 'research changed physical state');
    assert.equal(observed.draws, control.draws, 'research consumed gameplay RNG');
    assert.equal(observed.privateHash, control.privateHash,
      'research changed private AI state');
    assert.ok(observed.observerSamples > 0, 'must inspect live AI observers');
    rows.push({ seed, observerSamples: observed.observerSamples,
      multiVisible: observed.multiVisible, selected: observed.selected,
      changedSelections: observed.changedSelections,
      shotChangedSelections: observed.shotChangedSelections,
      publicBearingContacts: observed.publicBearingContacts,
      publicShotContacts: observed.publicShotContacts,
      publicLineOfSightCalls: observed.publicLineOfSightCalls,
      extraBattlefieldQueries: observed.battlefieldQueries - control.battlefieldQueries });
  }
  console.log('NOVA_PUBLIC_BEARING_SATURATION_CENSUS ' + JSON.stringify(rows));
});
