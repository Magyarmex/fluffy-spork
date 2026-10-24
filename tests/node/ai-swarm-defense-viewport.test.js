'use strict';
// Regression: an AI drone must not use an offscreen hostile drone's live position
// through either native acquisition or the older idle-defense overlay.
// Load the real Fair Engagement viewport predicate; do not duplicate its math.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8');
const targeting = source('drone-targeting-v1.5.1.js');
const discipline = source('drone-discipline-v1.5.1.js');
const fair = source('fair-engagement-v1.11.2.js');

function boot(includeDiscipline = true) {
  const fairWindow = { __novaModules: {} };
  vm.runInNewContext(fair, { window: fairWindow, console: { info() {}, error() {} },
    Math, Number }, { filename: 'fair-engagement-v1.11.2.js' });
  assert.equal(typeof fairWindow.__NOVA_FAIR_ENGAGEMENT__.inGameplayViewport, 'function');

  class Game {
    constructor() {
      this.time = 10; this.w = 220; this.h = 380; this.cam = { zoom: 1 };
      this.tanks = []; this.drones = []; this.shapes = []; this.tankById = new Map();
      this.nativeTarget = null; this.hits = [];
    }
    acquireDroneTarget() { return this.nativeTarget; }
    updateDrones() {}
    damageDrone(target, damage) { this.hits.push(target.id); target.hp -= damage; }
    damageShape() {}
  }
  const modules = { 'game/engine': m => { m.exports.Game = Game; } };
  const win = { __novaModules: modules,
    __NOVA_FAIR_ENGAGEMENT__: fairWindow.__NOVA_FAIR_ENGAGEMENT__ };
  const ctx = { window: win, console: { info() {}, error() {} }, Math, Map, Set, Number };
  vm.runInNewContext(targeting, ctx, { filename: 'drone-targeting-v1.5.1.js' });
  if (includeDiscipline) vm.runInNewContext(discipline, ctx,
    { filename: 'drone-discipline-v1.5.1.js' });
  const mod = { exports: {} };
  modules['game/engine'](mod, mod.exports, () => ({}));
  return mod.exports.Game;
}

function scenario(options = {}) {
  const Game = boot(options.discipline !== false), g = new Game();
  const owner = { id: 1, cls: 'carrier', kind: 'tank', alive: true,
    team: 'blue', x: 0, y: 0, ai: {}, swarmT: 0,
    __novaSwarm: { active: false, recallUntil: 0 } };
  if (options.player) { owner.isPlayer = true; delete owner.ai; }
  const enemyOwner = { id: 2, kind: 'tank', cls: 'marksman', alive: true,
    team: 'red', x: 900, y: 0 };
  const d = { id: 10, kind: 'drone', ownerId: 1, hp: 30, r: 8, dmg: 10,
    x: 0, y: 0, speed: 120, attackCd: 0, leash: 650, slot: 0,
    role: 'hunter', __novaPhase: 'idle' };
  // Hidden is nearer in Euclidean distance, but outside the 110-unit
  // horizontal half-viewport. Visible is inside both half-extents.
  const hidden = { id: 11, kind: 'drone', ownerId: 2, hp: 30, r: 8,
    x: 130, y: 0 };
  const visible = { id: 12, kind: 'drone', ownerId: 2, hp: 30, r: 8,
    x: 90, y: 170 };
  g.tanks = [owner, enemyOwner];
  g.tankById = new Map(g.tanks.map(t => [t.id, t]));
  g.drones = [d, hidden, visible];
  g.hasLineOfSight = () => true;
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  return { g, owner, d, hidden, visible };
}

test('AI idle-defense picks a farther visible drone rather than an offscreen nearer drone', () => {
  const s = scenario();
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), s.visible);
  s.g.updateDrones(1 / 60);
  assert.equal(s.d.__novaDefenseTarget, s.visible);
  assert.equal(s.d.__novaIdleMode, 'defend');
});

test('cached defensive target is dropped immediately after a portrait viewport shrink', () => {
  const s = scenario();
  s.g.w = 300;
  s.g.updateDrones(1 / 60);
  assert.equal(s.d.__novaDefenseTarget, s.hidden);
  s.g.w = 220;
  s.g.updateDrones(1 / 60);
  assert.equal(s.d.__novaDefenseTarget, s.visible);
});

test('offscreen hostile cannot trigger AI idle defense when no visible alternative exists', () => {
  const s = scenario();
  s.g.drones = [s.d, s.hidden];
  s.g.updateDrones(1 / 60);
  assert.equal(s.d.__novaDefenseTarget, null);
  assert.notEqual(s.d.__novaIdleMode, 'defend');
});

test('human-owned defensive drones preserve local autonomous interception', () => {
  const s = scenario({ player: true });
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), s.hidden);
  s.g.updateDrones(1 / 60);
  assert.equal(s.d.__novaDefenseTarget, s.hidden);
});

test('native offscreen hostile drone is rejected in favor of visible hostile fallback', () => {
  const s = scenario({ discipline: false });
  s.g.nativeTarget = s.hidden;
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), s.visible);
});

test('native offscreen hostile cannot suppress neutral farming', () => {
  const s = scenario({ discipline: false });
  s.g.nativeTarget = s.hidden;
  s.g.drones = [s.d, s.hidden];
  const shape = { id: 30, kind: 'shape', x: 40, y: 0, hp: 20 };
  s.g.shapes = [shape];
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), shape);
});

test('native visible drone, human drone, and public hostile tank remain valid', () => {
  const s = scenario({ discipline: false });
  s.g.nativeTarget = s.visible;
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), s.visible);
  s.g.nativeTarget = s.hidden;
  const tank = { id: 3, kind: 'tank', alive: true, team: 'red',
    x: 600, y: 0, hp: 100 };
  s.g.nativeTarget = tank;
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), tank);
  const human = scenario({ discipline: false, player: true });
  human.g.nativeTarget = human.hidden;
  assert.equal(human.g.acquireDroneTarget(human.d, human.owner, 650), human.hidden);
});

test('landscape rotation and zoom immediately change fair defensive perception', () => {
  const s = scenario();
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), s.visible);
  s.g.w = 380; s.g.h = 220;
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), s.hidden);
  s.g.cam.zoom = 2;
  s.g.drones = [s.d, s.hidden];
  assert.equal(s.g.acquireDroneTarget(s.d, s.owner, 650), null);
});
