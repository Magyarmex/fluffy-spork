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

test('a long visible-neutral chase does not count as a stalled unattempted patrol', () => {
  const {game, player, fair} = setup();
  game.shapes = [{id: 11, x: 200, y: 0, hp: 10}];
  const policy = createPublicRoam(game, player, {x: 0, y: 0}, fair);
  for (const time of [0, 1, 2, 3, 4, 5, 6]) {
    game.time = time;
    assert.ok(policy.move().x > 0, 'the neutral is still a public target');
  }
  game.shapes = [];
  game.time = 6.1;
  assert.deepEqual(policy.move(), {x: 1, y: 0});
  assert.equal(policy.stats().patrolIndex, 0);
  assert.equal(policy.stats().waypointFailures, 0);
});
test('real patrol stalls still advance after a neutral chase ends', () => {
  const {game, player, fair} = setup();
  game.shapes = [{id: 11, x: 200, y: 0, hp: 10}];
  const policy = createPublicRoam(game, player, {x: 0, y: 0}, fair);
  game.time = 0;
  policy.move();
  game.time = 5;
  policy.move();
  game.shapes = [];
  game.time = 5.1;
  policy.move();
  assert.equal(policy.stats().waypointFailures, 0, 'the chase cannot age the patrol');
  game.time = 8.5;
  policy.move();
  assert.equal(policy.stats().waypointFailures, 0, 'timeout is strict: exactly 3.5 seconds is not failure');
  game.time = 8.7;
  policy.move();
  assert.equal(policy.stats().waypointFailures, 1, 'genuine no-progress patrol times out');
  assert.equal(policy.stats().patrolIndex, 1);
});
test('a chase after prior patrol progress does not inherit a stale distance', () => {
  const {game, player, fair} = setup();
  const policy = createPublicRoam(game, player, {x: 0, y: 0}, fair);
  policy.move();
  player.x = 200;
  game.time = 1;
  policy.move(); // Record patrol progress toward x=420.
  game.shapes = [{id: 11, x: 200, y: 180, hp: 10}];
  game.time = 2;
  policy.move();
  game.shapes = [];
  game.time = 2.1;
  policy.move();
  assert.equal(policy.stats().waypointFailures, 0);
  game.time = 5.7;
  policy.move();
  assert.equal(policy.stats().waypointFailures, 1,
    'patrol timeout remains active after the chase, without stale progress');
});

test('seeded neutral-chase durations never masquerade as patrol failures',()=>{
  let seed=20261029;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let n=0;n<240;n++){
    const {game,player,fair}=setup();
    game.shapes=[{id:100+n,x:200,y:0,hp:10}];
    const policy=createPublicRoam(game,player,{x:0,y:0},fair);
    const duration=4+Math.floor(rand()*20)*.5;
    for(let t=0;t<=duration;t+=.5){game.time=t;policy.move();}
    game.shapes=[];
    game.time=duration+.01;
    policy.move();
    assert.equal(policy.stats().waypointFailures,0,
      'neutral chase is not patrol failure: trial '+n);
    assert.equal(policy.stats().patrolIndex,0);
    game.time=duration+3.61;
    policy.move();
    assert.equal(policy.stats().waypointFailures,1,
      'genuine stationary patrol must still time out: trial '+n);
  }
});
