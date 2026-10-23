'use strict';
// Reproduces a shipped Swarm Discipline friendly-fire defect through the real
// engine wrapper, not a reimplementation of nearestDefense.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/drone-discipline-v1.5.1.js'), 'utf8');

function boot() {
  class Game {
    constructor() {
      this.time = 10; this.tanks = []; this.drones = []; this.shapes = [];
      this.tankById = new Map(); this.hits = [];
    }
    updateDrones() {}
    acquireDroneTarget() { return null; }
    damageDrone(target, damage, attackerId) {
      this.hits.push([target.id, damage, attackerId]);
      target.hp -= damage;
    }
    damageShape() {}
  }
  const modules = { 'game/engine': m => { m.exports.Game = Game; } };
  const win = { __novaModules: modules };
  vm.runInNewContext(source, {
    window: win, console: { info() {}, error() {} }, Math, Map, Set, Number
  }, { filename: 'drone-discipline-v1.5.1.js' });
  const mod = { exports: {} };
  modules['game/engine'](mod, mod.exports, () => ({}));
  return { Game: mod.exports.Game, hooks: win.__NOVA_DRONE_PERF_TEST__ };
}
function scenario(options = {}) {
  const { Game, hooks } = boot(), g = new Game();
  const owner = {
    id: 1, cls: 'carrier', alive: true, x: 0, y: 0, team: 'blue',
    swarmT: 0, __novaSwarm: { active: false, recallUntil: 0 }
  };
  const allyOwner = { id: 2, cls: 'marksman', alive: true, x: 50, y: 0, team: 'blue' };
  const enemyOwner = { id: 3, cls: 'marksman', alive: true, x: 70, y: 0, team: 'red' };
  const d = {
    id: 10, ownerId: 1, kind: 'drone', hp: 30, r: 8, dmg: 12,
    speed: 200, attackCd: 0, x: 0, y: 0, leash: 650,
    role: 'hunter', slot: 0, __novaPhase: 'idle'
  };
  const allyDrone = { id: 11, ownerId: 2, kind: 'drone', hp: 30, r: 8, x: options.allyX ?? 9, y: 0 };
  const enemyDrone = { id: 12, ownerId: 3, kind: 'drone', hp: 30, r: 8, x: options.enemyX ?? 200, y: 0 };
  g.tanks = [owner, allyOwner, enemyOwner];
  g.tankById = new Map(g.tanks.map(t => [t.id, t]));
  g.drones = [d, allyDrone, enemyDrone];
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  return { g, owner, allyOwner, enemyOwner, d, allyDrone, enemyDrone, hooks };
}

test('allied screen is never struck and hostile defense remains available', () => {
  const s = scenario();
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, [], 'nearby ally cannot absorb autonomous friendly fire');
  assert.equal(s.allyDrone.hp, 30);
  assert.equal(s.d.__novaDefenseTarget, s.enemyDrone,
    'a farther actual enemy should still be recognized');
});
test('with no enemy, friendly drone does not trigger defensive chase', () => {
  const s = scenario({ enemyX: 1000 });
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, []);
  assert.equal(s.d.__novaDefenseTarget, null);
  assert.notEqual(s.d.__novaIdleMode, 'defend');
});
test('actual hostile drone still intercepts and receives unchanged damage', () => {
  const s = scenario({ allyX: 15, enemyX: 9 });
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, [[12, 12, 1]]);
  assert.equal(s.enemyDrone.hp, 18);
  assert.equal(s.allyDrone.hp, 30);
});
test('non-hostile hook vetoes defense even without matching team metadata', () => {
  const s = scenario({ enemyX: 9, allyX: 1000 });
  s.g.areAllies = () => false;
  s.g.areHostile = () => false;
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, []);
  assert.equal(s.d.__novaDefenseTarget, null);
});
test('cached defense target is invalidated when allegiance changes', () => {
  const s = scenario({ allyX: 1000, enemyX: 9 });
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, [[12, 12, 1]]);
  s.enemyOwner.team = 'blue';
  s.d.attackCd = 0;
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, [[12, 12, 1]]);
  assert.equal(s.d.__novaDefenseTarget, null);
});
test('orphan drone without a known owner is not guessed hostile', () => {
  const s = scenario({ allyX: 1000, enemyX: 9 });
  s.g.tankById.delete(s.enemyOwner.id);
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, []);
});
test('teamId fallback protects allies when relation hooks are unavailable', () => {
  const s = scenario({ enemyX: 9, allyX: 15 });
  delete s.g.areAllies; delete s.g.areHostile;
  for (const t of s.g.tanks) { t.teamId = t.team === 'blue' ? 1 : 2; delete t.team; }
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, [[12, 12, 1]]);
});
test('free-for-all without team metadata still targets known other owners', () => {
  const s = scenario({ enemyX: 1000 });
  delete s.g.areAllies; delete s.g.areHostile;
  for (const t of s.g.tanks) delete t.team;
  s.g.updateDrones(.016);
  assert.deepEqual(s.g.hits, [[11, 12, 1]]);
});
test('acquireDroneTarget uses the same allied-drone defense exclusion', () => {
  const s = scenario({ enemyX: 200 });
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), s.enemyDrone);
  s.enemyOwner.team = 'blue';
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), null);
});
test('combat target test surface respects same-owner and dead-owner immunity', () => {
  const s = scenario();
  assert.equal(s.hooks.enemyDrone(s.g, s.d, s.owner), false);
  assert.equal(s.hooks.enemyDrone(s.g, s.allyDrone, s.owner), false);
  assert.equal(s.hooks.enemyDrone(s.g, s.enemyDrone, s.owner), true);
  s.enemyOwner.alive = false;
  assert.equal(s.hooks.enemyDrone(s.g, s.enemyDrone, s.owner), false);
});
