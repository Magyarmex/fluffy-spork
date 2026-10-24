'use strict';
// Prove Living Front's ecology pass precedes Fair Engagement's replan in shipping order.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function boot() {
  class Game {}
  Game.prototype.updateDrones = function() {};
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI(t, g) {
      g.observedEcologyWeight = t.ai.__lfEcoWeight;
      return 'executed';
    } }; }
  };
  const window = { __novaModules: modules };
  const ctx = { window, console: { info() {}, warn() {}, error() {} },
    Math, Number, Object, Array, Date, JSON, setTimeout() {}, clearTimeout() {} };
  for (const file of ['fair-engagement-v1.11.2.js',
    'living-front-core-v1.12.0.js', 'living-front-instincts-v1.12.0.js',
    'living-front-director-v1.12.0.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      ctx, { filename: file });
  const m = { exports: {} };
  modules['game/ai'](m, m.exports, spec => spec === './classes'
    ? { CLASSES: {}, lineageForClass: () => null }
    : { SHAPE_DEFS: {} });
  return m.exports.updateAI;
}
function world(targetX) {
  const owner = { id: 1, x: 0, y: 0, alive: true, hp: 100, maxHp: 100,
    ai: { state: 'hunt', __v1112TargetId: 2 } };
  const target = { id: 2, x: targetX, y: 0, alive: true, hp: 100,
    maxHp: 100, spawnShieldT: 0 };
  const g = { time: 10, w: 100, h: 100, cam: { zoom: 1 },
    player: null, tanks: [owner, target], shapes: [],
    __lfState: { signal: { type: 'BLOOM', x: 500, y: 0,
      sector: 2, until: 20 }, stats: { aiRotations: 0 } },
    getTank(id) { return id === 2 ? target : null; },
    hasLineOfSight() { return true; },
    moveTank() {} };
  return { owner, target, g };
}
test('composed AI: offscreen stale target cannot suppress ecology before replan', () => {
  const updateAI = boot(), w = world(200);
  assert.equal(updateAI(w.owner, w.g, .2), 'executed');
  assert.ok(w.g.observedEcologyWeight > .15,
    'Living Front used the offscreen enemy location before Fair Engagement');
  assert.equal(w.owner.ai.__v1112TargetId, -1,
    'Fair Engagement must subsequently invalidate the hidden target');
});
test('composed AI: visible close target still takes precedence', () => {
  const updateAI = boot(), w = world(20);
  updateAI(w.owner, w.g, .2);
  assert.equal(w.g.observedEcologyWeight, 0);
  assert.equal(w.owner.ai.__v1112TargetId, 2);
});
