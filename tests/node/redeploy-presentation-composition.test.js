'use strict';
// Integration: all three presentation reset wrappers compose in materialized order.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const layers = [
  'precision-contact-v1.8.3.js',
  'sensory-feedback-v1.9.1.js',
  'spotter-comms-v1.9.3.js'
];
function boot() {
  class Game {
    constructor() {
      this.time = 40; this.status = 'playing'; this.w = 800; this.h = 600;
      this.cam = { x: 0, y: 0, zoom: 1 };
      this.player = { id: 1, x: 0, y: 0, alive: true, isPlayer: true };
      this.bullets = []; this.messages = [];
      this.sfx = { shot: 0, swoosh: 0,
        novaPrecisionShotCue() { this.shot++; },
        novaPrecisionContactSwoosh() { this.swoosh++; } };
    }
    tryFire(t) {
      this.bullets.push({ ownerId: t.id, x: t.x, y: t.y, vx: -500, vy: 0,
        ttl: 3, dead: false, __novaSniperLineage: true, __novaRail: false, beam: false });
    }
    updateBullets() {}
    addText(_x, _y, text) { this.messages.push(text); }
    redeploy() { this.time = 0; this.bullets = []; return 'new-life'; }
  }
  const mods = { 'game/engine'(m) { m.exports.Game = Game; } };
  const window = { __novaModules: mods };
  const context = { window, console: { info() {}, warn() {}, error() {} },
    Math, Number, Date, Object, performance: { now: () => 1000 } };
  for (const name of layers) vm.runInNewContext(fs.readFileSync(path.join(root,
    'nova-updates', name), 'utf8'), context, { filename: name });
  const m = { exports: {} };
  mods['game/engine'](m, m.exports, () => ({ CLASSES: {} }));
  return { Game: m.exports.Game, window };
}

test('materialized game loads Contact Spark, Impact Language and Quiet Relay in this order', () => {
  const offsets = layers.map(name => html.indexOf('nova-updates/' + name));
  assert.ok(offsets.every(n => n > 0), 'all presentation layers must ship');
  assert.ok(offsets[0] < offsets[1] && offsets[1] < offsets[2],
    'test composition must match canonical materialized order');
});

test('a single redeploy clears every previous-life presentation state without breaking the wrappers', () => {
  const { Game, window } = boot(), g = new Game();
  const enemy = { id: 7, x: 1000, y: 0, isPlayer: false, alive: true };
  g.tryFire(enemy);
  window.__NOVA_FEEDBACK_TEST__.state(g).hitUntil = 40.5;
  g.addText(0, 0, 'CONTACT');
  assert.equal(g.__v183Contact.volleys.length, 1);
  assert.equal(g.messages.length, 1);
  assert.equal(g.redeploy(), 'new-life');
  assert.equal(g.__v183Contact, null);
  assert.equal(g.__v191Feedback, null);
  assert.equal(g.__novaSpotterCommsState, null);
  assert.equal(g.bullets.length, 0);
  g.updateBullets(1.3);
  assert.equal(g.sfx.swoosh, 0, 'no ghost incoming projectile from the old life');
  g.addText(0, 0, 'CONTACT RELAY');
  assert.equal(g.messages.length, 2, 'new life may immediately announce contact');
  g.tryFire(enemy);
  g.updateBullets(1.3);
  assert.equal(g.sfx.swoosh, 1, 'new life retains legitimate precision cues');
  assert.equal(g.__v183Contact.sparks.length, 1);
  assert.equal(window.__NOVA_FEEDBACK_TEST__.state(g).hitUntil, 0);
});
