const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/spotter-comms-v1.9.3.js'), 'utf8');

function boot() {
  class Game {
    constructor() { this.time = 0; this.printed = []; }
    addText(x, y, text, color, size) { this.printed.push({ x, y, text, color, size }); }
  }
  const modules = {
    'game/engine'(module) { module.exports.Game = Game; }
  };
  const window = { __novaModules: modules };
  const context = {
    window,
    console: { info() {}, warn() {}, error() {} },
    performance: { now() { return 0; } },
    Date,
    Object,
    Number
  };
  vm.runInNewContext(source, context, { filename: 'spotter-comms-v1.9.3.js' });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, () => ({}));
  return { window, Game: module.exports.Game };
}

test('legacy and current friendly Spotter messages collapse into one canonical callout', () => {
  const { Game } = boot();
  const g = new Game();
  g.addText(10, 20, 'CONTACT', '#fff', 9);
  g.addText(30, 40, 'CONTACT RELAY', '#fff', 10);
  assert.equal(g.printed.length, 1);
  assert.equal(g.printed[0].text, 'CONTACT RELAY');
});

test('hostile Spotter swarm messages share one global warning cooldown', () => {
  const { Game } = boot();
  const g = new Game();
  g.addText(0, 0, 'SPOTTED', '#fff', 9);
  g.time = 0.4;
  g.addText(5, 5, 'SPOTTED · RELAY', '#fff', 10);
  g.time = 1.8;
  g.addText(8, 8, 'SPOTTED', '#fff', 9);
  assert.equal(g.printed.length, 1);
  g.time = 1.91;
  g.addText(9, 9, 'SPOTTED · RELAY', '#fff', 10);
  assert.equal(g.printed.length, 2);
  assert.deepEqual(g.printed.map((entry) => entry.text), ['SPOTTED · RELAY', 'SPOTTED · RELAY']);
});

test('friendly relay may announce again after its cooldown instead of being permanently muted', () => {
  const { Game } = boot();
  const g = new Game();
  g.addText(0, 0, 'CONTACT RELAY', '#fff', 10);
  g.time = 1.39;
  g.addText(0, 0, 'CONTACT', '#fff', 9);
  assert.equal(g.printed.length, 1);
  g.time = 1.41;
  g.addText(0, 0, 'CONTACT', '#fff', 9);
  assert.equal(g.printed.length, 2);
});

test('observer link status messages are independently de-duplicated', () => {
  const { Game } = boot();
  const g = new Game();
  g.addText(0, 0, 'OBSERVER DOWN · LOCAL SIGHT ONLY', '#fff', 10);
  g.addText(0, 0, 'OBSERVER DOWN · LOCAL SIGHT ONLY', '#fff', 10);
  g.addText(0, 0, 'OBSERVER LINK RESTORED', '#fff', 9);
  g.addText(0, 0, 'OBSERVER LINK RESTORED', '#fff', 9);
  assert.deepEqual(g.printed.map((entry) => entry.text), [
    'OBSERVER DOWN · LOCAL SIGHT ONLY',
    'OBSERVER LINK RESTORED'
  ]);
});

test('unrelated combat text is never throttled or rewritten', () => {
  const { Game } = boot();
  const g = new Game();
  g.addText(0, 0, 'RAIL FOCUS', '#fff', 9);
  g.addText(0, 0, 'RAIL FOCUS', '#fff', 9);
  g.addText(0, 0, '+120 XP', '#fff', 12);
  assert.deepEqual(g.printed.map((entry) => entry.text), ['RAIL FOCUS', 'RAIL FOCUS', '+120 XP']);
});
