'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function routeDistanceFromShippingSource() {
  const window = { __novaModules: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../nova-updates/battle-sense-v1.8.1.js'), 'utf8'),
    { window, Math, Number, Object, Array, console: { info() {}, error() {} } },
    { filename: 'battle-sense-v1.8.1.js' }
  );
  return window.__NOVA_BATTLE_SENSE_TEST__.routeDistance;
}
const routeDistance = routeDistanceFromShippingSource();
const tank = { id: 7, cls: 'guard', x: 0, y: 0 };
const target = { id: 'heal', x: 100, y: 0 };
const classes = { CLASSES: { guard: { size: 15 } } };

function scene(safe, certified) {
  const calls = { certificate: 0, waypoint: 0, route: 0 };
  const g = {
    hasLineOfSight: () => false,
    isTerrainSafe: () => safe,
    novaReadOnlyExactRouteLength: () => { calls.certificate++; return certified; },
    novaBattlefieldWaypoint: () => { calls.waypoint++; return { x: 30, y: 30 }; },
    novaRouteLength: () => { calls.route++; return 180; }
  };
  return { g, calls };
}

test('certified exact-goal route is read without mutating live movement route from safe and unsafe starts', () => {
  for (const safe of [true, false]) {
    const { g, calls } = scene(safe, 150);
    assert.equal(routeDistance(g, tank, target, 100, classes), 150);
    assert.equal(calls.certificate, 1);
    assert.equal(calls.waypoint, 0, 'strategic pricing must not replace the movement waypoint');
    assert.equal(calls.route, 0);
  }
});

test('missing, stale, invalid or negative certificate falls back to the existing live planner', () => {
  for (const certified of [null, NaN, Infinity, -1]) {
    const { g, calls } = scene(true, certified);
    assert.equal(routeDistance(g, tank, target, 100, classes), 180);
    assert.equal(calls.certificate, 1);
    assert.equal(calls.waypoint, 1);
    assert.equal(calls.route, 1);
  }
});

test('directly visible pickup remains a straight-line route with no certificate or live planning', () => {
  const { g, calls } = scene(true, 150);
  g.hasLineOfSight = () => true;
  assert.equal(routeDistance(g, tank, target, 100, classes), 100);
  assert.equal(calls.certificate, 0);
  assert.equal(calls.waypoint, 0);
});

test('certified route is queried for the exact goal, current tank and class clearance', () => {
  const { g } = scene(true, 150);
  let args;
  g.novaReadOnlyExactRouteLength = (...values) => { args = values; return 150; };
  assert.equal(routeDistance(g, tank, target, 100, classes), 150);
  assert.deepEqual(Array.from(args), [0, 0, 100, 0, 23, 7]);
});
