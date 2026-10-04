const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = fs.readFileSync(path.join(__dirname, '../../nova-updates/living-front-core-v1.12.0.js'), 'utf8');
const current = fs.readFileSync(path.join(__dirname, '../../CURRENT_RELEASE.md'), 'utf8');

function loadCore() {
  const modules = {};
  modules['game/engine'] = function(module) {
    function Game() {}
    Game.prototype.pityStartLevel = function() { return 9; };
    module.exports.Game = Game;
  };
  const window = { __novaModules: modules };
  vm.runInNewContext(core, {
    window,
    console: { info() {}, warn() {}, error() {} },
    Math, Number, Object, Array, Date
  }, { filename: 'living-front-core-v1.12.0.js' });

  const module = { exports: {} };
  modules['game/engine'](module, module.exports, request => {
    if (request === './types') return { SHAPE_DEFS: {} };
    throw new Error('unexpected require: ' + request);
  });
  return module.exports.Game;
}

test('v1.12 runtime neutralizes the historical redeploy level boost', () => {
  const Game = loadCore();
  assert.equal(new Game().pityStartLevel(), 1);
});

test('the v1.12 progression contract rejects player-relative pity', () => {
  assert.match(current, /no player-relative catch-up rewards, and no pity system/i);
  assert.match(core, /Game\.prototype\.pityStartLevel=function\(\)\{return 1;\}/);
});
