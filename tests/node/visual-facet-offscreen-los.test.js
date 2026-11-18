'use strict';
// Source-executed regression: offscreen neutral facets must be culled before
// expensive terrain visibility/clearance probes. Rendering remains unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Hardlight Foundry culls offscreen neutral, pickup and drone accents before terrain LoS', () => {
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
    tanks: [], __novaTerrain: [],
    tankById: new Map([[8, { id: 8, isPlayer: false, angle: 0 }]]),
    drones: Array.from({ length: 13 }, (_, i) => ({ ownerId: 8, hp: 1, x: 1700 + i * 10, y: 1800, r: 7 })),
    powerups: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, type: 'heal', x: 1900 + i * 10, y: 1800, ttl: 10 })), 
    __v190FinishCache: { w: 800, h: 600, dpr: 1, quality: 'low', canvas: {} },
    hasLineOfSight() { losCalls++; return true; },
    isTerrainSafe() { clearanceCalls++; return true; },
    shapes: Array.from({ length: 120 }, (_, i) => ({
      x: 1600 + i * 10, y: 1700, r: 10, hp: 1, type: 'circle'
    }))
  };
  renderModule.exports.render(game, 800, 600);
  assert.equal(losCalls, 0,
    'offscreen neutral, pickup and drone accents must not invoke terrain LoS');
  const offscreenClearance = clearanceCalls;
  game.shapes.push({ x: 0, y: 0, r: 10, hp: 1, type: 'circle' });
  game.powerups.push({ id: 77, type: 'heal', x: 10, y: 10, ttl: 10 });
  game.drones.push({ ownerId: 8, hp: 1, x: 20, y: 20, r: 7 });
  losCalls = 0; clearanceCalls = 0;
  renderModule.exports.render(game, 800, 600);
  assert.equal(losCalls, 3,
    'visible neutral, pickup and hostile drone must retain terrain LoS checks');
  assert.ok(clearanceCalls >= 3,
    'visible accents must retain physical cover clearance');
  assert.ok(offscreenClearance >= 0);
});
