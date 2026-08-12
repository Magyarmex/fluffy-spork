const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/applied-power-parity-v1.10.8.js'), 'utf8');
const deploy = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');

function boot() {
  const modules = {};
  modules['game/ai'] = function(module) { module.exports.updateAI = function(_tank, game) { game.__aiSawPlayerLevel = game.player.level; }; };
  modules['game/engine'] = function(module) {
    function Game() {
      this.player = { level: 10, stats: { damage: 2, reload: 1, bulletspeed: 1, penetration: 1, maxhp: 1, regen: 0, speed: 0, body: 0 } };
      this.statPoints = 3; this.tanks = [{ isPlayer: false, alive: true, level: 7 }]; this.syncCount = 0; this.hudCount = 0;
    }
    Game.prototype.spawnAITank = function(level) { this.__spawnArg = level; this.__spawnSawPlayerLevel = this.player.level; return { level: this.player.level }; };
    Game.prototype.levelAITo = function(t, target) { this.__levelTarget = target; while (t.level < target) t.level++; };
    Game.prototype.syncAILevels = function() { this.__syncSawPlayerLevel = this.player.level; this.syncCount++; for (const t of this.tanks) if (!t.isPlayer && t.alive) this.levelAITo(t, this.player.level); };
    Game.prototype.upgradeStat = function(key) { if (this.statPoints <= 0) return; this.statPoints--; this.player.stats[key]++; this.syncHud(); };
    Game.prototype.syncHud = function() { this.hudCount++; };
    module.exports.Game = Game;
  };
  const window = { __novaModules: modules };
  const context = { window, console: { info() {}, warn() {}, error() {} }, Math, Number, Object, Array };
  vm.runInNewContext(source, context, { filename: 'applied-power-parity-v1.10.8.js' });
  function load(id) {
    const module = { exports: {} };
    modules[id](module, module.exports, (request) => { if (request === './types') return { MAX_LEVEL: 45 }; throw new Error(`unexpected require: ${request}`); });
    return module.exports;
  }
  return { window, load };
}

test('effective AI level equals one plus assigned stat points, capped by raw level', () => {
  const { window } = boot(); const T = window.__NOVA_APPLIED_POWER_PARITY_TEST__;
  const player = { level: 20, stats: { damage: 4, reload: 3, bulletspeed: 2, penetration: 1, maxhp: 2, regen: 0, speed: 0, body: 0 } };
  assert.equal(T.spentStatPoints(player), 12); assert.equal(T.appliedPowerLevel(player, 45), 13); player.level = 8; assert.equal(T.appliedPowerLevel(player, 45), 8);
});

test('raw XP level-ups with banked points do not increase applied power', () => {
  const { window } = boot(); const T = window.__NOVA_APPLIED_POWER_PARITY_TEST__;
  const player = { level: 9, stats: { damage: 2, reload: 2, bulletspeed: 1, penetration: 1, maxhp: 1, regen: 0, speed: 0, body: 0 } };
  assert.equal(T.appliedPowerLevel(player, 45), 8); player.level = 10; assert.equal(T.appliedPowerLevel(player, 45), 8); player.level = 11; assert.equal(T.appliedPowerLevel(player, 45), 8);
});

test('spawn and canonical sync see applied level while player raw level is restored', () => {
  const { load } = boot(); const { Game } = load('game/engine'); const game = new Game();
  assert.equal(game.appliedPowerLevel(), 7); const enemy = game.spawnAITank(10); assert.equal(enemy.level, 7); assert.equal(game.__spawnArg, 7); assert.equal(game.__spawnSawPlayerLevel, 7); assert.equal(game.player.level, 10);
  game.syncAILevels(); assert.equal(game.__syncSawPlayerLevel, 7); assert.equal(game.player.level, 10);
});

test('spending a point advances rivals exactly when that point becomes real power', () => {
  const { load } = boot(); const { Game } = load('game/engine'); const game = new Game(); game.upgradeStat('damage');
  assert.equal(game.appliedPowerLevel(), 8); assert.equal(game.statPoints, 2); assert.equal(game.tanks[0].level, 8); assert.equal(game.syncCount, 1); assert.equal(game.player.level, 10); assert.equal(game.hudCount, 2);
});

test('AI tactical comparisons see applied power rather than banked raw level', () => {
  const { load } = boot(); const ai = load('game/ai'); const { Game } = load('game/engine'); const game = new Game(); ai.updateAI({}, game, 0.016); assert.equal(game.__aiSawPlayerLevel, 7); assert.equal(game.player.level, 10);
});

test('levelAITo cannot be used to bypass the applied-power cap', () => {
  const { load } = boot(); const { Game } = load('game/engine'); const game = new Game(); const enemy = { level: 4 }; game.levelAITo(enemy, 40); assert.equal(game.__levelTarget, 7); assert.equal(enemy.level, 7);
});

test('Applied Power legacy layer is retained as parity evidence but not deployed', () => {
  assert.ok(source.includes('__NOVA_APPLIED_POWER_PARITY_TEST__'));
  assert.doesNotMatch(deploy, /applied-power-parity-v1\.10\.8\.js|nova-updates\//);
  assert.match(deploy, /path: dist/);
});
