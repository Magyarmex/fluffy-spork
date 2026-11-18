'use strict';
// Source-executed regression: offscreen neutral facets must be culled before
// expensive terrain visibility/clearance probes. Rendering remains unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Hardlight Foundry culls offscreen shapes before terrain LoS work', () => {
  const modules = {
    'game/render': module => {
      module.exports = { render() {} };
    }
  };
  const win = { __novaModules: modules };
  const source = fs.readFileSync(path.join(__dirname,
    '../../nova-updates/visual-overhaul-v1.9.0.js'), 'utf8');
  vm.runInNewContext(source, { window: win, Math, Number, Object, Array,
    console: { info() {}, error() {} } }, { filename: 'visual-overhaul-v1.9.0.js' });
  const renderModule = { exports: {} };
  const classes = { CLASSES: {}, lineageForClass() { return 'scout'; } };
  const types = { SHAPE_DEFS: { circle: { color: '#ffffff' } } };
  modules['game/render'](renderModule, renderModule.exports, id => {
    if (id === './classes') return classes;
    if (id === './types') return types;
    throw Error('unexpected module: ' + id);
  });
  const ctx = {};
  for (const name of ['save', 'restore', 'setTransform', 'translate', 'scale',
    'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'stroke', 'fill',
    'fillRect', 'strokeRect', 'setLineDash', 'drawImage', 'rotate']) {
    ctx[name] = () => {};
  }
  let losCalls = 0, clearanceCalls = 0;
  const game = {
    ctx, dpr: 1, quality: 'low', time: 1,
    cam: { x: 0, y: 0, zoom: 1 }, player: { x: 0, y: 0, alive: true },
    tanks: [], drones: [], powerups: [], __novaTerrain: [],
    __v190FinishCache: { w: 800, h: 600, dpr: 1, quality: 'low', canvas: {} },
    hasLineOfSight() { losCalls++; return true; },
    isTerrainSafe() { clearanceCalls++; return true; },
    shapes: Array.from({ length: 120 }, (_, i) => ({
      x: 1600 + i * 10, y: 1700, r: 10, hp: 1, type: 'circle'
    }))
  };
  renderModule.exports.render(game, 800, 600);
  assert.equal(losCalls, 0,
    'offscreen shapes must not invoke terrain line-of-sight');
  const offscreenClearance = clearanceCalls;
  game.shapes.push({ x: 0, y: 0, r: 10, hp: 1, type: 'circle' });
  losCalls = 0; clearanceCalls = 0;
  renderModule.exports.render(game, 800, 600);
  assert.equal(losCalls, 1,
    'visible shape must retain its terrain visibility check');
  assert.ok(clearanceCalls >= 1,
    'visible shape must retain physical cover clearance');
  assert.ok(offscreenClearance >= 0);
});
