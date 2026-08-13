const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/visual-overhaul-v1.9.0.js'), 'utf8');

function boot() {
  const originalRender = function originalRender() {};
  const modules = {
    'game/render': (module) => { module.exports.render = originalRender; }
  };
  const window = { __novaModules: modules };
  const context = {
    window,
    console: { info() {}, warn() {}, error() {} },
    Math,
    document: undefined
  };
  vm.runInNewContext(source, context, { filename: 'visual-overhaul-v1.9.0.js' });
  return { window, modules, originalRender };
}

test('release identifies the visual overhaul and does not change gameplay state', () => {
  const { window } = boot();
  assert.equal(window.__NOVA_VERSION, '1.9.0');
  assert.equal(window.__NOVA_VISUAL_OVERHAUL__.codename, 'Hardlight Foundry');
  assert.match(window.__NOVA_VISUAL_OVERHAUL__.groups['Fair Play'][0], /visibility checks/i);
});

test('decorative hashing is deterministic and terrain visibility obeys canonical LoS', () => {
  const { window } = boot();
  const hooks = window.__NOVA_VISUAL_OVERHAUL_TEST__;
  assert.equal(hooks.hash2(12, 9), hooks.hash2(12, 9));
  assert.notEqual(hooks.hash2(12, 9), hooks.hash2(13, 9));
  const g = {
    player: { x: 0, y: 0 },
    hasLineOfSight(ax, ay, bx) { return bx < 100; },
    isTerrainSafe(x) { return x !== 50; }
  };
  assert.equal(hooks.terrainVisible(g, 40, 0, 2), true);
  assert.equal(hooks.terrainVisible(g, 140, 0, 2), false);
  assert.equal(hooks.terrainClear(g, 40, 0, 10), true);
  assert.equal(hooks.terrainClear(g, 50, 0, 10), false);
});

test('render module is wrapped and preserves the previous renderer', () => {
  const { modules, originalRender } = boot();
  const module = { exports: {} };
  const require = (id) => {
    if (id === './classes') return { CLASSES: {}, lineageForClass() { return null; } };
    if (id === './types') return { SHAPE_DEFS: {} };
    throw new Error('unexpected require ' + id);
  };
  modules['game/render'](module, module.exports, require);
  assert.notEqual(module.exports.render, originalRender);
  assert.equal(module.exports.render.__novaHardlightFoundry, true);
});

test('floor surface is painted after the canonical render and visibility guards precede entity accents', () => {
  const oldAt = source.indexOf('old(g,w,h);');
  const floorAt = source.indexOf('drawArenaUnderlay(g,ctx,w,h,classes);');
  const hardwareAt = source.indexOf('drawTerrainHardware(g,ctx,w,h);');
  const entitiesAt = source.indexOf('drawEntityFinish(g,ctx,w,h,classes,types);');
  assert.ok(oldAt >= 0 && floorAt > oldAt && hardwareAt > floorAt && entitiesAt > hardwareAt);
  assert.match(source, /!terrainClear\(g,t\.x,t\.y/);
  assert.match(source, /!t\.isPlayer&&!terrainVisible\(g,t\.x,t\.y/);
  assert.match(source, /!terrainVisible\(g,p\.x,p\.y/);
});

test('screen gradients are cached rather than allocated every frame', () => {
  assert.match(source, /if\(c&&c\.w===w&&c\.h===h&&c\.dpr===dpr&&c\.quality===g\.quality\)return c/);
  assert.equal((source.match(/createRadialGradient/g) || []).length, 1);
  assert.match(source, /quality==='low'\?720:480/);
});
