'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const spotter = fs.readFileSync(path.join(root, 'nova-updates/spotter-intelligence-v1.5.1.js'), 'utf8');
const shipping = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function boot() {
  class Game {
    updateDrones() {}
    getTank(id) { return this.tankById.get(id) || null; }
    hasLineOfSight() { return !this.blocked; }
    addRing() {}
    addText() {}
  }
  const modules = { 'game/engine'(m) { m.exports.Game = Game; } };
  const window = { __novaModules: modules };
  vm.runInNewContext(spotter, { window, Math, Number,
    console: { info() {}, error() {} }, performance: { now: () => 0 } },
    { filename: 'spotter-intelligence-v1.5.1.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({}));
  return m.exports.Game;
}
function world() {
  const Game = boot(), g = new Game();
  const owner = { id: 1, cls: 'marksman', alive: true, isPlayer: true,
    x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: 100 };
  const target = { id: 2, cls: 'basic', alive: true,
    x: 400, y: 0, vx: 0, vy: 0, angle: 0, hp: 100, spawnShieldT: 0 };
  const drone = { id: 3, ownerId: 1, __novaSpotter: true, hp: 100,
    x: 0, y: 0, angle: 0, slot: 0, speed: 285, leash: 1000 };
  Object.assign(g, { time: 10, w: 400, h: 300, cam: { x: 0, y: 0, zoom: 1 },
    tanks: [owner, target], drones: [drone], bullets: [],
    tankById: new Map([[1, owner], [2, target]]), player: owner });
  return { g, owner, target, drone };
}
function acquire(w) {
  w.g.updateDrones(0);
  assert.equal(w.owner.__novaSpotterContactId, 2, 'visible, unshielded target is genuinely acquired');
  assert.ok(w.owner.__novaSpotterContactUntil > w.g.time);
  assert.equal(w.drone.__novaLastKnownX, 400);
}

test('shipping composition includes the actual spotter, Battlefield, framing and Fair Engagement overlays', () => {
  for (const name of ['battlefield-v1.6.0.js', 'spotter-intelligence-v1.5.1.js',
    'tactical-framing-v1.8.2.js', 'fair-engagement-v1.11.2.js'])
    assert.ok(shipping.includes('nova-updates/' + name), name);
});

test('relay expires when target leaves Observer sight cone; last-known location stays frozen', () => {
  const w = world(); acquire(w);
  w.target.x = 0; w.target.y = 400;
  w.g.time += .1; w.g.updateDrones(0);
  assert.equal(w.owner.__novaSpotterContactId, -1,
    'out-of-cone target cannot remain a live remote relay');
  assert.equal(w.owner.__novaSpotterContactUntil, 0);
  assert.equal(w.drone.__novaLastKnownX, 400, 'search may retain witnessed x');
  assert.equal(w.drone.__novaLastKnownY, 0, 'search may retain witnessed y');
  w.target.x = 400; w.target.y = 0;
  w.g.time += .1; w.g.updateDrones(0);
  assert.equal(w.owner.__novaSpotterContactId, 2, 'new direct observation reacquires normally');
});

test('relay expires immediately when terrain blocks the Observer', () => {
  const w = world(); acquire(w);
  w.g.blocked = true; w.g.time += .1; w.g.updateDrones(0);
  assert.equal(w.owner.__novaSpotterContactId, -1);
  assert.equal(w.owner.__novaSpotterContactUntil, 0);
});

test('dead Observer cannot continue scanning or grant live target coordinates', () => {
  const w = world(); acquire(w);
  w.drone.hp = 0; w.g.time += .1; w.g.updateDrones(0);
  assert.equal(w.owner.__novaSpotterContactId, -1);
  assert.equal(w.owner.__novaSpotterContactUntil, 0);
});

test('missing Observer and disabled Observer clear stale relay without removing memory of last sighting', () => {
  const w = world(); acquire(w);
  w.g.drones = []; w.g.time += .1; w.g.updateDrones(0);
  assert.equal(w.owner.__novaSpotterContactId, -1);
  w.g.drones = [w.drone]; w.g.time += .1; acquire(w);
  w.owner.__novaSpotterDownUntil = w.g.time + 1;
  w.g.time += .1; w.g.updateDrones(0);
  assert.equal(w.owner.__novaSpotterContactId, -1);
  assert.equal(w.owner.__novaSpotterContactUntil, 0);
});
