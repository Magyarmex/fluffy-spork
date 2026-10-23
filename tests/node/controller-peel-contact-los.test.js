'use strict';
// Live Vector peel defenders may see a hostile drone through the owner's
// sightline while their own short-range contact is blocked by solid cover.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raw = fs.readFileSync(path.join(__dirname, '../../nova-updates/second-body-live-vector-v1.10.7.js'), 'utf8');
const anchor = '  function postProcessControllers(g,dt){';
assert.equal(raw.split(anchor).length, 2);
const source = raw.replace(anchor, '  window.__testPeelScreen = peelScreen;\n' + anchor);

function setup(blocked) {
  class Game { updateDrones() {} setClass() {} }
  const modules = { 'game/engine': m => { m.exports.Game = Game; } };
  const win = { __novaModules: modules };
  const ctx = { window: win, Math, Number, Map, Set, WeakMap, Array, Object, Date,
    document: { addEventListener() {} }, console: { info() {}, warn() {}, error() {} } };
  vm.runInNewContext(source, ctx, { filename: 'second-body-live-vector-v1.10.7.js' });
  // peelScreen is private to the engine wrapper; initialize the actual module.
  const engine = { exports: {} };
  modules['game/engine'](engine, engine.exports, () => ({ CLASSES: { carrier: { droneLeash: 650 } } }));
  assert.equal(typeof win.__testPeelScreen, 'function');
  const owner = { id: 1, cls: 'carrier', x: 0, y: 60, alive: true };
  const drone = { id: 10, ownerId: 1, x: 90, y: 0, r: 8, hp: 20,
    speed: 200, dmg: 10, attackCd: 0, __novaPhase: 'form' };
  const hostile = { id: 20, ownerId: 3, x: 110, y: 0, r: 8, hp: 20 };
  let hits = 0;
  const g = {
    time: 7, damageDrone() { hits++; },
    // A narrow wall at x=100, |y|<=4. The owner at (0,60) can see
    // the threat, but the defender at (90,0) cannot make contact.
    hasLineOfSight(ax, ay, bx, by) {
      if (!blocked || ax === bx) return true;
      if ((ax < 100 && bx > 100) || (ax > 100 && bx < 100)) {
        const y = ay + (by - ay) * (100 - ax) / (bx - ax);
        return Math.abs(y) > 4;
      }
      return true;
    }
  };
  return { win, g, owner, drone, hostile, hits: () => hits };
}

test('owner-visible threat cannot be struck by a defender through a narrow wall', () => {
  const s = setup(true);
  assert.equal(s.g.hasLineOfSight(s.owner.x, s.owner.y, s.hostile.x, s.hostile.y), true);
  assert.equal(s.g.hasLineOfSight(s.drone.x, s.drone.y, s.hostile.x, s.hostile.y), false);
  s.win.__testPeelScreen(s.g, [s.drone], s.owner, { active: false, power: 0 }, s.hostile, 0);
  assert.equal(s.hits(), 0);
  assert.equal(s.drone.attackCd, 0, 'no attack cooldown for a physically blocked contact');
});

test('open close-range peel contact still damages a hostile drone', () => {
  const s = setup(false);
  s.win.__testPeelScreen(s.g, [s.drone], s.owner, { active: false, power: 0 }, s.hostile, 0);
  assert.equal(s.hits(), 1);
  assert.equal(s.drone.attackCd, .38);
});

test('deep command still gives up automatic peel contact', () => {
  const s = setup(false);
  s.win.__testPeelScreen(s.g, [s.drone], s.owner, { active: true, power: 1 }, s.hostile, 0);
  assert.equal(s.hits(), 0);
});
