'use strict';
// AI-owned Field Service drones must not gain remote awareness of offscreen
// enemy units through their repair threat scan. Physical incoming fire still
// matters; human-owned drones retain their existing local repair safety.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8');

function boot() {
  class Game {
    constructor() {
      this.time = 0; this.w = 220; this.h = 380; this.cam = { zoom: 1 };
      this.tanks = []; this.drones = []; this.bullets = [];
      this.tankById = new Map();
    }
    getTank(id) { return this.tankById.get(id) || null; }
    damageDrone(d, damage) { d.hp = Math.max(0, d.hp - damage); }
    updateDrones() {}
    hasLineOfSight() { return true; }
  }
  const modules = {
    'game/engine': m => { m.exports.Game = Game; },
    'game/ai': m => { m.exports.updateAI = () => {}; }
  };
  const win = { __novaModules: modules, NOVATips: { registerMany() {} } };
  const context = { window: win, console: { info() {}, error() {} },
    Math, Number, Map, Set, Date, Object, Array };
  // Real production loads Field Service before Fair Engagement. The helper
  // is resolved at threat-evaluation time, not module initialization time.
  for (const name of ['drone-field-service-v1.10.3.js', 'fair-engagement-v1.11.2.js'])
    vm.runInNewContext(source(name), context, { filename: name });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, () => ({ CLASSES: {} }));
  return { Game: module.exports.Game, win };
}
function setup({ ai = true, enemyKind = 'tank', enemyX = 190, enemyY = 0,
                 droneX = 190, width = 220, zoom = 1 } = {}) {
  const { Game, win } = boot(), g = new Game();
  g.w = width; g.cam.zoom = zoom;
  const owner = { id: 1, cls: 'marksman', kind: 'tank', team: 'blue',
    x: 0, y: 0, hp: 100, maxHp: 100, alive: true, ai: ai ? {} : null,
    isPlayer: !ai };
  const enemyOwner = { id: 2, cls: 'gunner', kind: 'tank', team: 'red',
    x: enemyKind === 'tank' ? enemyX : 1000,
    y: enemyKind === 'tank' ? enemyY : 0, hp: 100, maxHp: 100, alive: true };
  const d = { id: 7, kind: 'drone', ownerId: 1, x: droneX, y: 0,
    r: 8, hp: 100, maxHp: 100, attackCd: 0 };
  g.tanks = [owner, enemyOwner];
  g.tankById.set(owner.id, owner); g.tankById.set(enemyOwner.id, enemyOwner);
  g.drones = [d];
  if (enemyKind === 'drone')
    g.drones.push({ id: 8, kind: 'drone', ownerId: 2, x: enemyX,
      y: enemyY, r: 8, hp: 30, maxHp: 30 });
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  g.damageDrone(d, 20);
  g.time = 7;
  return { g, d, owner, enemyOwner, win,
    tick: () => { g.updateDrones(.2); return d.hp; } };
}

for (const kind of ['tank', 'drone']) {
  test('offscreen hostile ' + kind + ' does not remotely suppress AI drone repair', () => {
    const s = setup({ enemyKind: kind });
    assert.equal(s.win.__NOVA_FAIR_ENGAGEMENT__.inGameplayViewport(
      s.g, s.owner, kind === 'tank' ? s.enemyOwner : s.g.drones[1]), false);
    assert.ok(s.tick() > 80, 'AI should not know a hostile unit outside its viewport');
  });
  test('visible hostile ' + kind + ' still suppresses AI drone repair', () => {
    const s = setup({ enemyKind: kind, enemyX: 90 });
    assert.equal(s.tick(), 80);
  });
  test('human-owned drones retain local threat awareness of offscreen ' + kind, () => {
    const s = setup({ ai: false, enemyKind: kind });
    assert.equal(s.tick(), 80);
  });
}
test('the live portrait/landscape viewport controls AI repair sensing', () => {
  const portrait = setup({ enemyX: 150, width: 220 });
  const landscape = setup({ enemyX: 150, width: 400 });
  assert.ok(portrait.tick() > 80);
  assert.equal(landscape.tick(), 80);
});
test('zoom changes repair threat visibility with the same rule as Fair Engagement', () => {
  const zoomedOut = setup({ enemyX: 150, width: 220, zoom: .6 });
  const zoomedIn = setup({ enemyX: 150, width: 220, zoom: 1.5 });
  assert.equal(zoomedOut.tick(), 80);
  assert.ok(zoomedIn.tick() > 80);
});
test('solid cover still blocks a visible hostile unit', () => {
  const s = setup({ enemyX: 90 });
  s.g.hasLineOfSight = () => false;
  assert.ok(s.tick() > 80);
});
test('incoming hostile projectile remains dangerous even when its shooter is offscreen', () => {
  const s = setup({ enemyX: 1000 });
  s.g.bullets = [{ ownerId: 2, x: 230, y: 0, vx: -600, vy: 0, r: 3, ttl: .4 }];
  assert.equal(s.tick(), 80);
});
