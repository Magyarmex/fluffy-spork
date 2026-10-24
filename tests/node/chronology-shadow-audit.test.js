'use strict';
// Opt-in chronology shadow: diagnostics must not change real combat outcomes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function shippingCoreBullets() {
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized game bullet method missing');
  let pos = start + marker.length, depth = 1;
  while (depth && pos < html.length) {
    if (html[pos] === '{') depth++;
    else if (html[pos] === '}') depth--;
    pos++;
  }
  assert.equal(depth, 0);
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(start + marker.length, pos - 1) + '}')(
    { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
    { CLASSES: { scout: { size: 15 } } }, 2250);
}

function boot(customBullets, customBurst) {
  class Base {}
  Base.prototype.updateBullets = customBullets || shippingCoreBullets();
  Base.prototype.clusterBurst = customBurst || function(b) {
    if (b.__novaClusterBurstConsumed) return;
    b.__novaClusterBurstConsumed = true;
    this.events.push({ x: b.x, y: b.y, id: b.id });
  };
  const modules = { 'game/engine': m => { m.exports = { Game: Base }; } };
  const window = { __novaModules: modules };
  const ctx = { window, console: { info() {}, error() {}, warn() {} },
    Map, Math, Date, performance: { now: () => 0 } };
  vm.runInNewContext(fs.readFileSync(path.join(root,
    'nova-updates/performance-v1.7.8.js'), 'utf8'), ctx);
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({}));
  const g = Object.create(m.exports.Game.prototype);
  g.bullets = [];
  g.events = [];
  g.hash = { query(_x, _y, _r, out) { out.length = 0; } };
  g.tmp = [];
  g.initBulletIntegrity = function() {};
  g.resolveBulletCollisions = function() {};
  g.addParticles = function() {};
  return { g, window };
}
function shell(id, x, vx, ttl, y = 0, vy = 0) {
  return { id, kind: 'bullet', ownerId: 1, x, y, vx, vy,
    r: 3, dmg: 10, ttl, pen: 0, hits: 0, shell: true,
    dead: false, beam: false, color: '#fff' };
}

test('shipping chain includes the audit carrier before later combat overlays', () => {
  const b = html.indexOf('nova-updates/battlefield-v1.6.0.js');
  const p = html.indexOf('nova-updates/performance-v1.7.8.js');
  const c = html.indexOf('nova-updates/precision-contact-v1.8.3.js');
  assert.ok(b >= 0 && b < p && p < c);
});

test('audit is disabled by default and does not allocate a frame or state', () => {
  const { g } = boot();
  g.bullets = [shell(1, 0, 6000, 0.005)];
  g.updateBullets(1 / 30);
  assert.deepEqual(g.events, [{ x: 200, y: 0, id: 1 }]);
  assert.equal(g.__novaChronoShadow, undefined);
  assert.equal(g.__novaChronoShadowFrame, undefined);
  assert.equal(g.novaChronoShadowSnapshot().frames, 0);
});

test('opt-in detects actual materialized TTL overshoot without changing burst', () => {
  const { g, window } = boot();
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = [shell(2, 0, 6000, 0.005)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(window.__NOVA_CHRONO_SHADOW_LAST__, g.__novaChronoShadow);
  assert.equal(s.frames, 1);
  assert.equal(s.sampledShells, 1);
  assert.equal(s.bursts, 1);
  assert.equal(s.ttlOvershoots, 1);
  assert.equal(s.arenaOvershoots, 0);
  assert.ok(Math.abs(s.events[0].expectedX - 30) < 1e-9);
  assert.ok(Math.abs(s.events[0].overshoot - 170) < 1e-9);
  assert.deepEqual(g.events, [{ x: 200, y: 0, id: 2 }]);
  assert.equal(g.__novaChronoShadowFrame, undefined);
});

test('opt-in detects the materialized arena overshoot independently of TTL', () => {
  const { g, window } = boot();
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = [shell(3, 2220, 6000, 1)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.arenaOvershoots, 1);
  assert.equal(s.ttlOvershoots, 0);
  assert.ok(Math.abs(s.events[0].expectedX - 2230) < 1e-8);
  assert.ok(Math.abs(s.events[0].overshoot - 190) < 1e-8);
  assert.equal(g.events[0].x, 2420);
});

test('no false alarm at exact TTL endpoint', () => {
  const { g, window } = boot();
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = [shell(4, 0, 600, 1 / 30)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.bursts, 1);
  assert.equal(s.ttlOvershoots, 0);
  assert.equal(s.arenaOvershoots, 0);
});

test('early physical collision does not count as an overshoot', () => {
  const { g, window } = boot(function() {
    this.bullets[0].x = 18;
    this.clusterBurst(this.bullets[0]);
  });
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = [shell(5, 0, 6000, 0.005)];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().bursts, 1);
  assert.equal(g.novaChronoShadowSnapshot().ttlOvershoots, 0);
});

test('previously consumed shell does not count a second burst attempt', () => {
  const { g, window } = boot(function() {
    this.clusterBurst(this.bullets[0]);
    this.clusterBurst(this.bullets[0]);
  });
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = [shell(6, 200, 6000, 0.005)];
  g.updateBullets(1 / 30);
  assert.equal(g.events.length, 1);
  assert.equal(g.novaChronoShadowSnapshot().bursts, 1);
});

test('sampling and diagnostic ring stay bounded in dense projectile frames', () => {
  const { g, window } = boot();
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = Array.from({ length: 100 }, (_, i) => shell(i, 0, 6000, 0.005));
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.sampledShells, 12);
  assert.equal(s.bursts, 12);
  assert.equal(s.ttlOvershoots, 12);
  assert.equal(s.events.length, 12);
  assert.equal(g.events.length, 100);
});

test('bounded sampling rotates across projectile identities between frames', () => {
  const { g, window } = boot(function() {
    for (const b of this.bullets) {
      b.x = 200;
      this.clusterBurst(b);
      b.x = 0;
    }
  }, function() {});
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = Array.from({ length: 100 }, (_, i) => shell(i, 0, 6000, 0.005));
  const ids = new Set();
  for (let i = 0; i < 5; i++) {
    g.updateBullets(1 / 30);
    const snap = g.novaChronoShadowSnapshot();
    for (const event of snap.events) ids.add(event.id);
  }
  assert.equal(g.novaChronoShadowSnapshot().sampledShells, 60);
  assert.ok(ids.size > 12, 'the same early shells were repeatedly sampled');
});

test('diagnostics do not flag projectiles entering from outside the arena', () => {
  const { g, window } = boot();
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = [shell(7, 2250, -6000, 0.005)];
  g.updateBullets(1 / 30);
  const s = g.novaChronoShadowSnapshot();
  assert.equal(s.arenaOvershoots, 0);
});

test('non-shell projectiles are not sampled', () => {
  const { g, window } = boot();
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  const b = shell(8, 0, 6000, 0.005); b.shell = false;
  g.bullets = [b];
  g.updateBullets(1 / 30);
  assert.equal(g.novaChronoShadowSnapshot().sampledShells, 0);
});

test('exceptions preserve core semantics and release frame bookkeeping', () => {
  const { g, window } = boot(function() {
    this.clusterBurst(this.bullets[0]);
  }, function() { throw new Error('test-burst-failure'); });
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = [shell(9, 0, 6000, 0.005)];
  assert.throws(() => g.updateBullets(1 / 30), /test-burst-failure/);
  assert.equal(g.__novaChronoShadowFrame, undefined);
});

test('snapshot event array is a copy and metrics survive successive frames', () => {
  const { g, window } = boot();
  window.__NOVA_CHRONO_SHADOW_ENABLED__ = true;
  g.bullets = [shell(10, 0, 6000, 0.005)];
  g.updateBullets(1 / 30);
  const first = g.novaChronoShadowSnapshot();
  first.events.length = 0;
  g.bullets = [shell(11, 0, 6000, 0.005)];
  g.updateBullets(1 / 30);
  const next = g.novaChronoShadowSnapshot();
  assert.equal(next.frames, 2);
  assert.equal(next.ttlOvershoots, 2);
  assert.equal(next.events.length, 2);
});
