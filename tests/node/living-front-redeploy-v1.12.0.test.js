const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const core = fs.readFileSync(path.join(__dirname, '../../nova-updates/living-front-core-v1.12.0.js'), 'utf8');

function boot() {
  const modules = {};
  const defs = { circle:{hp:14,xp:10,r:12,speed:10} };
  modules['game/engine'] = function(module) {
    function Game() {
      this.time = 100;
      this.status = 'playing';
      this.shapes = [];
      this.tanks = [];
      this.bullets = [];
      this.orbs = [];
    }
    Game.prototype.spawnShape = function(){};
    Game.prototype.damageShape = function(){};
    Game.prototype.killShape = function(){};
    Game.prototype.update = function(){};
    Game.prototype.drawMinimap = function(){};
    Game.prototype.redeploy = function(){ this.time = 0; };
    Game.prototype.destroy = function(){};
    Game.prototype.tryFire = function(){};
    Game.prototype.splashAt = function(){};
    Game.prototype.damageTank = function(){};
    Game.prototype.nearestTank = function(){ return null; };
    Game.prototype.isTerrainSafe = function(){ return true; };
    module.exports.Game = Game;
  };
  const window = { __novaModules: modules };
  const context = {
    window,
    console: { info(){}, warn(){}, error(){} },
    Math, Number, Object, Array, Date, JSON,
    setTimeout(){}, clearTimeout(){}
  };
  vm.runInNewContext(core, context, { filename: 'living-front-core-v1.12.0.js' });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, req => {
    if (req === './types') return { SHAPE_DEFS: defs };
    throw new Error(req);
  });
  return module.exports.Game;
}

test('redeploy preserves absolute Living Front timers while leaving relative timers unchanged', () => {
  const Game = boot();
  const g = new Game();
  const survivor = {
    id: 7, kind: 'shape', type: 'circle', x: 0, y: 0, hp: 14,
    __lfEvadeUntil: 106,
    __lfEvadeReady: 112,
    __lfStarBorn: 76,
    __lfPredatorT: 0.4
  };
  g.shapes.push(survivor);
  g.__lfState = { stale: true };

  g.redeploy();

  assert.equal(g.time, 0);
  assert.equal(g.__lfState, null);
  assert.equal(survivor.__lfEvadeUntil, 6, '6 seconds of evade commitment should remain');
  assert.equal(survivor.__lfEvadeReady, 12, '12 seconds of evade cooldown should remain');
  assert.equal(survivor.__lfStarBorn, -24, 'Rogue Star age should remain 24 seconds');
  assert.equal(survivor.__lfPredatorT, 0.4, 'relative countdowns must not shift with the game clock');
});
