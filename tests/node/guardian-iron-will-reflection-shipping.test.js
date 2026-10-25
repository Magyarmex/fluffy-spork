'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const overlay = fs.readFileSync(path.join(root, 'nova-updates/disciplines-v1.7.0.js'), 'utf8');

function coreDamage(classes) {
  const marker = '    damageTank(t, dmg, srcId, kx = 0, ky = 0) {';
  const at = html.indexOf(marker);
  assert.ok(at >= 0, 'materialized damageTank must be exercised');
  let pos = at + marker.length, depth = 1;
  while (depth && pos < html.length) {
    if (html[pos] === '{') depth++;
    else if (html[pos] === '}') depth--;
    pos++;
  }
  assert.equal(depth, 0);
  return new Function('classes_1', 'types_1',
    'return function(t,dmg,srcId,kx=0,ky=0){' +
      html.slice(at + marker.length, pos - 1) + '}')(
    { CLASSES: classes }, { rnd: () => 0 });
}

function boot() {
  const defs = {
    fortress: { aura: 0, size: 19, ability: 'taunt', bullet: {} },
    bastion: { aura: .10, size: 21, ability: 'taunt', bullet: {} },
    scout: { aura: 0, size: 15, bullet: {} }
  };
  class Game {
    constructor() {
      this.tanks = []; this.bullets = []; this.time = 10;
      this.cam = { shake: 0 }; this.hurtSndT = 0;
      this.sfx = { hit() {}, hurt() {} };
    }
    getTank(id) { return this.tanks.find(t => t.id === id) || null; }
  }
  Game.prototype.damageTank = coreDamage(defs);
  for (const name of ['addParticles', 'addImpactDebris', 'addText',
    'addRing', 'addFlash', 'tryFire', 'useAbility', 'updateBullets',
    'update', 'setClass']) Game.prototype[name] = function() {};
  Game.prototype.killTank = function(t) { t.alive = false; };
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/audio': m => { m.exports.Sfx = function() {}; },
    'game/render': m => { m.exports.render = function() {}; }
  };
  const window = { __novaModules: modules };
  vm.runInNewContext(overlay, { window, Math, Number, Object, Array, Map,
    console: { info() {}, warn() {}, error() {} } },
  { filename: 'disciplines-v1.7.0.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => {
    assert.equal(spec, './classes');
    return { CLASSES: defs, lineageForClass: id =>
      id === 'scout' ? 'gunner' : 'guardian' };
  });
  return new m.exports.Game();
}

function tank(id, cls, x, angle, extra = {}) {
  return Object.assign({
    id, cls, x, y: 0, angle, hp: 100, maxHp: 100,
    alive: true, tauntT: 0, bulwarkT: 0, shieldT: 0,
    spawnShieldT: 0, __v17PerfectGuardUntil: -1,
    isPlayer: false, vx: 0, vy: 0
  }, extra);
}

for (const fps of [30, 60, 120, 240]) {
  test('materialized frontal Iron Will reflects one 30% hit at ' + fps + 'Hz', () => {
    const g = boot(); g.time = 10 + 1 / fps;
    const guard = tank(1, 'fortress', 0, 0, { tauntT: 3 });
    const attacker = tank(2, 'scout', 100, Math.PI);
    g.tanks = [guard, attacker];
    g.damageTank(guard, 20, attacker.id);
    assert.ok(Math.abs(attacker.hp - 94) < 1e-9,
      'the advertised 30% reflection must reach the attacker');
    assert.ok(guard.hp < 100 && guard.hp > 90,
      'directional mitigation remains active');
    assert.equal(guard.tauntT, 3);
    assert.equal(g.__v17ReflectingIronWill, false);
  });
}

test('two active Iron Wills reflect at most once, without recursion or lost guard', () => {
  const g = boot(), left = tank(1, 'fortress', 0, 0, { tauntT: 3 });
  const right = tank(2, 'fortress', 100, Math.PI, { tauntT: 3 });
  g.tanks = [left, right];
  const old = g.damageTank; let calls = 0;
  g.damageTank = function(...args) {
    calls++; assert.ok(calls <= 3, 'recursive reflection loop');
    return old.apply(this, args);
  };
  g.damageTank(left, 20, right.id);
  assert.equal(calls, 2, 'one original hit and one reflected hit');
  assert.ok(left.hp < 100 && right.hp < 100);
  assert.equal(left.tauntT, 3);
  assert.equal(right.tauntT, 3);
});

test('rear hits cannot exploit frontal reflection', () => {
  const g = boot(), guard = tank(1, 'fortress', 0, 0, { tauntT: 3 });
  const attacker = tank(2, 'scout', -100, 0);
  g.tanks = [guard, attacker];
  g.damageTank(guard, 20, attacker.id);
  assert.equal(attacker.hp, 100);
  assert.ok(guard.hp < 100);
});

test('spawn protection and Perfect Guard block reflected damage', () => {
  for (const protection of ['spawnShieldT', '__v17PerfectGuardUntil']) {
    const g = boot(), guard = tank(1, 'fortress', 0, 0, { tauntT: 3 });
    const attacker = tank(2, 'scout', 100, Math.PI);
    guard[protection] = protection === 'spawnShieldT' ? 1 : g.time + .2;
    g.tanks = [guard, attacker];
    g.damageTank(guard, 20, attacker.id);
    assert.equal(attacker.hp, 100);
    assert.equal(guard.hp, 100);
  }
});

test('reflection exceptions restore Iron Will duration and reentrancy guard', () => {
  const g = boot(), guard = tank(1, 'fortress', 0, 0, { tauntT: 3 });
  const attacker = tank(2, 'scout', 100, Math.PI);
  g.tanks = [guard, attacker];
  const old = g.damageTank;
  g.damageTank = function(t, ...args) {
    if (t === attacker) throw new Error('injected reflected-hit failure');
    return old.call(this, t, ...args);
  };
  assert.throws(() => g.damageTank(guard, 20, attacker.id), /injected reflected-hit failure/);
  assert.equal(guard.tauntT, 3);
  assert.equal(guard.bulwarkT, 0);
  assert.equal(g.__v17ReflectingIronWill, false);
});

test('already-dead Guardians never inflict posthumous reflected damage', () => {
  for (const state of [{ alive: false, hp: 100 }, { alive: true, hp: 0 }]) {
    const g = boot(), guard = tank(1, 'fortress', 0, 0,
      { tauntT: 3, ...state });
    const attacker = tank(2, 'scout', 100, Math.PI);
    g.tanks = [guard, attacker];
    g.damageTank(guard, 20, attacker.id);
    assert.equal(attacker.hp, 100);
    assert.equal(guard.tauntT, 3);
  }
});
