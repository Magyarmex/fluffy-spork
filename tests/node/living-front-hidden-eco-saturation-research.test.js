'use strict';
// Regression #1029: private ecology intent must not alter witnessed strategic
// occupancy; public signals and locally visible farming remain actionable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function boot() {
  const window = { __novaModules: {} };
  const context = { window, console: { info() {}, warn() {}, error() {} },
    Math, Number, Object, Array, Date, JSON, Map, Set,
    performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {} };
  for (const name of ['living-front-core-v1.12.0.js',
    'living-front-instincts-v1.12.0.js',
    'living-front-director-v1.12.0.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', name), 'utf8'),
      context, { filename: name });
  }
  return window.__NOVA_LIVING_FRONT_TEST__;
}

function encounter(T, type, hiddenCount) {
  const observer = { id: 1, x: -400, y: -400, cls: 'twin',
    hp: 100, maxHp: 100, alive: true,
    ai: { __v1112TargetId: -1, isElite: false } };
  const sector = 6;
  const destination = T.sectorCenter(sector);
  const origin = T.sectorCenter(5);
  const signal = { type, sector, from: 5, to: sector,
    x: type === 'MIGRATION' ? (origin.x + destination.x) / 2 : destination.x,
    y: type === 'MIGRATION' ? (origin.y + destination.y) / 2 : destination.y,
    started: 9, until: 20 };
  const key = type + ':' + sector;
  const hidden = Array.from({ length: 4 }, (_, i) => ({
    id: 20 + i, x: 2000 + i * 30, y: 2000,
    hp: 100, maxHp: 100, alive: true,
    ai: { __lfEcoKey: i < hiddenCount ? key : 'none',
      __lfEcoWeight: 0.25 }
  }));
  const g = { time: 10, w: 800, h: 600, cam: { zoom: 1 },
    tanks: [observer, ...hidden], shapes: [],
    __lfState: { directorEnabled: true, signal,
      queryScratch: [], queryScratch2: [], stats: {} },
    hasLineOfSight() { return true; } };
  return { g, observer, hidden, signal };
}
function choose(T, w) { return T.publicEcoBias(w.g, w.observer, {}, {}); }

test('unseen private BLOOM commitments cannot veto a legal public rotation', () => {
  const T = boot(), w = encounter(T, 'BLOOM', 0);
  assert.equal(T.sectorIndex(w.signal.x, w.signal.y), w.signal.sector,
    'public signal must identify its actual physical sector');
  assert.notEqual(T.sectorIndex(w.observer.x, w.observer.y), w.signal.sector,
    'observer must not already occupy the public opportunity sector');
  for (const bot of w.hidden) {
    assert.ok(Math.abs(bot.x - w.observer.x) > w.g.w / 2,
      'the private assigner must be outside the observer viewport');
  }
  const open = choose(T, w);
  assert.equal(open.mode, 'signal');
  assert.equal(open.key, 'BLOOM:6');
  assert.ok(open.weight > .1);
  for (const bot of w.hidden) bot.ai.__lfEcoKey = 'BLOOM:6';
  const privatelyCrowded = choose(T, w);
  assert.equal(privatelyCrowded.mode, open.mode,
    'offscreen private commitments must not veto a public rotation');
  assert.equal(privatelyCrowded.weight, open.weight);
  assert.equal(w.signal.x, T.sectorCenter(6).x, 'public signal did not move');
  assert.equal(w.observer.x, -400, 'observer did not move');
});

test('unseen private MIGRATION commitments cannot suppress a public signal', () => {
  const T = boot(), w = encounter(T, 'MIGRATION', 0);
  const open = choose(T, w);
  assert.equal(open.mode, 'signal');
  assert.equal(open.key, 'MIGRATION:6');
  for (const bot of w.hidden.slice(0, 2)) bot.ai.__lfEcoKey = 'MIGRATION:6';
  const crowded = choose(T, w);
  assert.equal(crowded.mode, open.mode);
  assert.equal(crowded.weight, open.weight);
});



test('unseen private commitments cannot veto a publicly announced Rogue Star', () => {
  const T = boot(), w = encounter(T, 'ROGUE STAR', 0);
  const star = { id: 77, kind: 'shape', type: 'star',
    x: 100, y: -400, hp: 100, alive: true };
  w.signal.x = star.x;
  w.signal.y = star.y;
  delete w.signal.sector;
  delete w.signal.to;
  w.signal.starId = star.id;
  w.g.shapes = [star];
  w.g.getShape = id => id === star.id ? star : null;
  const open = choose(T, w);
  assert.equal(open.mode, 'signal');
  assert.equal(open.key, 'ROGUE STAR:77');
  for (const bot of w.hidden) bot.ai.__lfEcoKey = 'ROGUE STAR:77';
  const crowded = choose(T, w);
  assert.equal(crowded.mode, 'signal',
    'unseen private commitments must not veto the public Star');
  assert.equal(crowded.weight, open.weight);
});

test('remembered public BLOOM cannot be vetoed by unseen private commitments', () => {
  const T = boot(), w = encounter(T, 'BLOOM', 0);
  w.g.__lfState.signal = null;
  w.observer.x = -50; // Outside sector 6, close enough to pursue remembered center.
  w.g.__lfState.bloomMemory = { sector: 6, announcedAt: 9, until: 33 };
  const open = choose(T, w);
  assert.equal(open.mode, 'memory');
  assert.equal(open.key, 'BLOOM:6');
  for (const bot of w.hidden.slice(0, 2)) bot.ai.__lfEcoKey = 'BLOOM:6';
  const crowded = choose(T, w);
  assert.equal(crowded.mode, open.mode);
  assert.equal(crowded.weight, open.weight);
  // A future or expired announcement cannot create a memory decision.
  w.g.__lfState.bloomMemory.announcedAt = 11;
  assert.equal(choose(T, w).mode, 'none');
  w.g.__lfState.bloomMemory.announcedAt = 9;
  w.g.__lfState.bloomMemory.until = 9;
  assert.equal(choose(T, w).mode, 'none');
});


test('local visible farming ignores unseen private eco assignments', () => {
  const T = boot(), w = encounter(T, 'BLOOM', 0);
  w.g.__lfState.signal = null;
  w.g.shapes = Array.from({ length: 4 }, (_, i) => ({
    id: 100 + i, kind: 'shape', type: 'pentagon',
    x: -250 + i * 8, y: -400, hp: 100, alive: true
  }));
  const defs = { pentagon: { xp: 100 } };
  const sample = () => T.publicEcoBias(w.g, w.observer, defs, {});
  const open = sample();
  assert.equal(open.mode, 'local');
  assert.equal(open.key, 'LOCAL:' + T.sectorIndex(-238, -400));
  for (const bot of w.hidden) bot.ai.__lfEcoKey = open.key;
  const crowded = sample();
  assert.equal(crowded.mode, 'local',
    'offscreen private farming intent must not veto visible local farming');
  assert.equal(crowded.weight, open.weight);
});

test('dead, shielded and terrain-occluded nearby bots do not create false occupancy', () => {
  const T = boot(), w = encounter(T, 'BLOOM', 4);
  w.g.w = 2400;
  w.g.h = 1600;
  const c = T.sectorCenter(6);
  for (const bot of w.hidden) {
    bot.x = c.x;
    bot.y = c.y;
    bot.alive = false;
  }
  assert.equal(choose(T, w).mode, 'signal', 'dead bots do not crowd');
  for (const bot of w.hidden) {
    bot.alive = true;
    bot.spawnShieldT = 1;
  }
  assert.equal(choose(T, w).mode, 'signal', 'shielded bots do not crowd');
  for (const bot of w.hidden) bot.spawnShieldT = 0;
  w.g.hasLineOfSight = () => false;
  assert.equal(choose(T, w).mode, 'signal', 'terrain-occluded bots do not crowd');
  w.g.hasLineOfSight = () => true;
  assert.equal(choose(T, w).mode, 'none', 'unshielded visible bodies do crowd');
});

test('the materialized shipping shell includes the Living Front strategy owner', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
});

test('visible physical crowding, not private assignment, can deter a public rotation', () => {
  const T = boot(), w = encounter(T, 'BLOOM', 0);
  w.g.w = 2400;
  w.g.h = 1600;
  const baseline = choose(T, w);
  assert.equal(baseline.mode, 'signal');
  const c = T.sectorCenter(6);
  for (const bot of w.hidden) {
    bot.x = c.x + 20;
    bot.y = c.y + 20;
    bot.ai.__lfEcoKey = 'none';
    bot.ai.__lfEcoWeight = 0;
  }
  const crowded = choose(T, w);
  assert.equal(crowded.mode, 'none',
    'visible physical occupancy may deter the same public destination');
  for (const bot of w.hidden) {
    bot.ai.__lfEcoKey = 'BLOOM:6';
    bot.ai.__lfEcoWeight = .99;
  }
  assert.equal(choose(T, w).mode, crowded.mode,
    'private assignment must not change a witnessed crowding decision');
});
