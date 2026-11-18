'use strict';
// Reproduce the actual render-wrapper timing boundary without mocking either
// shipping module. This is a diagnostic contract, not a performance benchmark.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
function runComposedRender(visibleDrones) {
  const clock = { ms: 100 };
  const modules = {
    'game/render': (module) => {
      module.exports = {
        glowSprite: () => ({}),
        render: () => { clock.ms += 2; } // controlled core render cost
      };
    }
  };
  const win = { __novaModules: modules };
  const context = {
    window: win,
    performance: { now: () => clock.ms },
    console: { info() {}, error() {} },
    Map, Set, Math, Number, Object, Array
  };
  for (const filename of [
    'nova-updates/performance-v1.7.5.js',
    'nova-updates/drone-allegiance-glow-v1.7.6.js'
  ]) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, filename), 'utf8'),
      context, { filename });
  }
  const renderModule = { exports: {} };
  modules['game/render'](renderModule, renderModule.exports, () => {
    throw Error('unexpected render dependency');
  });
  const ctx = {};
  for (const name of ['save', 'restore', 'setTransform', 'translate', 'scale',
    'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'stroke']) {
    ctx[name] = () => {};
  }
  ctx.drawImage = () => { clock.ms += 1; }; // controlled downstream glow cost
  const game = {
    status: 'playing', paused: false, ctx, dpr: 1,
    cam: { x: 0, y: 0, zoom: 1 },
    player: { id: 7 },
    drones: Array.from({ length: visibleDrones }, (_, i) => ({
      ownerId: 7, x: 20 + i * 10, y: 30, hp: 1, role: 'hunter'
    }))
  };
  const before = clock.ms;
  renderModule.exports.render(game, 800, 600);
  return {
    totalMs: clock.ms - before,
    innerMs: game.__novaPerf && game.__novaPerf.renderMs,
    samples: game.__novaPerf && game.__novaPerf.samples
  };
}

test('source-composed render telemetry excludes downstream IFF draw time', () => {
  const empty = runComposedRender(0);
  const dense = runComposedRender(13);
  assert.equal(empty.totalMs, 2, 'core render control must retain its measured cost');
  assert.equal(empty.innerMs, 2);
  assert.equal(dense.totalMs, 28, '13 visible drones draw two glow sprites each');
  assert.equal(dense.innerMs, 2,
    'current inner render timer omits the IFF pass after oldRender');
  assert.ok(dense.totalMs > dense.innerMs,
    'end-to-end presentation work is not captured by inner renderMs');
  assert.ok(dense.samples >= 1, 'shipping telemetry owner must execute');
});
