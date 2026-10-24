'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const controller = fs.readFileSync(path.join(root, 'nova-updates/controller-v1.3.0.js'), 'utf8');
const liveVector = fs.readFileSync(path.join(root, 'nova-updates/second-body-live-vector-v1.10.7.js'), 'utf8');
const shipping = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function extract(source, begin, end) {
  const a = source.indexOf(begin);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'expected canonical runtime function: ' + begin);
  return source.slice(a, b).trim();
}

const updateAICommand = new Function(
  'clampNode', 'lerp', 'maxCommandRange', 'clamp',
  'return (' + extract(controller, 'function updateAICommand(', 'function updateCommand(') + ')'
)(
  (owner, x, y) => ({x, y}),
  (a, b, t) => a + (b - a) * t,
  () => 650,
  (x, lo, hi) => Math.max(lo, Math.min(hi, x))
);

const prepareAIVirtualThumbs = new Function(
  'C', 'isController', 'virtualPoint',
  'return (' + extract(liveVector, 'function prepareAIVirtualThumbs(', 'function steerToward(') + ')'
)(
  {carrier: {droneLeash: 650}},
  owner => !!owner && owner.cls === 'carrier',
  (owner, def, angle, power) => ({
    x: owner.x + Math.cos(angle) * 200,
    y: owner.y + Math.sin(angle) * 200,
    range: 200, power, angle
  })
);

function owner(id, targetId = 8) {
  return {
    id, cls: 'carrier', alive: true, isPlayer: false, x: 0, y: 0, angle: 0,
    ai: {state: 'hunt', targetId, strafe: 1, isElite: false, __v1112TargetId: targetId},
    __novaLiveVectorAI: {active: true, commandAngle: 0, commandPower: 1}
  };
}
function harness({collide = false, second = false} = {}) {
  const a = owner(7), b = second ? owner(8, 9) : null;
  const real = {id: 8, alive: true, x: 300, y: 0};
  const real2 = {id: 9, alive: true, x: 320, y: 0};
  const reserved = {id: 900007, alive: true, x: 400, y: 0};
  const originals = new Map([[8, real], [9, real2]]);
  if (collide) originals.set(900007, reserved);
  const getTank = id => originals.get(id) || null;
  const game = {tanks: b ? [a, b] : [a], getTank};
  return {game, a, b, real, reserved, getTank};
}
function command(game, a) {
  const state = {nodeX: 0, nodeY: 0, angle: 0, wasActive: false, markUntil: 0};
  updateAICommand(game, a, state, {droneLeash: 650}, 1 / 60);
  return state;
}

test('shipping composition contains canonical Controller command and later Live Vector bridge', () => {
  const a = shipping.indexOf('nova-updates/controller-v1.3.0.js');
  const b = shipping.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
  assert.ok(a >= 0 && b > a, 'production loads Controller before Live Vector');
  assert.match(controller, /ai && ai\.targetId >= 0 \? g\.getTank\(ai\.targetId\) : null/);
  assert.match(controller, /var st = updateCommand\(this, owner0, dt\)/);
  assert.match(liveVector, /var restore=prepareAIVirtualThumbs\(this\),out/);
});

test('AI Controller virtual point passes canonical nonnegative target gate and commands forward', () => {
  const {game, a, getTank} = harness();
  const originalState = a.ai.state, originalStrafe = a.ai.strafe;
  const restore = prepareAIVirtualThumbs(game);
  assert.ok(a.ai.targetId >= 0, 'canonical updateAICommand rejects negative target IDs');
  const fake = game.getTank(a.ai.targetId);
  assert.ok(fake && fake.alive && fake.x > a.x, 'virtual point is reachable');
  const state = command(game, a);
  assert.equal(state.active, true, 'AI swarm command must not silently recall');
  assert.ok(state.nodeX > 0 && state.power > 0, 'swarm advances toward polar stick');
  restore();
  assert.equal(game.getTank, getTank, 'getTank bridge must be temporary');
  assert.equal(a.ai.targetId, 8);
  assert.equal(a.ai.state, originalState);
  assert.equal(a.ai.strafe, originalStrafe);
  assert.equal(a.ai.__v1112TargetId, 8, 'Fair Engagement contact remains real');
});

test('virtual ID never shadows a real high-ID tank', () => {
  const {game, a, reserved} = harness({collide: true});
  const restore = prepareAIVirtualThumbs(game);
  assert.notEqual(a.ai.targetId, reserved.id);
  assert.equal(game.getTank(reserved.id), reserved, 'real tank lookup stays authoritative');
  assert.equal(command(game, a).active, true);
  restore();
});

test('two simultaneous AI Controllers get independent positive virtual targets', () => {
  const {game, a, b, getTank} = harness({second: true});
  const restore = prepareAIVirtualThumbs(game);
  assert.ok(a.ai.targetId >= 0 && b.ai.targetId >= 0);
  assert.notEqual(a.ai.targetId, b.ai.targetId);
  assert.notEqual(game.getTank(a.ai.targetId), game.getTank(b.ai.targetId));
  assert.equal(command(game, a).active, true);
  assert.equal(command(game, b).active, true);
  restore();
  assert.equal(game.getTank, getTank);
  assert.equal(a.ai.targetId, 8);
  assert.equal(b.ai.targetId, 9);
});

test('inactive AI Controller still releases its command instead of inventing a target', () => {
  const {game, a} = harness();
  a.__novaLiveVectorAI.active = false;
  const restore = prepareAIVirtualThumbs(game);
  assert.equal(a.ai.targetId, -1);
  assert.equal(command(game, a).active, false);
  restore();
  assert.equal(a.ai.targetId, 8);
});
