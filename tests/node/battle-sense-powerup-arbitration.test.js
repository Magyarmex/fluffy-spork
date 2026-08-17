const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load() {
  const classes = { CLASSES: {}, lineageForClass: () => 'gunner' };
  function d2(ax, ay, bx, by) { const x = bx - ax, y = by - ay; return x * x + y * y; }
  function Game() {
    this.time = 0;
    this.tanks = [];
    this.bullets = [];
    this.powerups = [];
    this.status = 'playing';
    this.applied = [];
  }
  Game.prototype.tryFire = function () {};
  Game.prototype.moveTank = function () {};
  Game.prototype.hasLineOfSight = function () { return true; };
  Game.prototype.getTank = function (id) { return this.tanks.find(t => t.id === id) || null; };
  Game.prototype.applyPowerup = function (t, type) { this.applied.push([t.id, type]); };
  // Minimal stand-in for the canonical player pickup pass. Battle Sense must
  // leave a pickup here when the player wins the local proximity race.
  Game.prototype.updatePowerups = function () {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      let winner = null, best = 46 * 46;
      for (const t of this.tanks) {
        if (!t || !t.isPlayer || t.alive === false) continue;
        const q = d2(t.x, t.y, p.x, p.y);
        if (q < best) { best = q; winner = t; }
      }
      if (winner) {
        this.applyPowerup(winner, p.type);
        this.powerups.splice(i, 1);
      }
    }
  };

  const mods = {
    'game/engine': m => { m.exports = { Game }; },
    'game/classes': m => { m.exports = classes; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
  };
  const context = { window: { __novaModules: mods }, console, Math };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../nova-updates/battle-sense-v1.8.1.js'), 'utf8'),
    context,
  );
  const cache = {};
  function req(id) {
    if (cache[id]) return cache[id].exports;
    const m = { exports: {} };
    cache[id] = m;
    mods[id](m, m.exports, s => s === './classes' ? req('game/classes') : null);
    return m.exports;
  }
  return { Game: req('game/engine').Game };
}

function tank(id, x, isPlayer = false) {
  return { id, x, y: 0, hp: 100, maxHp: 100, alive: true, isPlayer, ai: isPlayer ? null : { __v180TargetId: -1 } };
}

test('closer player wins a simultaneous pickup race instead of AI preempting native pickup', () => {
  const { Game } = load();
  const g = new Game();
  g.tanks = [tank(1, 20, false), tank(99, 8, true)];
  g.powerups = [{ id: 7, type: 'shield', x: 0, y: 0 }];
  g.updatePowerups(0.1);
  assert.deepEqual(g.applied, [[99, 'shield']]);
  assert.equal(g.powerups.length, 0);
});

test('closer AI still wins when it genuinely reaches the pickup first', () => {
  const { Game } = load();
  const g = new Game();
  g.tanks = [tank(1, 7, false), tank(99, 22, true)];
  g.powerups = [{ id: 8, type: 'haste', x: 0, y: 0 }];
  g.updatePowerups(0.1);
  assert.deepEqual(g.applied, [[1, 'haste']]);
  assert.equal(g.powerups.length, 0);
});

test('exact player-AI pickup ties defer to the native player path', () => {
  const { Game } = load();
  const g = new Game();
  // AI deliberately comes first in the array: tie policy must still favor player delegation.
  g.tanks = [tank(1, 10, false), tank(99, -10, true)];
  g.powerups = [{ id: 9, type: 'triple', x: 0, y: 0 }];
  g.updatePowerups(0.1);
  assert.deepEqual(g.applied, [[99, 'triple']]);
  assert.equal(g.powerups.length, 0);
});
