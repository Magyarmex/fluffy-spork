'use strict';
// Autonomous defensive drones must perceive hostile drones through the same
// Battlefield visibility contract used for physical contact. A target hidden
// by solid cover must not pull an idle swarm off its formation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/drone-discipline-v1.5.1.js'), 'utf8');

function boot() {
  class Game {
    constructor() {
      this.time = 10; this.drones = []; this.shapes = []; this.tanks = [];
      this.tankById = new Map(); this.hits = [];
    }
    updateDrones() {}
    acquireDroneTarget() { return null; }
    damageDrone(target, damage) { this.hits.push(target.id); target.hp -= damage; }
    damageShape() {}
  }
  const modules = { 'game/engine': m => { m.exports.Game = Game; } };
  const win = { __novaModules: modules };
  vm.runInNewContext(source, {
    window: win, console: { info() {}, error() {} }, Math, Map, Set, Number
  }, { filename: 'drone-discipline-v1.5.1.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({}));
  return m.exports.Game;
}

function scenario() {
  const Game = boot(), g = new Game();
  const owner = { id: 1, cls: 'carrier', alive: true, team: 'blue', x: 0, y: 0,
    swarmT: 0, __novaSwarm: { active: false, recallUntil: 0 } };
  const enemyOwner = { id: 2, cls: 'marksman', alive: true, team: 'red', x: 100, y: 0 };
  const d = { id: 10, kind: 'drone', ownerId: 1, hp: 30, r: 8, dmg: 12,
    speed: 200, attackCd: 0, x: 0, y: 0, leash: 650,
    role: 'hunter', slot: 0, __novaPhase: 'idle' };
  const hidden = { id: 11, kind: 'drone', ownerId: 2, hp: 30, r: 8, x: 40, y: 0 };
  const visible = { id: 12, kind: 'drone', ownerId: 2, hp: 30, r: 8, x: 90, y: 40 };
  g.tanks = [owner, enemyOwner];
  g.tankById = new Map([[1, owner], [2, enemyOwner]]);
  g.drones = [d, hidden, visible];
  g.hasLineOfSight = () => true;
  return { g, owner, d, hidden, visible };
}

test('an occluded hostile drone cannot trigger an idle defensive chase', () => {
  const { g, d } = scenario();
  g.drones = g.drones.slice(0, 2);
  g.hasLineOfSight = () => false;
  g.updateDrones(1 / 60);
  assert.equal(d.__novaDefenseTarget, null);
  assert.notEqual(d.__novaIdleMode, 'defend');
  assert.deepEqual(g.hits, []);
});

test('a visible hostile is chosen over a closer hostile behind cover', () => {
  const { g, d, visible } = scenario();
  g.hasLineOfSight = (ax, ay, bx) => bx !== 40;
  assert.equal(g.acquireDroneTarget(d, g.tanks[0], 650), visible);
  g.updateDrones(1 / 60);
  assert.equal(d.__novaDefenseTarget, visible);
  assert.equal(d.__novaIdleMode, 'defend');
});

test('cached defensive pursuit ends immediately when cover breaks visibility', () => {
  const { g, d, hidden } = scenario();
  g.drones = [d, hidden];
  g.updateDrones(1 / 60);
  assert.equal(d.__novaDefenseTarget, hidden);
  g.hasLineOfSight = () => false;
  g.updateDrones(1 / 60);
  assert.equal(d.__novaDefenseTarget, null);
  assert.notEqual(d.__novaIdleMode, 'defend');
});

test('solid terrain without a visibility API fails closed, not open', () => {
  const { g, d, hidden } = scenario();
  g.drones = [d, hidden];
  delete g.hasLineOfSight;
  g.__novaTerrain = [{ solid: true, destructible: false, hp: 0 }];
  assert.equal(g.acquireDroneTarget(d, g.tanks[0], 650), null);
  g.updateDrones(1 / 60);
  assert.equal(d.__novaDefenseTarget, null);
});

test('destroyed cover and genuinely open arenas preserve defense', () => {
  for (const terrain of [[], [{ solid: true, destructible: true, hp: 0 }]]) {
    const { g, d, hidden } = scenario();
    g.drones = [d, hidden];
    delete g.hasLineOfSight;
    g.__novaTerrain = terrain;
    g.updateDrones(1 / 60);
    assert.equal(d.__novaDefenseTarget, hidden);
    assert.equal(d.__novaIdleMode, 'defend');
  }
});

test('visibility gates defense only; deliberate command and allegiance rules remain untouched', () => {
  const { g, d, hidden } = scenario();
  g.drones = [d, hidden];
  g.hasLineOfSight = () => true;
  g.updateDrones(1 / 60);
  assert.equal(d.__novaDefenseTarget, hidden);
  g.tanks[1].team = 'blue';
  g.updateDrones(1 / 60);
  assert.equal(d.__novaDefenseTarget, null);
});
