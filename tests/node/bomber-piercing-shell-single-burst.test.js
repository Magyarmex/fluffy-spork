'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Use the real shipping core bullet loop: direct-hit shells with penetration
// can survive one contact, and the core still calls clusterBurst on each hit.
function shippingUpdater() {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'shipping core updater missing');
  let end = start + marker.length, depth = 1;
  for (; end < html.length && depth; end++) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'unbalanced shipping core updater');
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
      { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
      { CLASSES: { scout: { size: 14 } } }, 2250);
}
const coreUpdate = shippingUpdater();

function boot(optimized, apex = false) {
  function Game() {
    this.hash = { query: (_x, _y, _r, out) => {
      out.length = 0; out.push(...this.targets);
    } };
    this.targets = []; this.tmp = []; this.bullets = [];
    this.cam = { shake: 0 }; this.bursts = 0; this.damageEvents = [];
  }
  for (const method of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles', 'addFlash',
    'addRing', 'splashAt', 'updateDrones', 'update', 'weakenBullet']) {
    Game.prototype[method] = function () {};
  }
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = function () { return this.__testOwner || null; };
  Game.prototype.updateBullets = coreUpdate;
  Game.prototype.clusterBurst = function (parent) {
    this.bursts++;
    if (this.__testChildren) for (let i = 0; i < 6; i++)
      this.bullets.push({ ownerId: parent.ownerId, vx: 100, vy: 0 });
  };
  Game.prototype.damageShape = function (e, dmg) {
    this.damageEvents.push(e.id); e.hp -= dmg;
  };
  function Sfx() {}
  Sfx.prototype.resume = function () {};
  const modules = {
    'game/audio': m => { m.exports = { Sfx }; },
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const ctx = { window: { __novaModules: modules }, console, Math, Map, Date,
    performance: { now: () => 0 } };
  const files = ['battlefield-v1.6.0.js'];
  if (apex) files.push('apex-disciplines-v1.7.1.js');
  if (optimized) files.push('performance-v1.7.5.js');
  for (const file of files) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8'),
      ctx, { filename: file });
  }
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw Error('unexpected dependency: ' + spec);
  });
  return module.exports.Game;
}

function shell(x, vx, opts = {}) {
  return { x, y: 0, vx, vy: 0, r: 2, dmg: 10,
    ttl: opts.ttl ?? 2, ownerId: 1, pen: opts.pen ?? 1,
    hits: 0, dead: false, shell: true };
}

for (const optimized of [false, true]) {
  const label = optimized ? 'Battlefield + Performance' : 'Battlefield';
  for (const fps of [30, 60, 120, 240]) {
    test(label + ': a piercing shell hitting two distinct shapes bursts only once at ' + fps + 'Hz', () => {
      const g = new (boot(optimized))();
      g.time = 1; g.__novaTerrain = [];
      g.targets = [0, 100].map((x, i) =>
        ({ kind: 'shape', id: i + 10, x, y: 0, r: 12, hp: 100 }));
      const b = shell(-100, 100 * fps);
      g.bullets = [b];
      g.updateBullets(1 / fps);
      assert.deepEqual(g.damageEvents, [10]);
      assert.equal(b.dead, false);
      g.time += 1 / fps;
      g.updateBullets(1 / fps);
      assert.deepEqual(g.damageEvents, [10, 11], 'both targets must still receive direct damage');
      assert.equal(g.bursts, 1, 'one physical shell must produce one cluster burst');
      assert.equal(b.dead, true);
    });
  }
  test(label + ': a shell that hits once and then expires bursts only once', () => {
    const g = new (boot(optimized))();
    g.time = 1; g.__novaTerrain = [];
    g.targets = [{ kind: 'shape', id: 10, x: 0, y: 0, r: 12, hp: 100 }];
    const b = shell(-100, 2000, { ttl: .075, pen: 2 });
    g.bullets = [b];
    g.updateBullets(.05);
    assert.equal(g.bursts, 1);
    g.time += .05;
    g.updateBullets(.05);
    assert.equal(g.bursts, 1, 'TTL after an earlier direct hit must not create a second burst');
  });
  test(label + ': ordinary shell expiry still produces one burst', () => {
    const g = new (boot(optimized))();
    g.time = 1; g.__novaTerrain = []; g.targets = [];
    g.bullets = [shell(-100, 0, { ttl: .001 })];
    g.updateBullets(.016);
    assert.equal(g.bursts, 1);
  });
}

for (const optimized of [false, true]) {
  test((optimized ? 'optimized' : 'base') +
    ': Apex Cluster King reshapes the first burst but not phantom later bursts', () => {
    const g = new (boot(optimized, true))();
    g.time = 1; g.__novaTerrain = [];
    g.__testChildren = true;
    g.__testOwner = { id: 1, cls: 'clusterking', angle: 0, __v17FuseDepth: .7 };
    const parent = shell(0, 100, { pen: 2 });
    g.clusterBurst(parent);
    g.clusterBurst(parent);
    assert.equal(g.bursts, 1);
    assert.equal(g.bullets.length, 6);
    assert.ok(g.bullets.every(child => child.__v171SectorChild),
      'the legitimate first burst must retain Apex sector shaping');
    const angles = g.bullets.map(b => Math.atan2(b.vy, b.vx));
    assert.ok(angles[0] < angles[5], 'Cluster King sector still spreads its children');
  });
}
