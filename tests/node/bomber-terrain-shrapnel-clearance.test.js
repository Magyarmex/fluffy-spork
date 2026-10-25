'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function realCoreMethod(name, types) {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const marker = '    ' + name + '(' + (name === 'updateBullets' ? 'dt' : 'b') + ') {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core ' + name + ' missing');
  let end = start + marker.length, depth = 1;
  for (; end < html.length && depth; end++) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'unbalanced ' + name);
  return new Function('types_1', 'classes_1', 'M',
    'return function(' + (name === 'updateBullets' ? 'dt' : 'b') + '){' +
    html.slice(start + marker.length, end - 1) + '}')(
      types, { CLASSES: { scout: { size: 14 } } }, 2250);
}

const types = {
  TAU: Math.PI * 2, rnd: (a, b) => (a + b) / 2,
  dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2,
};
const coreUpdate = realCoreMethod('updateBullets', types);
const coreCluster = realCoreMethod('clusterBurst', types);

function boot(optimized, apex = false) {
  function Game() {
    this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
    this.tmp = [];
    this.cam = { shake: 0 };
    this.nextId = 10;
    this.sfx = { explode() {} };
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles', 'addFlash',
    'addRing', 'splashAt', 'updateDrones', 'update', 'weakenBullet']) {
    Game.prototype[name] = function () {};
  }
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = function () { return this.__testOwner || null; };
  Game.prototype.updateBullets = coreUpdate;
  Game.prototype.clusterBurst = coreCluster;
  function Sfx() {}
  Sfx.prototype.resume = function () {};
  const modules = {
    'game/audio': m => { m.exports = { Sfx }; },
    'game/classes': m => { m.exports = { CLASSES: { scout: { size: 14 }, clusterking: { size: 14 } } }; },
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const ctx = { window: { __novaModules: modules }, console, Math, Map, Date,
    performance: { now: () => 0 } };
  const files = ['battlefield-v1.6.0.js'];
  if (optimized) files.push('performance-v1.7.5.js');
  if (apex) files.push('apex-disciplines-v1.7.1.js');
  for (const file of files) vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8'),
    ctx, { filename: file });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw Error('Unexpected dependency ' + spec);
  });
  return module.exports.Game;
}

function fire(Game, shape, fps, opts = {}) {
  const g = new Game();
  g.time = 1;
  g.__novaBattlefield = { coverBroken: 0 };
  const terrain = [{ id: -1, shape, x: 0, y: 0, w: 160, h: 160,
    r: 80, solid: true, destructible: !!opts.destructible,
    hp: opts.destructible ? 5 : 0 }];
  if (opts.neighbor) {
    // Flanking cover does not intersect the parent at y=0, but catches
    // upward/downward shrapnel after it exits the impact face.
    for (const y of [-10, 10]) terrain.push({
      id: y, shape: 'rect', x: -90, y, w: 20, h: 16,
      solid: true, destructible: false,
    });
  }
  g.__novaTerrain = opts.natural ? [] : terrain;
  if (opts.apex) g.__testOwner = { id: 1, cls: 'clusterking', angle: 0,
    __v17FuseDepth: 0, stats: { damage: 0 }, level: 1, alive: true };
  g.bullets = [{
    id: 1, x: -120, y: opts.corner ? -120 : (opts.nearCorner ? -79 : (opts.offsetY || 0)),
    vx: (opts.natural || opts.expireNear) ? 0 : (opts.speed || 12000), vy: opts.corner ? 12000 : 0,
    r: 2, dmg: 12, ttl: (opts.natural || opts.expireNear || opts.sameTick) ? 0.001 : 2,
    shell: true, ownerId: 1, pen: 0, hits: 0, dead: false,
    color: '#aef', clusterDmg: 8,
  }];
  g.updateBullets(1 / fps);
  return g;
}

for (const optimized of [false, true]) {
  const label = optimized ? 'Battlefield + Performance' : 'Battlefield';
  for (const shape of ['rect', 'circle']) {
    for (const fps of [30, 60, 120, 240]) {
      test(label + ': outward Bomber shrapnel survives ' + shape + ' terrain at ' + fps + 'Hz', () => {
        const g = fire(boot(optimized), shape, fps);
        assert.equal(g.bullets.length, 3, 'three outward child rounds should remain');
        assert.ok(g.bullets.every(b => b.shell === false && !b.dead));
        assert.ok(g.bullets.every(b => b.vx < 0), 'inward rounds must hit cover');
        assert.ok(g.bullets.every(b => b.x < -80), 'survivors must remain outside cover');
      });
    }
  }
  test(label + ': natural expiry preserves all six shrapnel children', () => {
    const g = fire(boot(optimized), 'rect', 60, { natural: true });
    assert.equal(g.bullets.length, 6);
  });
  test(label + ': neighboring solid still blocks outward shrapnel', () => {
    const g = fire(boot(optimized), 'rect', 60, { neighbor: true });
    assert.equal(g.bullets.length, 1, 'flanking cover must stop the diagonal children');
  });
}

for (const optimized of [false, true]) {
  const label = optimized ? 'Battlefield + Performance' : 'Battlefield';
  for (const fps of [30, 60, 120, 240]) {
    test(label + ': corner exit retains five legal shrapnel directions at ' + fps + 'Hz', () => {
      const g = fire(boot(optimized), 'rect', fps, { corner: true });
      assert.equal(g.bullets.length, 5, 'corner must allow exit via either exposed face');
      assert.ok(g.bullets.every(b => !b.dead));
      assert.ok(g.bullets.every(b => b.x < -80 || b.y < -80));
    });
  }
  test(label + ': Apex Cluster King retains forward-sector shaping against cover', () => {
    const g = fire(boot(optimized, true), 'rect', 60, { apex: true });
    assert.equal(g.bullets.length, 0, 'forward-directed sector hits the wall');
  });
  test(label + ': shell spawned inside solid does not teleport its shrapnel outside', () => {
    const g = new (boot(optimized))();
    g.time = 1;
    g.__novaTerrain = [{ id: -1, shape: 'rect', x: 0, y: 0,
      w: 160, h: 160, solid: true, destructible: false }];
    g.bullets = [{ id: 1, x: 0, y: 0, vx: 12000, vy: 0,
      r: 2, dmg: 12, ttl: 2, shell: true, ownerId: 1,
      pen: 0, hits: 0, dead: false, color: '#aef' }];
    g.updateBullets(1 / 60);
    assert.equal(g.bullets.length, 0);
  });
}

for (const optimized of [false, true]) {
  for (const fps of [30, 60, 120, 240]) {
    test((optimized ? 'optimized' : 'base') + ': near-corner face must not teleport inward children through cover at ' + fps + 'Hz', () => {
      const g = fire(boot(optimized), 'rect', fps, { nearCorner: true });
      assert.equal(g.bullets.length, 3, 'only the three left-facing fragments clear the left face');
      assert.ok(g.bullets.every(b => b.vx < 0));
    });
  }
}

for (const optimized of [false, true]) {
  const label = optimized ? 'optimized' : 'base';
  test(label + ': breaching destructible cover keeps all six children in opened lane', () => {
    const g = fire(boot(optimized), 'rect', 60, { destructible: true });
    assert.equal(g.__novaTerrain[0].solid, false);
    assert.equal(g.bullets.length, 6);
  });
  test(label + ': earlier TTL burst keeps six children before a later wall', () => {
    const g = fire(boot(optimized), 'rect', 60, { sameTick: true });
    assert.equal(g.bullets.length, 6, 'expiry at x=-108 precedes wall face x=-80');
    assert.ok(g.bullets.every(b => b.x < -100), 'children cannot be born at the later wall');
  });
  test(label + ': natural expiry near intact cover keeps original burst origin', () => {
    const g = fire(boot(optimized), 'rect', 60, { expireNear: true });
    assert.equal(g.bullets.length, 6);
    assert.ok(g.bullets.every(b => b.x < -100));
  });
}

for (const optimized of [false, true]) {
  test((optimized ? 'optimized' : 'base') + ': 960 randomized terrain bursts obey outward-contact geometry', () => {
    const Game = boot(optimized);
    let seed = 297;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    }
    for (const shape of ['rect', 'circle']) {
      for (const fps of [30, 60, 120, 240]) {
        for (let n = 0; n < 120; n++) {
          const y = (random() * 2 - 1) * 60;
          const opts = { offsetY: y, speed: 24000 };
          const g = fire(Game, shape, fps, opts);
          const hit = g.firstTerrainHit(-120, y, -120 + 24000 / fps, y, 0.9);
          assert.ok(hit, 'parent shell must strike terrain');
          const normal = hit.hit;
          const expected = Array.from({ length: 6 }, (_, i) => {
            const a = i * Math.PI / 3;
            return Math.cos(a) * normal.nx + Math.sin(a) * normal.ny >= 0;
          }).filter(Boolean).length;
          assert.equal(g.bullets.length, expected,
            shape + ' ' + fps + 'Hz y=' + y.toFixed(4));
          for (const b of g.bullets) {
            assert.equal(g.firstTerrainHit(b.px, b.py, b.x, b.y, b.r * 0.45), null,
              'surviving fragment crossed the impacted solid');
          }
        }
      }
    }
  });
}
