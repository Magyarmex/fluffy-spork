'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'nova-updates/spotter-comms-v1.9.3.js'), 'utf8');
const shipping = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function boot() {
  class Game {
    constructor() { this.time = 0; this.printed = []; this.redeploys = 0; }
    addText(x, y, text) { this.printed.push(text); }
    redeploy() {
      this.redeploys++;
      this.time = 0;
      return 'redeployed';
    }
  }
  const modules = { 'game/engine'(m) { m.exports.Game = Game; } };
  const window = { __novaModules: modules };
  vm.runInNewContext(source, { window, console: { info() {}, error() {} },
    performance: { now: () => 0 }, Date, Object, Number },
    { filename: 'spotter-comms-v1.9.3.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({}));
  return { Game: m.exports.Game, window };
}

test('shipping Game.redeploy reuses its instance and resets its simulation clock', () => {
  const redeploy = shipping.indexOf('    redeploy() {');
  assert.ok(redeploy > 0, 'materialized canonical Game.redeploy exists');
  const body = shipping.slice(redeploy, shipping.indexOf('    // ============ helpers', redeploy));
  assert.match(body, /this\.time\s*=\s*0/);
  assert.match(shipping, /gameRef\.current\?\.redeploy\(\)/);
});

test('same Game can announce a friendly relay immediately after restarting a late match', () => {
  const { Game } = boot(), g = new Game();
  g.time = 90;
  g.addText(0, 0, 'CONTACT RELAY');
  assert.equal(g.redeploy(), 'redeployed');
  g.addText(0, 0, 'CONTACT');
  assert.deepEqual(g.printed, ['CONTACT RELAY', 'CONTACT RELAY']);
  assert.equal(g.redeploys, 1);
});

test('a zero-time redeploy still clears the previous life even without detectable clock rollback', () => {
  const { Game } = boot(), g = new Game();
  g.addText(0, 0, 'SPOTTED');
  assert.equal(g.time, 0);
  g.redeploy();
  assert.equal(g.time, 0);
  g.addText(0, 0, 'SPOTTED · RELAY');
  assert.deepEqual(g.printed, ['SPOTTED · RELAY', 'SPOTTED · RELAY']);
});

test('all relay channels reset together while within-life deduplication stays active', () => {
  const { Game } = boot(), g = new Game();
  g.time = 120;
  for (const msg of ['CONTACT', 'SPOTTED', 'OBSERVER DOWN · LOCAL SIGHT ONLY',
    'OBSERVER LINK RESTORED']) g.addText(0, 0, msg);
  assert.equal(g.printed.length, 4);
  g.redeploy();
  for (const msg of ['CONTACT', 'SPOTTED', 'OBSERVER DOWN · LOCAL SIGHT ONLY',
    'OBSERVER LINK RESTORED']) g.addText(0, 0, msg);
  assert.equal(g.printed.length, 8, 'fresh life must not inherit any relay cooldown');
  g.addText(0, 0, 'CONTACT RELAY');
  g.addText(0, 0, 'SPOTTED · RELAY');
  assert.equal(g.printed.length, 8, 'within-life duplicate warnings remain suppressed');
});

test('cooldowns remain per-instance, and unrelated text is never throttled', () => {
  const { Game } = boot(), a = new Game(), b = new Game();
  a.addText(0, 0, 'CONTACT');
  b.addText(0, 0, 'CONTACT');
  a.addText(0, 0, 'CONTACT RELAY');
  a.addText(0, 0, '+120 XP');
  a.addText(0, 0, '+120 XP');
  assert.deepEqual(a.printed, ['CONTACT RELAY', '+120 XP', '+120 XP']);
  assert.deepEqual(b.printed, ['CONTACT RELAY']);
});
