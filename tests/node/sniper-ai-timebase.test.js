'use strict';
// Shipping Sniper/Forward Observer AI: stochastic decisions must be per
// simulated second, not per rendered frame. Tests execute the actual overlay.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'nova-updates/stability-v1.4.0.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function boot() {
  let draws = [], baseCalls = 0;
  const randomMath = Object.create(Math);
  randomMath.random = () => {
    assert.ok(draws.length, 'unexpected random draw from Sniper AI');
    return draws.shift();
  };
  const modules = {
    'game/ai'(m) {
      m.exports.updateAI = () => { baseCalls++; };
    },
    'game/classes'(m) {
      m.exports.CLASSES = { marksman: { fireMode: 'bullet' } };
    }
  };
  const window = { __novaModules: modules };
  vm.runInNewContext(source, {
    window, Math: randomMath, Number, Object, Array,
    performance: { now: () => 1000 },
    console: { info() {}, warn() {}, error() {} }
  }, { filename: 'stability-v1.4.0.js' });
  const ai = { exports: {} };
  modules['game/ai'](ai, ai.exports, id => {
    assert.equal(id, './classes');
    const m = { exports: {} };
    modules['game/classes'](m);
    return m.exports;
  });
  function frame(dt, strafeDraw, abilityDraw, cls = 'marksman', abilityCd = 0) {
    draws = [strafeDraw, abilityDraw];
    const t = {
      id: 1, cls, x: 0, y: 0, angle: 0, vx: 0, vy: 0,
      fireCd: 1, abilityCd, alive: true,
      ai: {
        thinkT: 10, state: 'hunt', targetId: 2, strafe: 1,
        isElite: false, __novaAimSampleT: 10,
        __novaAimX: 500, __novaAimY: 0
      }
    };
    const enemy = { id: 2, x: 500, y: 0, alive: true, spawnShieldT: 0 };
    const g = {
      time: 5, tanks: [t, enemy], bullets: [],
      getTank(id) { return id === 2 ? enemy : null; },
      tankSpeed() { return 200; }, weaponRange() { return 700; },
      bulletSpeed() { return 800; },
      moveTank() {}, tryFire() {},
      abilityCalls: 0, useAbility() { this.abilityCalls++; }
    };
    ai.exports.updateAI(t, g, dt);
    return { strafe: t.ai.strafe, abilities: g.abilityCalls,
      remainingDraws: draws.length };
  }
  return { frame, getBaseCalls: () => baseCalls };
}

test('real production HTML loads Forward Observer before playable boot', () => {
  const ref = 'nova-updates/stability-v1.4.0.js';
  const at = html.indexOf(ref);
  const bootAt = html.search(/window\.__bootModule\((['"])main\1\)/);
  assert.ok(at > 0 && bootAt > at, 'actual shipping chain must contain this AI owner');
});

test('Sniper strafe and opportunistic ability hazards preserve 60 Hz baseline at every FPS', () => {
  const { frame } = boot();
  for (const fps of [30, 60, 120, 240]) {
    const dt = 1 / fps;
    const pStrafe = 1 - Math.pow(1 - .0025, 60 * dt);
    const pAbility = 1 - Math.pow(1 - .006, 60 * dt);
    const belowStrafe = frame(dt, pStrafe - 1e-8, 1);
    const aboveStrafe = frame(dt, pStrafe + 1e-8, 1);
    assert.equal(belowStrafe.strafe, -1, fps + 'Hz: strafe should flip below hazard');
    assert.equal(aboveStrafe.strafe, 1, fps + 'Hz: strafe should not flip above hazard');
    assert.equal(belowStrafe.abilities, 0);
    const belowAbility = frame(dt, 1, pAbility - 1e-8);
    const aboveAbility = frame(dt, 1, pAbility + 1e-8);
    assert.equal(belowAbility.abilities, 1, fps + 'Hz: ability should trigger below hazard');
    assert.equal(aboveAbility.abilities, 0, fps + 'Hz: ability should not trigger above hazard');
    assert.equal(belowAbility.strafe, 1);
    assert.equal(belowAbility.remainingDraws, 0, 'exactly one draw per active decision');
    assert.equal(aboveStrafe.remainingDraws, 0);
  }
});

test('one-second probabilities are invariant under 30/60/120/240 Hz sampling', () => {
  for (const baseline of [.0025, .006]) {
    const expected = 1 - Math.pow(1 - baseline, 60);
    for (const fps of [30, 60, 120, 240]) {
      const frameHazard = 1 - Math.pow(1 - baseline, 60 / fps);
      const cumulative = 1 - Math.pow(1 - frameHazard, fps);
      assert.ok(Math.abs(cumulative - expected) < 1e-12,
        'same simulated second must have the same chance at ' + fps + 'Hz');
    }
  }
});

test('zero simulation time never produces a random reversal or ability', () => {
  const { frame } = boot();
  const result = frame(0, 0, 0);
  assert.equal(result.strafe, 1);
  assert.equal(result.abilities, 0);
  assert.equal(result.remainingDraws, 0);
});

test('non-sniper AI still delegates to the original owner', () => {
  const { frame, getBaseCalls } = boot();
  frame(1 / 60, .5, .5, 'scout');
  assert.equal(getBaseCalls(), 1);
});

test('production Predator composition suppresses unused Sniper random rolls without losing movement', () => {
  const predator = fs.readFileSync(path.join(root,
    'nova-updates/predator-doctrine-v1.8.0.js'), 'utf8');
  const battleSense = fs.readFileSync(path.join(root,
    'nova-updates/battle-sense-v1.8.1.js'), 'utf8');
  const fairEngagement = fs.readFileSync(path.join(root,
    'nova-updates/fair-engagement-v1.11.2.js'), 'utf8');
  const refs = ['nova-updates/stability-v1.4.0.js',
    'nova-updates/predator-doctrine-v1.8.0.js',
    'nova-updates/battle-sense-v1.8.1.js',
    'nova-updates/fair-engagement-v1.11.2.js'];
  const offsets = refs.map(ref => html.indexOf(ref));
  assert.ok(offsets.every(n => n > 0) && offsets.every((n, i) => !i || offsets[i-1] < n),
    'production must install Forward Observer, Predator, Battle Sense and Fair Engagement in order');

  for (const fps of [30, 60, 120, 240]) {
    let draws = 0, movement = null, abilities = 0;
    const randomMath = Object.create(Math);
    randomMath.random = () => { draws++; return .5; };
    const classes = {
      CLASSES: {
        marksman: { fireMode: 'bullet', size: 15, ability: 'none' },
        singularity: { fireMode: 'beam', size: 15, ability: 'phase' },
        scout: { size: 15 }
      },
      lineageForClass(cls) {
        return cls === 'marksman' || cls === 'singularity' ? 'sniper' : null;
      }
    };
    const mods = {
      'game/ai'(m) { m.exports.updateAI = () => {}; },
      'game/classes'(m) { m.exports = classes; }
    };
    const window = { __novaModules: mods };
    const ctx = { window, Math: randomMath, Number, Object, Array,
      performance: { now: () => 1000 },
      console: { info() {}, warn() {}, error() {} } };
    vm.runInNewContext(source, ctx, { filename: 'stability-v1.4.0.js' });
    vm.runInNewContext(predator, ctx, { filename: 'predator-doctrine-v1.8.0.js' });
    vm.runInNewContext(battleSense, ctx, { filename: 'battle-sense-v1.8.1.js' });
    vm.runInNewContext(fairEngagement, ctx, { filename: 'fair-engagement-v1.11.2.js' });
    const mod = { exports: {} };
    mods['game/ai'](mod, mod.exports, () => classes);
    function scenario(cls, hp) {
      const t = { id: 1, cls, x: 0, y: 0, angle: 0, fireCd: 1,
        abilityCd: 0, alive: true, hp, maxHp: 100,
        ai: { thinkT: 10, state: 'hunt', targetId: 2, strafe: 1,
          isElite: false, __novaAimSampleT: 10, __novaAimX: 400,
          __novaAimY: 0 } };
      const enemy = { id: 2, cls: 'scout', x: 400, y: 0,
        alive: true, hp: 100, maxHp: 100, spawnShieldT: 0 };
      const g = { time: 10, w: 900, h: 700, cam: { x: 0, y: 0, zoom: 1 },
        tanks: [t, enemy], player: enemy,
        bullets: [], shapes: [], drones: [],
        getTank(id) { return id === 2 ? enemy : null; },
        tankSpeed() { return 200; }, weaponRange() { return 700; },
        bulletSpeed() { return 800; }, nearestShape() { return null; },
        nearestTank() { return enemy; },
        hasLineOfSight() { return true; },
        moveTank(_t, x, y) { movement = [x, y]; },
        tryFire() {}, useAbility() { abilities++; } };
      mod.exports.updateAI(t, g, 1 / fps);
      return t;
    }
    const ordinary = scenario('marksman', 100);
    assert.equal(ordinary.ai.__v180OwnMove, true, fps + 'Hz: Predator owns combat movement');
    assert.ok(movement && Math.hypot(...movement) > 0, 'tactical movement still executes');
    assert.equal(ordinary.ai.strafe, 1, 'ignored legacy strafe does not change');
    assert.equal(draws, 0, fps + 'Hz: no unused legacy strafe/ability RNG draws');
    const tactical = scenario('singularity', 20);
    assert.equal(tactical.ai.__v180OwnMove, true);
    assert.equal(abilities, 1, fps + 'Hz: low-HP phase ability still fires by tactical intent');
    assert.equal(draws, 0, 'tactical ability needs no legacy random roll');
  }
});

test('standalone Forward Observer fallback remains time-based without Predator', () => {
  // The isolated legacy owner still gets its original combat grammar, with
  // time-based hazards rather than the original per-render-frame rolls.
  const { frame } = boot();
  const dt = 1 / 30, threshold = 1 - Math.pow(1 - .0025, dt * 60);
  assert.equal(frame(dt, threshold - 1e-8, 1).strafe, -1);
  assert.equal(frame(dt, threshold + 1e-8, 1).strafe, 1);
});
