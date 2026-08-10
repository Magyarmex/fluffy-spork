const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/second-body-live-vector-v1.10.7.js'), 'utf8');
const deploy = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');

function boot() {
  const listeners = new Map();
  const document = { addEventListener(type, fn, capture) { listeners.set(type, { fn, capture }); } };
  const window = { __novaModules: {} };
  const context = { window, document, console: { info() {}, warn() {}, error() {} }, Date, Math, Map, WeakMap, Set, Object, Array, Number };
  vm.runInNewContext(source, context, { filename: 'second-body-live-vector-v1.10.7.js' });
  return { window, listeners };
}

test('polar live vector maps stick angle and depth without storing a waypoint', () => {
  const { window } = boot(), T = window.__NOVA_LIVE_VECTOR_TEST__;
  const owner = { x: 10, y: 20, angle: 1, swarmT: 0 }, def = { droneLeash: 650 };
  const shallow = T.liveVectorFromAim(owner, def, { active: true, dx: 5, dy: 0 });
  const deep = T.liveVectorFromAim(owner, def, { active: true, dx: 51, dy: 0 });
  assert.equal(shallow.active, true);
  assert.equal(deep.active, true);
  assert.ok(deep.range > shallow.range);
  assert.ok(Math.abs(deep.angle) < 1e-9);
  assert.ok(deep.x > shallow.x);
  const released = T.liveVectorFromAim(owner, def, { active: false, dx: 51, dy: 0 });
  assert.equal(released.active, false);
  assert.equal(released.power, 0);
});

test('deep deployment progressively removes automatic peel coverage', () => {
  const { window } = boot(), T = window.__NOVA_LIVE_VECTOR_TEST__;
  assert.ok(T.peelFraction(0) > T.peelFraction(.3));
  assert.equal(T.peelFraction(.58), 0);
  assert.equal(T.peelFraction(1), 0);
});

test('AI virtual stick is tied to actual gun angle with bounded shear', () => {
  const { window } = boot(), T = window.__NOVA_LIVE_VECTOR_TEST__;
  const owner = { x: 0, y: 0, angle: .7, hp: 100, maxHp: 100, swarmT: 0, ai: { isElite: false } };
  const target = { alive: true, x: 500, y: 0 };
  const plan = { pressure: 'breach', flankSide: -1, releaseUntil: 0, now: 1 };
  const v = T.aiVirtualStick(owner, { droneLeash: 650 }, target, plan, null);
  assert.equal(v.active, true);
  assert.ok(Math.abs(v.angle - owner.angle) <= T.normalShear + 1e-9);
  assert.ok(Math.abs(v.shear) <= T.normalShear + 1e-9);
});

test('AI pulls depth inward under a local drone breach and releases when critical', () => {
  const { window } = boot(), T = window.__NOVA_LIVE_VECTOR_TEST__;
  const owner = { x: 0, y: 0, angle: 0, hp: 100, maxHp: 100, swarmT: 0, ai: { isElite: true } };
  const target = { alive: true, x: 520, y: 0 };
  const plan = { pressure: 'breach', flankSide: 1, releaseUntil: 0, now: 1 };
  const open = T.aiVirtualStick(owner, { droneLeash: 650 }, target, plan, null);
  const threatened = T.aiVirtualStick(owner, { droneLeash: 650 }, target, plan, { id: 5 });
  assert.ok(threatened.power < open.power);
  owner.hp = 10;
  assert.equal(T.aiVirtualStick(owner, { droneLeash: 650 }, target, plan, null).active, false);
});

test('runtime keeps multitouch button bridge but contains no command pad implementation', () => {
  const { window, listeners } = boot();
  assert.equal(listeners.get('pointerdown').capture, true);
  assert.equal(listeners.get('click').capture, true);
  assert.equal(window.__NOVA_LIVE_VECTOR_TEST__.buttonGuardMs, 850);
  assert.doesNotMatch(source, /nova-command-pad/);
  assert.doesNotMatch(source, /tap CMD|double-tap|drag CMD/i);
});

test('runtime preserves designation, committed dives and direct-fire defense without radial bailout', () => {
  assert.match(source, /DESIGNATE/);
  assert.match(source, /d\.__novaPhase==='dash'\|\|d\.__novaCommitted/);
  assert.match(source, /d\.__novaPhase==='windup'/);
  assert.doesNotMatch(source, /secondary=Math\.max\(/);
  assert.doesNotMatch(source, /radius=62/);
});

test('AI command is translated through synthetic polar thumb points then restored', () => {
  assert.match(source, /prepareAIVirtualThumbs/);
  assert.match(source, /virtualPoint\(owner,C\[owner\.cls\],p\.commandAngle,p\.commandPower\)/);
  assert.match(source, /owner\.ai\.strafe=1e-6/);
  assert.match(source, /g\.getTank=function\(id\)\{return fake\[id\]\|\|realGet\.call\(this,id\);\}/);
  assert.match(source, /g\.getTank=realGet/);
});

test('runtime exposes constant-memory Controller telemetry for diagnostics', () => {
  const { window } = boot();
  assert.equal(typeof window.__NOVA_LIVE_VECTOR_SNAPSHOT__, 'function');
  assert.match(source, /__NOVA_LIVE_VECTOR_LAST__/);
  assert.match(source, /designatedTargetId/);
  assert.match(source, /localDefenders/);
  assert.match(source, /nodeSpeed/);
});

test('production materializer retires Command Weave and loads Live Vector', () => {
  assert.doesNotMatch(deploy, /scripts = \[[\s\S]*controller-command-weave-v1\.10\.0\.js[\s\S]*\]/);
  assert.match(deploy, /nova-updates\/second-body-live-vector-v1\.10\.7\.js/);
  assert.match(deploy, /grep -q 'nova-updates\/second-body-live-vector-v1\.10\.7\.js'/);
});
