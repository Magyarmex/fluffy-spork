'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'nova-updates/sensory-feedback-v1.9.1.js'), 'utf8');
const shipping = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function boot() {
  class Game {
    constructor() { this.time = 40; this.redeploys = 0; }
    redeploy() { this.time = 0; this.redeploys++; return 'reset'; }
  }
  const modules = { 'game/engine'(m) { m.exports.Game = Game; } };
  const window = { __novaModules: modules };
  vm.runInNewContext(source, { window, console: { info() {}, error() {} },
    Math, Number, Date, performance: { now: () => 1000 } },
    { filename: 'sensory-feedback-v1.9.1.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({ CLASSES: {} }));
  return { Game: m.exports.Game, state: window.__NOVA_FEEDBACK_TEST__.state };
}

test('materialized gameplay loads Impact Language and resets time on redeploy', () => {
  assert.match(shipping, /nova-updates\/sensory-feedback-v1\.9\.1\.js/);
  const start = shipping.indexOf('    redeploy() {');
  assert.ok(start > 0);
  assert.match(shipping.slice(start, shipping.indexOf('    // ============ helpers', start)),
    /this\.time\s*=\s*0/);
});

test('previous-life hit, incoming-damage and death overlays do not persist after redeploy', () => {
  const { Game, state } = boot(), g = new Game(), previous = state(g);
  previous.hitUntil = 40.2;
  previous.damageUntil = 40.5;
  previous.deathUntil = 40.9;
  previous.hitPower = 1;
  previous.damagePower = 1;
  assert.equal(g.redeploy(), 'reset');
  assert.equal(g.redeploys, 1);
  const fresh = state(g);
  assert.notStrictEqual(fresh, previous, 'new life must not reuse previous-life presentation timestamps');
  assert.equal(fresh.hitUntil, 0);
  assert.equal(fresh.damageUntil, 0);
  assert.equal(fresh.deathUntil, 0);
  assert.equal(fresh.hitPower, 0);
  assert.equal(fresh.damagePower, 0);
});

test('critical-health and reload feedback cannot carry into a fresh healthy run', () => {
  const { Game, state } = boot(), g = new Game(), previous = state(g);
  previous.critical = true;
  previous.lowBeatAt = 39;
  previous.reloading = true;
  previous.readyUntil = 40.5;
  previous.powerUntil = 40.5;
  previous.abilityUntil = 40.5;
  previous.evolveUntil = 40.5;
  g.redeploy();
  const fresh = state(g);
  assert.equal(fresh.critical, false);
  assert.equal(fresh.lowBeatAt, -99);
  assert.equal(fresh.reloading, false);
  assert.equal(fresh.readyUntil, 0);
  assert.equal(fresh.powerUntil, 0);
  assert.equal(fresh.abilityUntil, 0);
  assert.equal(fresh.evolveUntil, 0);
});

test('new-life feedback still initializes normally and other games remain independent', () => {
  const { Game, state } = boot(), a = new Game(), b = new Game();
  const a0 = state(a), b0 = state(b);
  a0.shotUntil = 41;
  b0.shotUntil = 41;
  a.redeploy();
  const a1 = state(a);
  assert.equal(a1.shotUntil, 0);
  assert.equal(b0.shotUntil, 41, 'redeploy must not affect other game instances');
  a1.shotUntil = 0.25;
  assert.equal(state(a).shotUntil, 0.25);
  assert.equal(state(b).shotUntil, 41);
});
