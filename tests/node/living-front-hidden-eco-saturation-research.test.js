'use strict';
// Research-only #1029: prove that the *shipping* Living Front ecology
// planner can change a public opportunity decision solely because distant
// bots change private strategic intent. Do not change gameplay in this test.
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

function encounter(type, hiddenCount) {
  const observer = { id: 1, x: -400, y: -400, cls: 'twin',
    hp: 100, maxHp: 100, alive: true,
    ai: { __v1112TargetId: -1, isElite: false } };
  const sector = 6;
  const signal = { type, sector, from: 1, to: sector,
    x: 100, y: -400, started: 9, until: 20 };
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

test('unseen private BLOOM commitments alone can veto a legal public rotation', () => {
  const T = boot(), w = encounter('BLOOM', 0);
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
  assert.equal(privatelyCrowded.mode, 'none',
    'the current shipping code must reproduce the hidden-intent decision veto');
  assert.equal(privatelyCrowded.weight, 0);
  assert.equal(w.signal.x, 100, 'public signal did not move');
  assert.equal(w.observer.x, -400, 'observer did not move');
});

test('unseen private MIGRATION commitments can suppress a public signal', () => {
  const T = boot(), w = encounter('MIGRATION', 0);
  const open = choose(T, w);
  assert.equal(open.mode, 'signal');
  assert.equal(open.key, 'MIGRATION:6');
  for (const bot of w.hidden.slice(0, 2)) bot.ai.__lfEcoKey = 'MIGRATION:6';
  const crowded = choose(T, w);
  assert.equal(crowded.mode, 'none');
  assert.equal(crowded.weight, 0);
});



test('unseen private commitments can also veto a publicly announced Rogue Star', () => {
  const T = boot(), w = encounter('ROGUE STAR', 0);
  const star = { id: 77, kind: 'shape', type: 'star',
    x: 100, y: -400, hp: 100, alive: true };
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
  assert.notEqual(crowded.mode, 'signal',
    'unseen private commitments must reproduce the public Star veto');
});

test('remembered public BLOOM can also be vetoed by unseen private commitments', () => {
  const T = boot(), w = encounter('BLOOM', 0);
  w.g.__lfState.signal = null;
  w.g.__lfState.bloomMemory = { sector: 6, announcedAt: 9, until: 33 };
  const open = choose(T, w);
  assert.equal(open.mode, 'memory');
  assert.equal(open.key, 'BLOOM:6');
  for (const bot of w.hidden.slice(0, 2)) bot.ai.__lfEcoKey = 'BLOOM:6';
  const crowded = choose(T, w);
  assert.equal(crowded.mode, 'none');
  assert.equal(crowded.weight, 0);
  // A future or expired announcement cannot create a memory decision.
  w.g.__lfState.bloomMemory.announcedAt = 11;
  assert.equal(choose(T, w).mode, 'none');
  w.g.__lfState.bloomMemory.announcedAt = 9;
  w.g.__lfState.bloomMemory.until = 9;
  assert.equal(choose(T, w).mode, 'none');
});


test('local visible farming also depends on unseen private eco assignments', () => {
  const T = boot(), w = encounter('BLOOM', 0);
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
  assert.equal(crowded.mode, 'none',
    'offscreen private farming intent alone must reproduce the local veto');
  assert.equal(crowded.weight, 0);
});

test('dead and sub-threshold distant intents do not create false saturation', () => {
  const T = boot(), w = encounter('BLOOM', 3);
  for (const bot of w.hidden) bot.alive = false;
  assert.equal(choose(T, w).mode, 'signal');
  for (const bot of w.hidden) {
    bot.alive = true;
    bot.ai.__lfEcoWeight = 0.05;
  }
  assert.equal(choose(T, w).mode, 'signal');
});

test('the materialized shipping shell includes the Living Front strategy owner', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
});
