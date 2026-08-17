const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/controller-command-weave-v1.10.0.js'), 'utf8');

function boot() {
  const listeners = new Map();
  const document = {
    addEventListener(type, fn, capture) { listeners.set(type, { fn, capture }); }
  };
  const window = { __novaModules: {} };
  const context = { window, document, console: { info() {}, warn() {}, error() {} }, Date, Math, Map, WeakMap, Set, Object, Array };
  vm.runInNewContext(source, context, { filename: 'controller-command-weave-v1.10.0.js' });
  return { window, listeners };
}

test('Command Weave covers the entire Controller lineage', () => {
  const { window } = boot();
  const T = window.__NOVA_COMMAND_WEAVE_TEST__;
  for (const id of ['carrier','overlord','warden','hivemind','broodmother','citadel','valkyrie']) assert.equal(T.isControllerId(id), true, id);
  assert.equal(T.isControllerId('sniper'), false);
});

test('persistent swarm command is translated into a synthetic aim vector without requiring live aim input', () => {
  const { window } = boot();
  const T = window.__NOVA_COMMAND_WEAVE_TEST__;
  const owner = { x: 0, y: 0, angle: 0, swarmT: 0 };
  const def = { droneLeash: 650 };
  const active = T.fakeAimFor(owner, def, { active: true, mode: 'point', x: 320, y: 0 });
  assert.equal(active.active, true);
  assert.ok(active.dx > 4);
  assert.ok(Math.abs(active.dy) < 1e-9);
  assert.equal(active.__novaCommandWeave, true);
  assert.equal(T.fakeAimFor(owner, def, { active: false, mode: 'recall', x: 0, y: 0 }).active, false);
});

test('Controller hostility respects game alliance APIs while preserving free-for-all fallback', () => {
  const { window } = boot();
  const T = window.__NOVA_COMMAND_WEAVE_TEST__;
  const owner = { id: 1, alive: true, teamId: 'blue' };
  const ally = { id: 2, alive: true, teamId: 'blue' };
  const enemy = { id: 3, alive: true, teamId: 'red' };
  const alliedGame = {
    areAllies(a, b) { return a.teamId === b.teamId; },
    areHostile(a, b) { return a.teamId !== b.teamId; }
  };
  assert.equal(T.hostile(alliedGame, owner, ally), false);
  assert.equal(T.hostile(alliedGame, owner, enemy), true);
  assert.equal(T.hostile({}, owner, ally), false, 'shared side metadata should remain allied without game helpers');
  assert.equal(T.hostile({}, owner, { id: 4, alive: true }), true, 'unknown relation preserves historical FFA behavior');
});

test('all touch buttons get a capture-phase independent activation bridge', () => {
  const { window, listeners } = boot();
  assert.equal(listeners.get('pointerdown').capture, true);
  assert.equal(listeners.get('click').capture, true);
  assert.equal(window.__NOVA_COMMAND_WEAVE_TEST__.buttonGuardMs, 850);
});

test('a non-primary second touch activates an ordinary button even while another gameplay pointer may be held', () => {
  const { window } = boot();
  let clicks = 0, prevented = 0, stopped = 0;
  const button = { disabled: false, click() { clicks += 1; }, classList: { contains() { return false; } } };
  const target = { closest(selector) { return selector === 'button' ? button : null; } };
  window.__NOVA_COMMAND_WEAVE_BUTTON_TEST__.pointerDown({
    pointerType: 'touch', pointerId: 29, isPrimary: false, target, cancelable: true,
    preventDefault() { prevented += 1; }, stopImmediatePropagation() { stopped += 1; }
  });
  assert.equal(clicks, 1);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
});

test('the existing ultimate pointer owner is not double-bridged', () => {
  const { window } = boot();
  window.__NOVA_MULTITOUCH_ULTIMATE__ = { version: '1.9.2' };
  const holder = { classList: { contains(v) { return v === 'bottom-6' || v === 'right-4'; } } };
  const button = {
    parentElement: holder,
    classList: { contains(v) { return v === 'h-[68px]' || v === 'w-[68px]'; } }
  };
  assert.equal(window.__NOVA_COMMAND_WEAVE_BUTTON_TEST__.isLegacyUltimate(button), true);
});

test('source hardens pointer ownership and fully isolates live cannon input from swarm translation', () => {
  assert.match(source, /__novaPointerOwners=new Map\(\)/);
  assert.match(source, /canvas\.setPointerCapture\(e\.pointerId\)/);
  assert.match(source, /input\.aim=fakeAimFor\(player,C\[player\.cls\],c\)/);
  assert.match(source, /input\.mouseActive=false/);
  assert.match(source, /input\.aim=realAim;input\.mouseActive=realMouse/);
});

test('manual stamps, AI targets, defense screens and disruption all use the same hostility gate', () => {
  assert.match(source, /function aimStampTarget[\s\S]*?!hostile\(g,owner,t\)/);
  assert.match(source, /function bestObservedTank[\s\S]*?hostile\(g,owner,current\)[\s\S]*?!hostile\(g,owner,t\)/);
  assert.match(source, /function hostileDroneNear[\s\S]*?!hostile\(g,owner,hostileOwner\)/);
  assert.match(source, /otherOwner=this\.getTank&&this\.getTank\(d\.ownerId\);if\(!otherOwner\|\|!hostile\(this,killer,otherOwner\)\)continue/);
  assert.match(source, /target&&target\.alive&&hostile\(this,player,target\)/);
});

test('combat pass includes screens, repair, disruption, sensed AI, real reserves, and committed-dive preservation', () => {
  assert.match(source, /function peelScreen\(/);
  assert.match(source, /function repairDrone\(/);
  assert.match(source, /function directControllerBullet\(/);
  assert.match(source, /function sensorSees\(/);
  assert.match(source, /function maintainAIScreen\(/);
  assert.match(source, /plan\.pressure==='probe' \? \.58 : \.30/);
  assert.match(source, /if\(d\.__novaPhase==='dash'\)return false/);
  assert.match(source, /novaBattlefieldWaypoint/);
  assert.match(source, /SWARM FORMING/);
  assert.match(source, /commitUntil/);
});
