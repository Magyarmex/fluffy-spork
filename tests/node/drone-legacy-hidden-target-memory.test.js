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
  const s = harness(); s.see(false);
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
  s.d.targetRef = second; s.d.retargetT = 1;
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
  s.tick();
  assert.ok(s.d.x < .5, 'no hidden pursuit through actual Battlefield wall');
  s.g.__novaTerrain = [];
  for (let i = 0; i < 12; i++) s.tick();
  assert.ok(s.d.x > 0, 'restored visibility resumes pursuit');
});
