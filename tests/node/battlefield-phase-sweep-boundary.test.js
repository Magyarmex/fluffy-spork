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
function shippingBullets() {
  const marker = '    updateBullets(dt) {', start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized bullet method must exist');
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
    { CLASSES: { ghost: { size: 15 } } }, 2250);
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
    initBulletIntegrity() {}
    resolveBulletCollisions() {}
    clusterBurst() {}
    damageTank(t, dmg) { this.contacts.push(t.id); t.hp -= dmg; }
    damageShape() {}
    damageDrone() {}
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
  Game.prototype.updateBullets = shippingBullets();
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

test('materialized projectile path cannot hit the empty space crossed by Phase Shift', () => {
  const Game = boot(), g = new Game(), t = tank();
  g.contacts = []; g.tanks = [t];
  g.moveTank(t, 0, 0, 1 / 60);
  g.useAbility(t);
  assert.equal(t.x, 420);
  // Projectile travels vertically across the apparent teleport chord at
  // x=380. The arrival hull is 40 units away, outside its 18-unit hit radius.
  g.hash.query = (_x, _y, _r, out) => { out.length = 0; out.push(t); };
  g.bullets = [{ id: 99, kind: 'bullet', ownerId: 1,
    x: 380, y: -90, vx: 0, vy: 6000, r: 3, dmg: 5,
    pen: 0, hits: 0, ttl: 1, dead: false, shell: false }];
  g.updateBullets(1 / 60);
  assert.deepEqual(g.contacts, [], 'no damage anywhere along intangible teleport path');
  assert.equal(t.hp, 100);
});


/* Issue #225: a Phase Shift may cross terrain but may not materialize
 * inside solid cover and then snap out during the following frame. */
for (const fps of [30, 60, 120, 240]) {
  for (const shape of ['rect', 'circle']) {
    test('Phase Shift lands clear of a permanent ' + shape + ' at ' + fps + 'Hz', () => {
      const Game = boot(), g = new Game(), t = tank();
      g.__novaTerrain = [shape === 'rect'
        ? { id: -1, shape, x: 420, y: 0, w: 80, h: 100, solid: true, destructible: false }
        : { id: -1, shape, x: 420, y: 0, r: 40, solid: true, destructible: false }];
      g.moveTank(t, 0, 0, 1 / fps);
      g.useAbility(t);
      assert.equal(g.isTerrainSafe(t.x, t.y, 18.5), true,
        'Phase must finish outside tank-radius padded terrain');
      assert.ok(t.x > 340 && t.x < 362, 'shorten only as far as the nearest clear landing');
      assert.equal(t.abilityCd, 8, 'successful shortened blink spends its normal cooldown');
      assert.equal(t.cloakT, .7);
      assert.equal(t.__novaSweepPrevX, t.x, 'shortened teleport has no swept hitbox');
      g.moveTank(t, 0, 0, 1 / fps);
      assert.ok(Math.abs(t.x - t.__novaSweepPrevX) < .01,
        'next frame must not snap the tank out of cover');
    });
  }
}
test('Phase Shift passes through intervening walls when its endpoint is clear', () => {
  const Game = boot(), g = new Game(), t = tank();
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 210, y: 0, w: 100, h: 150,
    solid: true, destructible: false }];
  g.useAbility(t);
  assert.equal(t.x, 420);
  assert.equal(t.abilityCd, 8);
});
test('Phase Shift can land on destroyed cover and respects intact destructible cover', () => {
  const Game = boot(), g = new Game(), t = tank();
  const cover = { id: -1, shape: 'rect', x: 420, y: 0, w: 80, h: 100,
    solid: true, destructible: true, hp: 50 };
  g.__novaTerrain = [cover];
  g.useAbility(t);
  assert.ok(t.x < 362);
  t.x = 0; t.abilityCd = 0; t.cloakT = 0;
  cover.hp = 0; cover.solid = false;
  g.useAbility(t);
  assert.equal(t.x, 420);
});
test('Phase Shift cancels without cooldown when no useful clear landing exists', () => {
  const Game = boot(), g = new Game(), t = tank();
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 240, y: 0, w: 440, h: 100,
    solid: true, destructible: false }];
  g.useAbility(t);
  assert.equal(t.x, 0);
  assert.equal(t.abilityCd, 0);
  assert.equal(t.cloakT, undefined);
});
test('Phase Shift keeps its existing edge-clamped destination when clear', () => {
  const Game = boot(), g = new Game(), t = tank('ghost', 2200);
  g.useAbility(t);
  assert.equal(t.x, 2220);
  assert.equal(t.abilityCd, 8);
});


test('shortened Phase Shift preserves the canonical ability sound and two-endpoint feedback', () => {
  const Game = boot(), g = new Game(), t = tank();
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 420, y: 0, w: 80, h: 100,
    solid: true, destructible: false }];
  const calls = { sound: 0, particles: [], rings: [], text: [] };
  g.sfx.ability = () => calls.sound++;
  g.addParticles = (x, y) => calls.particles.push([x, y]);
  g.addRing = (x, y) => calls.rings.push([x, y]);
  g.addText = (x, y, label) => calls.text.push(label);
  g.useAbility(t);
  assert.equal(calls.sound, 1);
  assert.equal(calls.particles.length, 2);
  assert.equal(calls.rings.length, 2);
  assert.deepEqual(calls.particles[0], [0, 0]);
  assert.deepEqual(calls.particles[1], [t.x, t.y]);
  assert.deepEqual(calls.text, ['PHASE SHIFT!']);
  assert.equal(t.abilityCd, 8);
});
test('cancelled Phase Shift does not create phantom arrival effects or consume cooldown', () => {
  const Game = boot(), g = new Game(), t = tank();
  g.__novaTerrain = [{ id: -1, shape: 'rect', x: 240, y: 0, w: 440, h: 100,
    solid: true, destructible: false }];
  t.isPlayer = true;
  const calls = { sound: 0, particles: 0, rings: 0, text: [] };
  g.sfx.ability = () => calls.sound++;
  g.addParticles = () => calls.particles++;
  g.addRing = () => calls.rings++;
  g.addText = (_x, _y, label) => calls.text.push(label);
  g.useAbility(t);
  assert.equal(calls.sound, 0);
  assert.equal(calls.particles, 0);
  assert.equal(calls.rings, 0);
  assert.deepEqual(calls.text, ['NO CLEAR LANDING']);
  assert.equal(t.abilityCd, 0);
});
test('Phase Shift randomized destination-only clearance and no phantom sweep', () => {
  const Game = boot();
  let seed = 0x2252026;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2500; i++) {
    const g = new Game(), t = tank();
    t.x = (random() - .5) * 3000;
    t.y = (random() - .5) * 3000;
    t.angle = random() * Math.PI * 2;
    const ox = t.x, oy = t.y;
    const intendedX = Math.max(-2220, Math.min(2220, ox + Math.cos(t.angle) * 420));
    const intendedY = Math.max(-2220, Math.min(2220, oy + Math.sin(t.angle) * 420));
    const cx = intendedX + (random() - .5) * 120;
    const cy = intendedY + (random() - .5) * 120;
    const circle = random() < .5;
    g.__novaTerrain = [circle
      ? { id: -1, shape: 'circle', x: cx, y: cy, r: 15 + random() * 110,
          solid: true, destructible: false }
      : { id: -1, shape: 'rect', x: cx, y: cy,
          w: 25 + random() * 180, h: 25 + random() * 180,
          solid: true, destructible: false }];
    const wasClear = g.isTerrainSafe(intendedX, intendedY, 18.5);
    g.useAbility(t);
    if (t.abilityCd > 0) {
      assert.equal(g.isTerrainSafe(t.x, t.y, 18.5), true, 'unsafe landing in world ' + i);
      assert.equal(t.__novaSweepPrevX, t.x);
      assert.equal(t.__novaSweepPrevY, t.y);
      if (wasClear) {
        assert.ok(Math.abs(t.x - intendedX) < 1e-9);
        assert.ok(Math.abs(t.y - intendedY) < 1e-9);
      }
    } else {
      assert.equal(t.x, ox, 'cancelled shift moved in world ' + i);
      assert.equal(t.y, oy);
    }
  }
});


test('Phase Shift selects the nearest narrow clear pocket between two walls', () => {
  const Game = boot(), g = new Game(), t = tank();
  g.__novaTerrain = [
    { id: -1, shape: 'rect', x: 420.5, y: 0, w: 20, h: 100, solid: true, destructible: false },
    { id: -2, shape: 'rect', x: 361.5, y: 0, w: 20, h: 100, solid: true, destructible: false }
  ];
  g.useAbility(t);
  assert.ok(t.x > 390 && t.x < 392, 'a narrow valid pocket near the target must not be skipped: ' + t.x);
  assert.equal(g.isTerrainSafe(t.x, t.y, 18.5), true);
});
test('Phase Shift selects the nearest narrow clear pocket between two pillars', () => {
  const Game = boot(), g = new Game(), t = tank();
  g.__novaTerrain = [
    { id: -1, shape: 'circle', x: 426.5, y: 0, r: 20, solid: true, destructible: false },
    { id: -2, shape: 'circle', x: 347.5, y: 0, r: 20, solid: true, destructible: false }
  ];
  g.useAbility(t);
  assert.ok(t.x > 386 && t.x < 388, 'the circular clearance gap must not be skipped: ' + t.x);
  assert.equal(g.isTerrainSafe(t.x, t.y, 18.5), true);
});
