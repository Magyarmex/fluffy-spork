'use strict';
// Regression for #167: non-Controller drones must not steer toward live hidden
// enemy-drone coordinates between target scans. Tanks are public on minimap.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(path.join(root, 'nova-updates/controller-v1.3.0.js'), 'utf8');
const anchor = '    function simulateLegacyDrone(g, owner, d, dt) {';
assert.equal(controller.split(anchor).length, 2, 'one canonical legacy movement path');
const instrumented = controller.replace(anchor, '    window.__testLegacy = simulateLegacyDrone;\n' + anchor);

function harness(kind = 'drone', options = {}) {
  class Game {
    updateDrones() {} tryFire() {} damageTank() {} setClass() {}
    updateBullets() {} update() {} moveTank() {}
    spawnPlayer() {} spawnShape() {} spawnPowerup() {}
    randSpawnPos() { return { x: 0, y: 0 }; }
  }
  class Input { attach() {} destroy() {} }
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/input': m => { m.exports.Input = Input; },
    'game/audio': m => { m.exports.Sfx = class {}; },
    'game/render': m => { m.exports.render = () => {}; },
    'game/ai': m => { m.exports.updateAI = () => {}; }
  };
  const win = { __novaModules: modules };
  const ctx = { window: win, console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Number, Object, Array, Date,
    performance: { now: () => 0 }, document: {} };
  vm.runInNewContext(instrumented, ctx, { filename: 'controller-v1.3.0.js' });
  if (options.battlefield) {
    for (const name of ['battlefield-v1.6.0.js', 'performance-v1.7.5.js']) {
      const source = fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8');
      vm.runInNewContext(source, ctx, { filename: name });
    }
  }
  const mod = { exports: {} };
  modules['game/engine'](mod, mod.exports, name => name.includes('classes')
    ? { CLASSES: { carrier: { size: 15 }, marksman: { size: 15 } } } : {});
  const owner = { id: 1, kind: 'tank', cls: 'carrier', x: 0, y: 0, alive: true, swarmT: 0 };
  const target = { id: 20, kind, ownerId: 2, cls: 'marksman', x: 100, y: 0, r: 8, hp: 30, alive: true };
  const d = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0, r: 8, hp: 30,
    speed: 200, dmg: 10, attackCd: 100, leash: 500, retargetT: .25,
    targetRef: target, targetId: target.id, slot: 0, role: 'hunter',
    orbitA: 0, orbitR: 40 };
  let visible = true, rays = 0, acquisitions = 0;
  const g = new mod.exports.Game();
  g.time = 10; g.__novaTerrain = [];
  g.acquireDroneTarget = () => { acquisitions++; return visible ? target : null; };
  g.damageDrone = () => {}; g.damageShape = () => {}; g.damageTank = () => {};
  if (!options.battlefield) {
    g.hasLineOfSight = () => { rays++; return visible; };
  }
  const tick = (dt = 1 / 60) => win.__testLegacy(g, owner, d, dt);
  return { g, d, owner, target, tick,
    see: value => { visible = value; },
    rays: () => rays, acquisitions: () => acquisitions };
}

for (const hz of [30, 60, 120, 240]) {
  test('hidden drone does not reverse pursuit using unseen coordinates at ' + hz + 'Hz', () => {
    const s = harness();
    s.tick(1 / hz);
    const first = s.d.x;
    assert.ok(first > 0, 'initial visible enemy is pursued');
    s.see(false);
    s.target.x = -100;
    s.tick(1 / hz);
    assert.ok(s.d.x >= first, 'hidden relocation cannot reverse direction');
    for (let i = 0; i < Math.ceil(hz * .17); i++) s.tick(1 / hz);
    assert.ok(s.d.x >= first, 'last-seen location is fixed until reacquisition');
    assert.equal(s.target.x, -100);
  });
}

test('initially hidden cached drone never supplies an unobserved pursuit point', () => {
  const s = harness(); s.see(false); s.d.orbitA = Math.PI;
  s.tick();
  assert.ok(s.d.x < 0.5, 'no movement toward unknown enemy position');
});

test('after reacquisition a visible drone can be followed in its new location', () => {
  const s = harness();
  s.tick();
  s.see(false); s.target.x = -100;
  for (let i = 0; i < 22; i++) s.tick();
  assert.ok(s.acquisitions() > 0);
  s.see(true);
  for (let i = 0; i < 25; i++) s.tick();
  assert.ok(s.d.__novaLegacySeenX < 0, 'new sighting refreshes the tracked location');
});

test('remembered close contact cannot damage a now-distant hostile drone', () => {
  const s = harness();
  let hits = 0;
  s.g.damageDrone = () => { hits++; };
  s.d.speed = 0; s.d.attackCd = 100;
  s.target.x = 20; s.tick();
  assert.equal(s.d.__novaLegacySeenX, 20);
  // Still visible but moved out of range before the next LOS sample.
  // A remembered position is a navigation hint, never a hitbox.
  s.target.x = 200; s.d.attackCd = 0;
  s.tick();
  assert.equal(hits, 0);
  assert.equal(s.d.attackCd, 0);
});

test('minimap-public tank targets keep immediate live pursuit', () => {
  const s = harness('tank');
  s.tick();
  const first = s.d.x;
  s.see(false); s.target.x = -100;
  s.tick();
  assert.ok(s.d.x < first, 'public tank location can reverse navigation');
  assert.equal(s.rays(), 0, 'no added line-of-sight checks for public tank tracking');
});

test('neutral farming keeps existing live target coordinates', () => {
  const s = harness('shape');
  s.tick();
  const first = s.d.x;
  s.see(false); s.target.x = -100;
  s.tick();
  assert.ok(s.d.x < first);
  assert.equal(s.rays(), 0);
});

test('visibility checks are bounded in a dense 240Hz simulation', () => {
  const s = harness();
  s.d.retargetT = 999;
  for (let i = 0; i < 240; i++) s.tick(1 / 240);
  assert.ok(s.rays() >= 7 && s.rays() <= 16, 'staggered checks, not one ray per frame: ' + s.rays());
});

test('target replacement discards the previous target last-seen position', () => {
  const s = harness();
  s.tick();
  s.target.x = -100;
  const second = { ...s.target, id: 21, x: -200 };
  s.d.targetRef = second; s.d.retargetT = 1; s.d.orbitA = Math.PI;
  s.see(false);
  const first = s.d.x;
  s.tick();
  assert.ok(s.d.x <= first + 0.01, 'no steering using previous target memory');
  assert.notEqual(s.d.__novaLegacySeenTarget, s.target);
});

test('no LOS API with live solids fails closed for hostile drone pursuit', () => {
  const s = harness();
  delete s.g.hasLineOfSight;
  s.g.__novaTerrain = [{ solid: true, destructible: false, hp: 100 }];
  s.d.orbitA = Math.PI;
  s.tick();
  assert.ok(s.d.x < .5);
});

test('no LOS API in an open arena retains ordinary drone pursuit', () => {
  const s = harness();
  delete s.g.hasLineOfSight;
  s.tick();
  assert.ok(s.d.x > 0);
});

test('real Battlefield + Performance cover blocks cached drone pursuit', () => {
  const s = harness('drone', { battlefield: true });
  s.g.__novaTerrain = [{ id: -1000, kind: 'terrain', shape: 'rect',
    x: 45, y: 0, w: 12, h: 70, type: 'wall',
    destructible: false, hp: 100, solid: true }];
  assert.equal(s.g.hasLineOfSight(0, 0, 100, 0, 2), false);
  s.d.orbitA = Math.PI;
  s.tick();
  assert.ok(s.d.x < .5, 'no hidden pursuit through actual Battlefield wall');
  s.g.__novaTerrain = [];
  for (let i = 0; i < 30; i++) s.tick();
  assert.equal(s.d.__novaLegacySeenX, 100, 'restored visibility refreshes the sighting');
  assert.equal(s.d.targetRef, s.target);
});


test('cached tank loses attack eligibility immediately when spawn protection begins', () => {
  const s = harness('tank');
  let hits = 0;
  s.target.x = 12; s.target.spawnShieldT = 2;
  s.d.speed = 0; s.d.attackCd = 0;
  s.g.damageTank = () => { hits++; };
  s.tick();
  assert.equal(hits, 0, 'spawn protection must prevent an old cached contact attack');
  assert.equal(s.d.targetRef, null, 'do not keep chasing a protected cached tank');
});

test('cached tank that becomes allied is dropped without waiting for retarget interval', () => {
  const s = harness('tank');
  let hits = 0;
  s.owner.team = 'blue'; s.target.team = 'blue';
  s.g.areAllies = (a, b) => a.team === b.team;
  s.g.areHostile = (a, b) => a.team !== b.team;
  s.target.x = 12; s.d.speed = 0; s.d.attackCd = 0;
  s.g.damageTank = () => { hits++; };
  s.tick();
  assert.equal(hits, 0);
  assert.equal(s.d.targetRef, null);
});

test('cached drone whose owner becomes allied is dropped before contact damage', () => {
  const s = harness('drone');
  let hits = 0;
  s.owner.team = 'blue';
  const otherOwner = { id: 2, kind: 'tank', team: 'blue', alive: true };
  s.g.tankById = new Map([[1, s.owner], [2, otherOwner]]);
  s.g.areAllies = (a, b) => a.team === b.team;
  s.g.areHostile = (a, b) => a.team !== b.team;
  s.target.x = 12; s.d.speed = 0; s.d.attackCd = 0;
  s.g.damageDrone = () => { hits++; };
  s.tick();
  assert.equal(hits, 0);
  assert.equal(s.d.targetRef, null);
});

test('cached hostile tank remains eligible after the new safety gate', () => {
  const s = harness('tank');
  let hits = 0;
  s.owner.team = 'blue'; s.target.team = 'red';
  s.g.areAllies = (a, b) => a.team === b.team;
  s.g.areHostile = (a, b) => a.team !== b.team;
  s.target.x = 12; s.target.spawnShieldT = 0;
  s.d.speed = 0; s.d.attackCd = 0;
  s.g.damageTank = () => { hits++; };
  s.tick();
  assert.equal(hits, 1);
  assert.equal(s.d.targetRef, s.target);
});


/* The legacy (non-Controller) drone moves before resolving melee damage.
 * Reach and impact vectors must use the post-movement position. These
 * regressions execute the actual shipping Controller overlay, not a copy. */
for (const hz of [30, 60, 120, 240]) {
  test('legacy hunter entering melee range attacks in the same tick at ' + hz + 'Hz', () => {
    const s = harness('tank');
    s.target.x = 32.4; // initial distance > 15+4+8+5 = 32
    s.d.speed = 300;
    s.d.attackCd = 0;
    s.d.retargetT = 1;
    let hits = 0;
    s.g.damageTank = () => { hits++; };
    s.tick(1 / hz);
    assert.ok(s.target.x - s.d.x < 32, 'movement brought the hunter into reach');
    assert.equal(hits, 1, 'post-movement melee reach must count this contact');
  });
}

for (const hz of [30, 60, 120, 240]) {
  test('legacy hunter moving away from a newly visible drone cannot hit out of range at ' + hz + 'Hz', () => {
    const s = harness('drone');
    s.target.x = 22.7; // inside 8+2+8+5 = 23 before movement
    s.d.speed = 300;
    s.d.attackCd = 0;
    s.d.retargetT = 1;
    // Sightings are intentionally sampled at a bounded cadence. The hunter
    // can still be steering toward an older, opposite-side visible position.
    s.d.__novaLegacySeenTarget = s.target;
    s.d.__novaLegacySeenX = -100;
    s.d.__novaLegacySeenY = 0;
    s.d.__novaLegacyVisionT = 1;
    let hits = 0;
    s.g.damageDrone = () => { hits++; };
    s.tick(1 / hz);
    assert.ok(s.target.x - s.d.x > 23, 'hunter moved outside melee reach');
    assert.equal(hits, 0, 'old pre-movement distance must not authorize remote damage');
    assert.equal(s.d.attackCd, 0, 'no cooldown spent on a phantom attack');
  });
}

test('legacy shape impact uses the actual post-movement contact direction', () => {
  const s = harness('shape');
  s.target.x = 20;
  s.d.speed = 300;
  s.d.attackCd = 0;
  s.d.retargetT = 1;
  let impact = null;
  s.g.damageShape = (shape, dmg, dx, dy) => { impact = { shape, dmg, dx, dy }; };
  s.tick(1 / 30);
  assert.ok(impact, 'the shape is within reach after movement');
  assert.equal(impact.dx, s.target.x - s.d.x,
    'impact direction must reflect the real attacking position');
  assert.equal(impact.dy, s.target.y - s.d.y);
});


/* A hunter that reaches the 12-unit approach band must not step through its
 * target/last-seen point. The same-frame melee check is intentionally retained. */
for (const hz of [30, 60, 120, 240]) {
  test('legacy hunter respects 12-unit arrival band at ' + hz + ' Hz while attacking', () => {
    const s = harness('tank');
    s.target.x = 13.5;
    s.owner.swarmT = 1; // real swarm speed multiplier exposes the overshoot
    s.d.speed = 300;
    s.d.retargetT = 1;
    s.d.attackCd = 0;
    let hits = 0;
    s.g.damageTank = () => { hits++; };
    s.tick(1 / hz);
    assert.ok(s.d.x <= s.target.x - 12 + 1e-8,
      'arrival should stop at the near-side band, not jump through the target');
    assert.equal(hits, 1, 'clamped arrival must retain valid close-range melee');
    const stopped = s.d.x;
    s.d.attackCd = 100;
    for (let i = 0; i < 8; i++) s.tick(1 / hz);
    assert.ok(Math.abs(s.d.x - stopped) < 1e-8,
      'the hunter must hold the intended standoff rather than drift');
  });
  test('hidden drone pursuit cannot overshoot its last legitimately seen point at ' + hz + ' Hz', () => {
    const s = harness('drone');
    s.target.x = 300; // live location is not a valid navigation input
    s.d.__novaLegacySeenTarget = s.target;
    s.d.__novaLegacySeenX = 13.5;
    s.d.__novaLegacySeenY = 0;
    s.d.__novaLegacyVisionT = 1;
    s.d.retargetT = 1;
    s.owner.swarmT = 1;
    s.d.speed = 300;
    s.tick(1 / hz);
    assert.ok(s.d.x <= 1.5 + 1e-8,
      'last-seen approach cannot cross the 12-unit arrival band');
    assert.equal(s.d.__novaLegacySeenX, 13.5);
  });
}
