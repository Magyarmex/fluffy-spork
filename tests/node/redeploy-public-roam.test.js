'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {visibleNeutral, createPublicRoam} = require('../research/redeploy-public-roam.cjs');
function setup() {
  const player = {id: 3, x: 0, y: 0};
  const game = {time: 0, cam: {x: 0, y: 0}, shapes: [],
    hasLineOfSight: () => true};
  const fair = {viewportHalfExtents: () => ({x: 300, y: 200})};
  return {game, player, fair};
}
test('public neutral acquisition rejects off-camera, dead, occluded and malformed targets', () => {
  const {game, player, fair} = setup();
  game.shapes = [{x: 10, y: 10, hp: 0}, {x: 500, y: 0, hp: 9},
    {x: NaN, y: 10, hp: 9}, {x: 70, y: 0, hp: 9}, {x: 120, y: 0, hp: 9}];
  game.hasLineOfSight = (x, y, tx) => tx !== 70;
  assert.equal(visibleNeutral(game, player, fair).x, 120);
  game.cam.x = 1000;
  assert.equal(visibleNeutral(game, player, fair), null);
  game.cam.x = 0;
  fair.viewportHalfExtents = () => null;
  assert.equal(visibleNeutral(game, player, fair), null);
});
test('roaming moves toward a visible neutral and stops tracking when occluded', () => {
  const {game, player, fair} = setup();
  game.shapes = [{x: 220, y: 80, hp: 4}];
  const policy = createPublicRoam(game, player, {x: 0, y: 0}, fair);
  assert.ok(policy.move().y > 0);
  assert.ok(policy.aim().y > 0);
  game.hasLineOfSight = (x, y, tx) => tx !== 220;
  assert.deepEqual(policy.aim(), null);
  assert.ok(Math.abs(policy.move().y) < 1e-9, 'falls back to a deterministic patrol waypoint');
});
test('patrol is bounded near map edge, advances, and uses terrain routing', () => {
  const {game, player, fair} = setup();
  player.x = 1895; player.y = 1895;
  const policy = createPublicRoam(game, player, {x: 1895, y: 1895}, fair);
  policy.move();
  assert.equal(policy.stats().patrolIndex, 1, 'clipped first waypoint is already reached');
  game.hasLineOfSight = () => false;
  game.novaBattlefieldWaypoint = () => ({x: 1850, y: 1800});
  const v = policy.move();
  assert.ok(v.x < 0 && v.y < 0);
  assert.equal(policy.stats().routeWaypoints, 1);
  assert.equal(policy.stats().routeRequests, 1);
});
test('no hidden neutral coordinate, invalid origin, or viewport omission can direct movement', () => {
  const {game, player, fair} = setup();
  assert.throws(() => createPublicRoam(game, player, {x: Infinity, y: 0}, fair));
  game.shapes = [{x: 1000, y: 1000, hp: 99}];
  const policy = createPublicRoam(game, player, {x: 0, y: 0}, fair);
  assert.deepEqual(policy.move(), {x: 1, y: 0});
  assert.equal(policy.aim(), null);
});
