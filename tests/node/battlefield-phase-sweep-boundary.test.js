'use strict';
// A Phase Shift is an instantaneous relocation, not a 420-unit continuous
// tank trajectory. Battlefield's relative-motion bullet solver must not
// treat the gap between departure and arrival as a physical hitbox.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function shippingAbility() {
  const marker = '    useAbility(t) {', start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized ability method must exist');
  let pos = start + marker.length, depth = 1;
  while (depth && pos < html.length) {
    if (html[pos] === '{') depth++;
    else if (html[pos] === '}') depth--;
    pos++;
  }
  assert.equal(depth, 0);
  return new Function('classes_1', 'types_1', 'M',
    'return function(t){' + html.slice(start + marker.length, pos - 1) + '}')(
    { CLASSES: {
      ghost: { ability: 'phase', size: 15, bullet: { dmg: 10, speed: 400 } },
      scout: { ability: null, size: 14, bullet: { dmg: 10, speed: 400 } }
    }, ABILITIES: { phase: { cd: 8 } } },
    { clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)) }, 2250);
}
function boot() {
  class Game {
    constructor() {
      this.time = 1; this.__novaTerrain = [];
      this.tanks = []; this.drones = []; this.shapes = []; this.bullets = [];
      this.powerups = []; this.tmp = []; this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
      this.sfx = { ability() {} };
    }
    spawnPlayer() {}
    randSpawnPos() { return { x: 1500, y: 1500 }; }
    spawnShape() {}
    spawnPowerup() {}
    moveTank(t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; }
    tryFire() {}
    updateBullets() {}
    updateDrones() {}
    update() {}
    splashAt() {}
    addParticles() {}
    addRing() {}
    addText() {}
    getTank() { return null; }
    bulletDamageFor() { return 10; }
    bulletSpeed() { return 400; }
  }
  Game.prototype.useAbility = shippingAbility();
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/ai': m => { m.exports.updateAI = () => {}; },
    'game/audio': m => { m.exports.Sfx = class {}; },
    'game/render': m => { m.exports.render = () => {}; }
  };
  const win = { __novaModules: modules };
  const ctx = { window: win, console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Number, Date, performance: { now: () => 0 } };
  for (const name of ['battlefield-v1.6.0.js', 'performance-v1.7.5.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'), ctx,
      { filename: name });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => {
    if (spec === './classes') return { CLASSES: {
      ghost: { size: 15, ability: 'phase' }, scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('Unexpected dependency ' + spec);
  });
  return m.exports.Game;
}
function tank(cls = 'ghost', x = 0) {
  return { id: 2, cls, x, y: 0, angle: 0, hp: 100, alive: true,
    abilityCd: 0, vx: 0, vy: 0 };
}
for (const fps of [30, 60, 120, 240]) {
  test('Phase Shift does not turn its teleport into a swept hitbox at ' + fps + 'Hz', () => {
    const Game = boot(), g = new Game(), t = tank();
    g.moveTank(t, 100, 0, 1 / fps);
    const beforePhase = t.x;
    assert.equal(t.__novaSweepPrevX, 0, 'ordinary movement starts at original position');
    g.useAbility(t);
    assert.ok(t.x > beforePhase + 400, 'real materialized Phase Shift moved the tank');
    assert.equal(t.__novaSweepMoveTime, g.time);
    assert.equal(t.__novaSweepPrevX, t.x, 'teleport path must not be swept');
    assert.equal(t.__novaSweepPrevY, t.y);
  });
}
test('ordinary non-Phase movement preserves its original swept history', () => {
  const Game = boot(), g = new Game(), t = tank('scout');
  g.moveTank(t, 100, 0, .02);
  assert.equal(t.__novaSweepPrevX, 0);
  g.useAbility(t);
  assert.equal(t.__novaSweepPrevX, 0);
});
test('cooldown-blocked Phase Shift preserves real ordinary movement', () => {
  const Game = boot(), g = new Game(), t = tank('ghost');
  t.abilityCd = 5;
  g.moveTank(t, 100, 0, .02);
  const x = t.x;
  g.useAbility(t);
  assert.equal(t.x, x);
  assert.equal(t.__novaSweepPrevX, 0);
});
test('phase activation without earlier movement still anchors to arrival', () => {
  const Game = boot(), g = new Game(), t = tank();
  g.useAbility(t);
  assert.equal(t.x, 420);
  assert.equal(t.__novaSweepPrevX, 420);
  assert.equal(t.__novaSweepMoveTime, g.time);
});
