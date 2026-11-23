'use strict';
// Research-only source-executed witness for #1081. This characterizes a
// historical-shot classification risk; it does NOT endorse the behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function boot() {
  function Game() {}
  Game.prototype.tryFire = function() {};
  Game.prototype.moveTank = function() {};
  Game.prototype.updatePowerups = function() {};
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; }
  };
  const window = { __novaModules: modules };
  const source = fs.readFileSync(path.join(__dirname,
    '../../nova-updates/battle-sense-v1.8.1.js'), 'utf8');
  vm.runInNewContext(source, { window, Math, Number, Object, Array, Map,
    console: { info() {}, warn() {}, error() {} } }, { filename: 'battle-sense-v1.8.1.js' });
  assert.ok(window.__NOVA_BATTLE_SENSE_TEST__?.thirdPartyVector);
  return window.__NOVA_BATTLE_SENSE_TEST__.thirdPartyVector;
}
function scene() {
  const observer = { id: 1, x: 0, y: -80, alive: true, team: 1, ai: {
    __v181ObservedShotId: 2, __v181ObservedShotAt: 10,
    __v181ObservedShotAngle: 0, __v181ObservedShotX: 0, __v181ObservedShotY: 0
  } };
  const shooter = { id: 2, x: 0, y: 0, alive: true, team: 2 };
  const victim = { id: 3, x: 0, y: 100, alive: true, team: 3 };
  const g = { time: 10.5, tanks: [observer, shooter, victim],
    __novaFairVisibleTanks: [observer, shooter, victim],
    hasLineOfSight() { return true; } };
  return { g, observer, shooter, victim };
}
test('moving only the third-party victim can reclassify one old witnessed shot', () => {
  const thirdPartyVector = boot();
  const { g, observer, shooter, victim } = scene();
  const before = thirdPartyVector(g, observer, shooter);
  assert.equal(before.weight, 0, 'north victim is outside east shot bearing');
  victim.x = 100; victim.y = 0;
  const after = thirdPartyVector(g, observer, shooter);
  assert.equal(after.weight, .62, 'same historical shot is reclassified by victim motion');
  assert.equal(observer.ai.__v181ObservedShotAt, 10, 'no new shot was observed');
  assert.equal(observer.ai.__v181ObservedShotAngle, 0);
  assert.equal(observer.ai.__v181ObservedShotX, 0);
  assert.equal(observer.ai.__v181ObservedShotY, 0);
  // Moving the shooter after the shot must not change the frozen shot origin.
  shooter.x = -200; shooter.y = -200;
  assert.equal(thirdPartyVector(g, observer, shooter).weight, .62);
  // Old evidence expires; cover and the visible-contact set remain gates.
  g.time = 11.26;
  assert.equal(thirdPartyVector(g, observer, shooter).weight, 0);
  g.time = 10.5;
  g.hasLineOfSight = (ax, ay, bx, by) => !(bx === victim.x && by === victim.y);
  assert.equal(thirdPartyVector(g, observer, shooter).weight, 0);
  g.hasLineOfSight = () => true;
  g.__novaFairVisibleTanks = [observer, shooter];
  assert.equal(thirdPartyVector(g, observer, shooter).weight, 0);
});
test('reverse victim motion can erase historical crossfire without a new shot', () => {
  const thirdPartyVector = boot();
  const { g, observer, shooter, victim } = scene();
  victim.x = 100; victim.y = 0;
  assert.equal(thirdPartyVector(g, observer, shooter).weight, .62);
  victim.x = 0; victim.y = 100;
  assert.equal(thirdPartyVector(g, observer, shooter).weight, 0);
  // Do not infer actual hit, intent or natural incidence from this fixture.
});
