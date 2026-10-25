'use strict';
// Production-overlay composition test: exercise the real Controller method with
// the same collision, performance, routing and fairness overlays shipped by Pages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const overlays = [
  'controller-v1.3.0.js',
  'battlefield-v1.6.0.js',
  'performance-v1.7.5.js',
  'terrain-intelligence-v1.10.2.js',
  'second-body-live-vector-v1.10.7.js',
  'fair-engagement-v1.11.2.js',
];
const controller = fs.readFileSync(path.join(root, 'nova-updates', overlays[0]), 'utf8');
const anchor = '    function simulateLegacyDrone(g, owner, d, dt) {';
assert.equal(controller.split(anchor).length, 2, 'Controller injection anchor must be unique');

class Game {
  constructor() {
    this.tanks = []; this.drones = []; this.__novaTerrain = [];
    this.tankById = new Map(); this.droneCounts = new Map();
    this.time = 7; this.quality = 'high'; this.sfx = {};
  }
  updateDrones() {}
  updateBullets() {}
  update() {}
  moveTank() {}
  spawnDrone() {}
  removeDroneAt(i) { this.drones.splice(i, 1); }
}
class Input { attach() {} destroy() {} }
class Sfx {}
const modules = {
  'game/engine': m => { m.exports.Game = Game; },
  'game/input': m => { m.exports.Input = Input; },
  'game/audio': m => { m.exports.Sfx = Sfx; },
  'game/ai': m => { m.exports.updateAI = () => {}; },
  'game/render': m => { m.exports.render = () => {}; },
};
const win = { __novaModules: modules };
const logger = { info() {}, error(...args) { throw new Error(args.join(' ')); } };
const classes = {
  small: { size: 6, color: '#fff' },
  medium: { size: 15, color: '#fff' },
  big: { size: 34, color: '#fff' },
  carrier: { size: 15, droneCount: 0, droneRole: 'hunter', color: '#fff' },
};
const requireMock = p => p.includes('classes') ? { CLASSES: classes }
  : p.includes('types') ? { TAU: Math.PI * 2, MAP_LIMIT: 2250 }
  : p.includes('render') ? { render() {} } : {};

for (let i = 0; i < overlays.length; i++) {
  let source = i === 0 ? controller
    : fs.readFileSync(path.join(root, 'nova-updates', overlays[i]), 'utf8');
  // Test-only observation hook. No runtime file is edited or committed with it.
  if (i === 0) source = source.replace(anchor,
    '    window.__testControllerDash = simulateControllerDrone;\n' +
    '    window.__testControllerTarget = controllerTarget;\n' +
    '    window.__testLegacyDrone = simulateLegacyDrone;\n' + anchor);
  new Function('window', 'console', 'performance', 'document', source)(
    win, logger, { now: () => 0 }, {}
  );
}
const engine = { exports: {} };
modules['game/engine'](engine, engine.exports, requireMock);
assert.equal(engine.exports.Game, Game);
assert.equal(typeof win.__testControllerDash, 'function');
assert.equal(typeof Game.prototype.firstTerrainHit, 'function');
assert.equal(typeof Game.prototype.isTerrainSafe, 'function');

const rect = x => ({
  id: -1000, kind: 'terrain', shape: 'rect', x, y: 0, w: 10, h: 100,
  type: 'wall', destructible: false, solid: true, hp: 0,
});
const pillar = x => ({
  id: -1001, kind: 'terrain', shape: 'circle', x, y: 0, r: 12,
  type: 'pillar', destructible: false, solid: true, hp: 0,
});
function run(options = {}) {
  const g = new Game();
  const owner = { id: 1, swarmT: 0, cls: 'carrier', alive: true, team: 'blue' };
  const target = {
    id: options.targetId ?? 2, kind: 'tank', cls: 'medium', x: options.tx ?? 80, y: options.ty ?? 0,
    alive: true, hp: 100, team: options.targetTeam ?? 'red', spawnShieldT: options.shield ?? 0,
    __novaSweepPrevX: options.px, __novaSweepPrevY: options.py,
    __novaSweepMoveTime: options.stamp ?? 7,
  };
  const drone = {
    id: 100, kind: 'drone', ownerId: 1, x: options.x ?? 0, y: options.y ?? 0,
    r: 5, hp: 20, dmg: 10, speed: 200, __novaPhase: 'dash',
    __novaPhaseT: .3, __novaVX: options.vx ?? 600, __novaVY: options.vy ?? 0,
    __novaHitRun: false, __novaCommitted: true, color: '#fff',
  };
  const screen = options.screen
    ? { id: 3, kind: 'drone', ownerId: 3, x: 25, y: 0, r: 5, hp: 20 }
    : null;
  g.__novaTerrain = options.terrain ?? [];
  g.tanks = [target]; g.drones = screen ? [drone, screen] : [drone];
  const screenOwner = { id: 3, alive: true, team: options.screenTeam ?? 'red' };
  g.tankById = new Map([[1, owner], [2, target], [3, screenOwner]]);
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  const hits = [];
  g.damageTank = (t, n, id) => hits.push(['tank', t.id, n, id]);
  g.damageDrone = (t, n, id) => hits.push(['drone', t.id, n, id]);
  if (options.mask) g.firstTerrainHit = null; // Performance route-skip frame.
  win.__testControllerDash(g, owner, drone, [], null, { active: true },
    { diveDamage: 1.5, recover: .6 }, options.dt ?? .2, false);
  return { hits, drone };
}
const damage = x => x.hits.map(e => e[0] + ':' + e[1]);

test('six actual shipping overlays: wall prevents through-cover dash damage', () => {
  for (const mask of [false, true]) {
    const result = run({ terrain: [rect(55)], mask });
    assert.deepEqual(damage(result), []);
    assert.equal(result.drone.__novaPhase, 'recover');
    assert.ok(result.drone.x < 44.001);
  }
});
test('six actual shipping overlays: target before wall still receives damage', () => {
  const result = run({ terrain: [rect(55)], tx: 24 });
  assert.deepEqual(damage(result), ['tank:2']);
  assert.equal(result.hits[0][2], 15);
});
test('six actual shipping overlays: circular pillar blocks committed dash', () => {
  const result = run({ terrain: [pillar(55)], tx: 80 });
  assert.deepEqual(damage(result), []);
  assert.equal(result.drone.__novaPhase, 'recover');
});
test('six actual shipping overlays: open-field dive preserves damage and phase', () => {
  const result = run();
  assert.deepEqual(damage(result), ['tank:2']);
  assert.equal(result.drone.__novaPhase, 'dash');
});
test('six actual shipping overlays: moving tank crossing is hit', () => {
  const result = run({ tx: 50, ty: -40, px: 50, py: 40 });
  assert.deepEqual(damage(result), ['tank:2']);
});
test('six actual shipping overlays: target vacating the path is not hit', () => {
  const result = run({ tx: 50, ty: 0, px: -100, py: 0 });
  assert.deepEqual(damage(result), []);
});
test('six actual shipping overlays: enemy drone screens a tank', () => {
  const result = run({ screen: true });
  assert.deepEqual(damage(result), ['drone:3']);
});
test('six actual shipping overlays: owner immunity and spawn shield', () => {
  assert.deepEqual(damage(run({ tx: 24, targetId: 1 })), []);
  assert.deepEqual(damage(run({ tx: 24, shield: 1 })), []);
  assert.deepEqual(damage(run({ tx: 24 })), ['tank:2']);
});

// Exercise the real six-overlay shipping chain with team-aware contact rules.
test('six shipping overlays: allied drone is transparent to committed dash', () => {
  assert.deepEqual(damage(run({ screen: true, screenTeam: 'blue' })), ['tank:2']);
});
test('six shipping overlays: allied tank is transparent while hostile drone screens', () => {
  assert.deepEqual(damage(run({ screen: true, targetTeam: 'blue' })), ['drone:3']);
});
test('six shipping overlays: no damage when both possible contacts are allies', () => {
  assert.deepEqual(damage(run({ screen: true, screenTeam: 'blue', targetTeam: 'blue' })), []);
});
test('six shipping overlays: wall still blocks enemy behind an allied screen', () => {
  assert.deepEqual(damage(run({ screen: true, screenTeam: 'blue', terrain: [rect(55)] })), []);
});


test('materialized shipping page loads Controller before its fairness overlays', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const controllerIndex = html.indexOf('./nova-updates/controller-v1.3.0.js');
  const liveIndex = html.indexOf('./nova-updates/second-body-live-vector-v1.10.7.js');
  const fairIndex = html.indexOf('./nova-updates/fair-engagement-v1.11.2.js');
  assert.ok(controllerIndex >= 0 && liveIndex > controllerIndex && fairIndex > liveIndex);
});

test('six shipping overlays: marked spawn-protected tank yields to hostile drone', () => {
  const g = new Game();
  const owner = { id: 1, kind: 'tank', cls: 'carrier', x: 0, y: 0,
    alive: true, isPlayer: true, team: 'blue', swarmT: 0 };
  const tank = { id: 2, kind: 'tank', cls: 'medium', x: 40, y: 0,
    alive: true, hp: 100, team: 'red', spawnShieldT: 2 };
  const otherOwner = { id: 3, kind: 'tank', alive: true, team: 'red' };
  const drone = { id: 30, kind: 'drone', ownerId: 3, x: 28, y: 0, hp: 20, r: 5 };
  g.tanks = [owner, tank]; g.drones = [drone];
  g.tankById = new Map([[1, owner], [2, tank], [3, otherOwner]]);
  g.getTank = id => g.tankById.get(id) || null;
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  const state = { active: true, nodeX: 0, nodeY: 0, markId: 2, markUntil: 100 };
  assert.equal(win.__testControllerTarget(g, owner, state, { engage: 155 }), drone);
  tank.spawnShieldT = 0;
  assert.equal(win.__testControllerTarget(g, owner, state, { engage: 155 }), tank);
});

test('six shipping overlays: cached legacy target cannot bypass newly gained spawn shield', () => {
  const g = new Game();
  const owner = { id: 1, kind: 'tank', cls: 'medium', alive: true, x: 0, y: 0,
    swarmT: 0, team: 'blue' };
  const target = { id: 2, kind: 'tank', cls: 'medium', alive: true, x: 10, y: 0,
    hp: 100, team: 'red', spawnShieldT: 2 };
  const drone = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0, hp: 20, r: 5,
    speed: 0, dmg: 10, attackCd: 0, retargetT: 1, leash: 500,
    targetRef: target, targetId: 2, slot: 0, role: 'hunter', orbitA: 0, orbitR: 40 };
  g.tanks = [owner, target]; g.drones = [drone];
  g.tankById = new Map([[1, owner], [2, target]]);
  g.getTank = id => g.tankById.get(id) || null;
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  g.hasLineOfSight = () => true;
  let hits = 0;
  g.damageTank = () => { hits++; };
  win.__testLegacyDrone(g, owner, drone, 1 / 60);
  assert.equal(hits, 0);
  assert.equal(drone.targetRef, null);
});


// The real Controller module is followed by Battlefield, Performance,
// Terrain Intelligence, Live Vector and Fair Engagement in production.
for (const hz of [30, 60, 120, 240]) {
  test('six shipping overlays: legacy hunter contact uses post-move reach at ' + hz + 'Hz', () => {
    const g = new Game();
    const owner = { id: 1, kind: 'tank', cls: 'medium', alive: true,
      x: 0, y: 0, swarmT: 0, team: 'blue' };
    const target = { id: 2, kind: 'tank', cls: 'medium', alive: true,
      x: 29.4, y: 0, hp: 100, spawnShieldT: 0, team: 'red' };
    const drone = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0,
      hp: 20, r: 5, speed: 300, dmg: 10, attackCd: 0, retargetT: 1,
      leash: 500, targetRef: target, slot: 0, role: 'hunter' };
    g.tanks = [owner, target]; g.drones = [drone];
    g.tankById = new Map([[1, owner], [2, target]]);
    g.areHostile = (a, b) => a.team !== b.team;
    g.hasLineOfSight = () => true;
    let hits = 0;
    g.damageTank = () => { hits++; };
    win.__testLegacyDrone(g, owner, drone, 1 / hz);
    assert.ok(target.x - drone.x < 29, 'hunter reached physical contact');
    assert.equal(hits, 1, 'must not defer a valid post-movement hit');
  });
}

for (const hz of [30, 60, 120, 240]) {
  test('six shipping overlays: stale drone sighting cannot extend melee reach at ' + hz + 'Hz', () => {
    const g = new Game();
    const owner = { id: 1, kind: 'tank', cls: 'medium', alive: true,
      x: 0, y: 0, swarmT: 0, team: 'blue' };
    const enemy = { id: 2, kind: 'tank', cls: 'medium', alive: true, team: 'red' };
    const target = { id: 20, kind: 'drone', ownerId: 2, x: 16.7,
      y: 0, r: 5, hp: 20 };
    const drone = { id: 10, kind: 'drone', ownerId: 1, x: 0, y: 0,
      hp: 20, r: 5, speed: 300, dmg: 10, attackCd: 0, retargetT: 1,
      leash: 500, targetRef: target, slot: 0, role: 'hunter',
      __novaLegacySeenTarget: target, __novaLegacySeenX: -100,
      __novaLegacySeenY: 0, __novaLegacyVisionT: 1 };
    g.tanks = [owner, enemy]; g.drones = [drone, target];
    g.tankById = new Map([[1, owner], [2, enemy]]);
    g.areHostile = (a, b) => a.team !== b.team;
    g.hasLineOfSight = () => true;
    let hits = 0;
    g.damageDrone = () => { hits++; };
    win.__testLegacyDrone(g, owner, drone, 1 / hz);
    assert.ok(target.x - drone.x > 17, 'hunter moved out of physical reach');
    assert.equal(hits, 0, 'visibility cannot authorize damage from stale distance');
  });
}
