'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'nova-updates/precision-contact-v1.8.3.js'), 'utf8');
const shipping = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function boot() {
  class Game {
    constructor() {
      this.time = 0; this.status = 'playing'; this.w = 800; this.h = 600;
      this.cam = { x: 0, y: 0, zoom: 1 };
      this.player = { id: 1, isPlayer: true, alive: true, x: 0, y: 0 };
      this.bullets = []; this.redeploys = 0;
      this.sfx = { shots: 0, swooshes: 0,
        novaPrecisionShotCue() { this.shots++; },
        novaPrecisionContactSwoosh() { this.swooshes++; } };
    }
    tryFire(t) {
      this.bullets.push({ id: this.bullets.length + 10, ownerId: t.id,
        x: t.x, y: t.y, vx: -500, vy: 0, ttl: 3, dead: false,
        __novaSniperLineage: true, __novaRail: false, beam: false });
    }
    updateBullets() {}
    redeploy() {
      this.redeploys++;
      this.time = 0;
      this.bullets = [];
      return 'fresh-run';
    }
  }
  const modules = { 'game/engine'(m) { m.exports.Game = Game; } };
  const window = { __novaModules: modules };
  vm.runInNewContext(source, { window, console: { info() {}, warn() {}, error() {} },
    Math, Date, Object, performance: { now: () => 1000 } },
    { filename: 'precision-contact-v1.8.3.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({}));
  return { Game: m.exports.Game };
}

const enemy = { id: 7, isPlayer: false, alive: true, x: 1000, y: 0 };

test('materialized redeploy resets time and projectiles on the same game instance', () => {
  const start = shipping.indexOf('    redeploy() {');
  assert.ok(start > 0);
  const body = shipping.slice(start, shipping.indexOf('    // ============ helpers', start));
  assert.match(body, /this\.time\s*=\s*0/);
  assert.match(body, /this\.bullets\s*=\s*\[\]/);
  assert.match(shipping, /nova-updates\/precision-contact-v1\.8\.3\.js/);
});

test('old offscreen hostile volley cannot generate a phantom spark after redeploy', () => {
  const { Game } = boot(), g = new Game();
  g.time = 90;
  g.tryFire(enemy);
  assert.equal(g.__v183Contact.volleys.length, 1);
  assert.equal(g.redeploy(), 'fresh-run');
  assert.equal(g.redeploys, 1);
  assert.equal(g.bullets.length, 0);
  g.updateBullets(1.3);
  assert.equal(g.sfx.swooshes, 0, 'a projectile removed by redeploy cannot announce arrival');
  assert.equal(g.__v183Contact?.sparks.length ?? 0, 0);
  assert.equal(g.__v183Contact?.volleys.length ?? 0, 0);
});

test('old precision sparks are removed from the next life rather than retained by reset time', () => {
  const { Game } = boot(), g = new Game();
  g.time = 40;
  g.tryFire(enemy);
  g.updateBullets(1.3);
  assert.equal(g.__v183Contact.sparks.length, 1, 'first run genuinely produced a spark');
  g.redeploy();
  assert.equal(g.__v183Contact?.sparks.length ?? 0, 0, 'new life cannot inherit visual flashes');
});

test('a fresh life can track a new volley without inheriting previous engagement state', () => {
  const { Game } = boot(), g = new Game();
  g.time = 75;
  g.tryFire(enemy);
  g.updateBullets(1.3);
  g.redeploy();
  g.tryFire(enemy);
  assert.equal(g.__v183Contact.volleys.length, 1);
  assert.equal(g.sfx.shots, 2, 'new-life shot cue must still work');
  g.updateBullets(1.3);
  assert.equal(g.sfx.swooshes, 2, 'one legitimate contact per life');
  assert.equal(g.__v183Contact.sparks.length, 1);
});

test('separate Game instances never share tracked incoming precision fire', () => {
  const { Game } = boot(), a = new Game(), b = new Game();
  a.tryFire(enemy);
  assert.equal(a.__v183Contact.volleys.length, 1);
  assert.equal(b.__v183Contact, undefined);
  b.tryFire(enemy);
  assert.equal(b.__v183Contact.volleys.length, 1);
  a.redeploy();
  assert.equal(b.__v183Contact.volleys.length, 1);
});
