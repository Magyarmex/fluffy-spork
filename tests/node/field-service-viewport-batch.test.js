'use strict';
// Batch viewport geometry for Field Service without changing Fair Engagement's
// exact visible/hidden contract. Tests execute the production module order.
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
      this.time = 0; this.w = 220; this.h = 380;
      this.tanks = []; this.drones = []; this.bullets = [];
      this.tankById = new Map();
      this.cam = { zoom: 1 };
    }
    getTank(id) { return this.tankById.get(id) || null; }
    damageDrone(d, amount) { d.hp = Math.max(0, d.hp - amount); }
    updateDrones() {}
    hasLineOfSight() { return true; }
  }
  const modules = { 'game/engine': m => { m.exports.Game = Game; },
    'game/ai': m => { m.exports.updateAI = () => {}; } };
  const win = { __novaModules: modules, NOVATips: { registerMany() {} } };
  const context = { window: win, console: { info() {}, error() {} },
    Math, Number, Map, Set, Date, Object, Array };
  for (const name of ['drone-field-service-v1.10.3.js', 'fair-engagement-v1.11.2.js'])
    vm.runInNewContext(source(name), context, { filename: name });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({ CLASSES: {} }));
  return { Game: m.exports.Game, win };
}
function setup() {
  const { Game, win } = boot();
  const g = new Game();
  let zoom = 1, reads = 0;
  g.cam = { get zoom() { reads++; return zoom; } };
  const owner = { id: 1, team: 'blue', cls: 'marksman', alive: true,
    hp: 100, x: 0, y: 0, ai: {}, isPlayer: false };
  const rival = { id: 2, team: 'red', cls: 'gunner', alive: true,
    hp: 100, x: 1000, y: 0 };
  const d = { id: 10, kind: 'drone', ownerId: 1,
    hp: 80, maxHp: 100, r: 8, x: 0, y: 0, attackCd: 0 };
  g.tanks = [owner, rival]; g.tankById.set(1, owner); g.tankById.set(2, rival);
  const hostileDrones = Array.from({ length: 40 }, (_, i) => ({
    id: 100 + i, kind: 'drone', ownerId: 2,
    x: 140 + i, y: 0, hp: 30, maxHp: 30, r: 8
  }));
  g.drones = [d, ...hostileDrones];
  g.areAllies = (a, b) => a.team === b.team;
  g.areHostile = (a, b) => a.team !== b.team;
  return { g, owner, d, hostileDrones, win,
    setZoom: v => { zoom = v; }, reads: () => reads,
    resetReads: () => { reads = 0; } };
}

test('40 hidden drones share one viewport geometry calculation per threat scan', () => {
  const s = setup(), api = s.win.__NOVA_FIELD_SERVICE_TEST__;
  assert.equal(api.visibleThreat(s.g, s.d, s.owner), false);
  assert.ok(s.reads() <= 2, 'viewport zoom must not be re-read for every hidden drone');
});
test('a visible threat after many hidden drones still prevents repair', () => {
  const s = setup();
  s.hostileDrones.at(-1).x = 90;
  assert.equal(s.win.__NOVA_FIELD_SERVICE_TEST__.visibleThreat(s.g, s.d, s.owner), true);
  assert.ok(s.reads() <= 2);
});
test('human-owned drones retain local threat awareness beyond the viewport', () => {
  const s = setup();
  s.owner.isPlayer = true; s.owner.ai = null;
  assert.equal(s.win.__NOVA_FIELD_SERVICE_TEST__.visibleThreat(s.g, s.d, s.owner), true);
});
test('a new scan picks up live zoom changes instead of caching stale geometry', () => {
  const s = setup(), api = s.win.__NOVA_FIELD_SERVICE_TEST__;
  assert.equal(api.visibleThreat(s.g, s.d, s.owner), false);
  s.setZoom(.5);
  assert.equal(api.visibleThreat(s.g, s.d, s.owner), true);
});
test('batched viewport filter exactly matches canonical per-target viewport rule', () => {
  const s = setup(), fair = s.win.__NOVA_FAIR_ENGAGEMENT__;
  assert.equal(typeof fair.gameplayViewportFilter, 'function');
  const filter = fair.gameplayViewportFilter(s.g, s.owner);
  let seed = 0x5150123;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 2000; i++) {
    const t = { id: i + 20, x: (rnd() - .5) * 600,
      y: (rnd() - .5) * 800, hp: 20, alive: i % 13 !== 0 };
    assert.equal(filter(t), fair.inGameplayViewport(s.g, s.owner, t), 'candidate ' + i);
  }
  for (const t of [null, s.owner, { id: 3000, x: NaN, y: 0 },
    { id: 3001, x: 0, y: Infinity }, { id: 3002, x: 0, y: 0, hp: 0 }])
    assert.equal(filter(t), fair.inGameplayViewport(s.g, s.owner, t));
});
