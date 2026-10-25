'use strict';
// Controller repair is intentionally faster than generic Field Service, but
// not a free heal beside an active, visible hostile tank.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,
  '../../nova-updates/second-body-live-vector-v1.10.7.js'), 'utf8');
const anchor = '  function repairDrone(g,d,owner,state,dt){';
assert.equal(source.split(anchor).length, 2, 'one canonical shipping repair path');
const instrumented = source.replace(anchor,
  '  window.__NOVA_REPAIR_TEST__=repairDrone;\n' + anchor);

function scenario({ hostileX = 100, hostileY = 0, enemy = true,
  enemyAlive = true, shield = 0, visible = true, ai = false,
  fairVisible = true } = {}) {
  class Game { updateDrones() {} }
  const mods = { 'game/engine': m => { m.exports.Game = Game; } };
  const window = { __novaModules: mods };
  if (ai) window.__NOVA_FAIR_ENGAGEMENT__ = {
    inGameplayViewport: (_g, _o, target) => fairVisible && target.id === 2
  };
  const ctx = { window, document: { addEventListener() {} },
    console: { info() {}, warn() {}, error() {} },
    Math, Number, Object, Array, Map, Set, WeakMap, Date };
  vm.runInNewContext(instrumented, ctx, { filename: 'second-body-live-vector-v1.10.7.js' });
  const m = { exports: {} };
  mods['game/engine'](m, m.exports, () => ({
    CLASSES: { carrier: { droneLeash: 650 } }
  }));
  const owner = { id: 1, kind: 'tank', cls: 'carrier', team: 'blue',
    x: 0, y: 0, alive: true, hp: 100, maxHp: 100,
    isPlayer: !ai, ai: ai ? { isElite: false } : null };
  const other = { id: 2, kind: 'tank', cls: 'gunner',
    team: enemy ? 'red' : 'blue', x: hostileX, y: hostileY,
    alive: enemyAlive, hp: enemyAlive ? 100 : 0, spawnShieldT: shield };
  const drone = { id: 10, kind: 'drone', ownerId: 1,
    x: 20, y: 0, r: 8, hp: 30, maxHp: 100, speed: 180,
    __novaPhase: 'recover', __novaPhaseT: 0,
    __lvRepairing: true, __lvRepairWait: 0, __lvLastHp: 30 };
  const g = new m.exports.Game();
  g.time = 10; g.tanks = [owner, other]; g.drones = [drone];
  g.getTank = id => g.tanks.find(t => t.id === id) || null;
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  g.hasLineOfSight = () => visible;
  g.firstTerrainHit = () => null;
  g.isTerrainSafe = () => true;
  const tick = (dt = 1 / 60) =>
    window.__NOVA_REPAIR_TEST__(g, drone, owner, { active: false }, dt);
  return { g, owner, other, drone, tick };
}

for (const hz of [30, 60, 120, 240]) {
  test('Controller drone cannot repair beside a visible hostile tank at ' + hz + 'Hz', () => {
    const s = scenario();
    s.tick(1 / hz);
    assert.equal(s.drone.hp, 30, 'active close-range enemy must interrupt repair');
  });
}

test('Controller drone still repairs at its original fast rate in genuine safety', () => {
  const s = scenario({ hostileX: 900 });
  s.tick(1 / 60);
  assert.ok(Math.abs(s.drone.hp - (30 + 100 * .11 / 60)) < 1e-9);
});

test('terrain-obscured hostile tank does not prevent repair', () => {
  const s = scenario({ visible: false });
  s.tick();
  assert.ok(s.drone.hp > 30);
});

test('allied tank does not prevent repair', () => {
  const s = scenario({ enemy: false });
  s.tick();
  assert.ok(s.drone.hp > 30);
});

test('dead or spawn-protected hostile tank cannot suppress repair', () => {
  for (const opts of [{ enemyAlive: false }, { shield: 2 }]) {
    const s = scenario(opts);
    s.tick();
    assert.ok(s.drone.hp > 30);
  }
});

test('AI Controller cannot use an offscreen tank to suppress its drone repair', () => {
  const s = scenario({ ai: true, fairVisible: false });
  s.tick();
  assert.ok(s.drone.hp > 30);
});

test('AI Controller responds to a legitimately visible hostile tank', () => {
  const s = scenario({ ai: true, fairVisible: true });
  s.tick();
  assert.equal(s.drone.hp, 30);
});

test('human Controller local defense does not depend on AI viewport filter', () => {
  const s = scenario({ ai: false, fairVisible: false });
  s.tick();
  assert.equal(s.drone.hp, 30);
});

test('committed dive remains committed and never repairs', () => {
  const s = scenario({ hostileX: 900 });
  s.drone.__novaPhase = 'dash';
  s.tick();
  assert.equal(s.drone.hp, 30);
});

test('recent damage still delays Controller repair after enemies leave', () => {
  const s = scenario({ hostileX: 900 });
  s.drone.__lvLastHp = 45;
  s.tick();
  assert.equal(s.drone.hp, 30);
  assert.ok(s.drone.__lvRepairWait > 2.5);
});

test('a hostile tank near the drone, but beyond the owner-centered radius, still interrupts service', () => {
  const s = scenario({ hostileX: 235 });
  s.tick();
  assert.equal(s.drone.hp, 30);
});

test('shipping Game.updateDrones gates multiple damaged drones with one owner scan per frame', () => {
  const s = scenario({ hostileX: 100 });
  const second = { ...s.drone, id: 11, x: 40, __lvLastHp: 30 };
  s.g.drones.push(second);
  s.g.player = s.owner;
  let relations = 0;
  s.g.areHostile = (a, b) => { relations++; return a.team !== b.team; };
  s.g.updateDrones(1 / 60);
  assert.equal(s.drone.hp, 30);
  assert.equal(second.hp, 30);
  assert.equal(relations, 1, 'one owner candidate snapshot, not one full scan per drone');
  s.other.x = 900;
  s.g.updateDrones(1 / 60);
  assert.ok(s.drone.hp > 30 && second.hp > 30,
    'next simulation update must refresh cached candidate list');
});

test('owner candidate cache still evaluates proximity independently for each drone', () => {
  const s = scenario({ hostileX: 240 });
  const farther = { ...s.drone, id: 11, x: -40, __lvLastHp: 30 };
  s.g.drones.push(farther);
  s.g.updateDrones(1 / 60);
  assert.equal(s.drone.hp, 30, 'near drone cannot heal');
  assert.ok(farther.hp > 30, 'distant drone can heal without sharing another drone\'s threat result');
});
