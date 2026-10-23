'use strict';
// #170 candidate: core splashAt queries entity centers only, while its exact
// overlap check assumes every entity has a radius (core tanks do not).
// Use the actual shipping core method and spatial hash, not a reimplementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const overlay = fs.readFileSync(path.join(root, 'nova-updates/blast-cover-hardening-v1.7.2.js'), 'utf8');

function shippingCore() {
  const hi = html.indexOf('class SHash {');
  const he = html.indexOf('\n// ---------------- game', hi);
  const si = html.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {');
  const se = html.indexOf('\n    clusterBurst(b) {', si);
  assert.ok(hi >= 0 && he > hi && si >= 0 && se > si,
    'real materialized core hash and splash method are available');
  const SHash = new Function(html.slice(hi, he) + '\nreturn SHash;')();
  const Game = new Function('types_1', 'return class Game {\n' + html.slice(si, se) + '\n}')({
    dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2
  });
  Game.prototype.damageTank = function(t, dmg) { t.hp -= dmg; t.hits = (t.hits || 0) + 1; };
  Game.prototype.damageDrone = function(d, dmg) { d.hp -= dmg; };
  Game.prototype.killShape = function() {};
  const modules = { 'game/engine': m => { m.exports.Game = Game; } };
  const win = { __novaModules: modules };
  vm.runInNewContext(overlay, { window: win, Math, Object,
    console: { info() {}, warn() {}, error() {} } },
    { filename: 'blast-cover-hardening-v1.7.2.js' });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({
    CLASSES: { scout: { size: 15 }, bastion: { size: 21 } }
  }));
  return { Game: m.exports.Game, SHash };
}

function scenario(x, entities, radius = 34) {
  const { Game, SHash } = shippingCore();
  const g = new Game();
  g.hash = new SHash(); g.tmp = []; g.tanks = entities.filter(e => e.kind === 'tank');
  g.cam = { shake: 0 }; g.sfx = { explode() {} };
  g.addRing = () => {}; g.addParticles = () => {};
  for (const e of entities) g.hash.insert(e);
  const originalQuery = g.hash.query;
  g.splashAt(x, 0, radius, .25, 1, 0, '#fff', 20);
  assert.equal(g.hash.query, originalQuery, 'query hook restored after splash');
  assert.equal(Object.hasOwn(g.hash, 'query'), false, 'prototype method is not shadowed');
  return { g, entities };
}
function tank(x, cls = 'scout') {
  return { id: 2, kind: 'tank', cls, x, y: 0, hp: 100, alive: true };
}
function hex(x) {
  return { id: 3, kind: 'shape', type: 'hexagon', x, y: 0, r: 33, hp: 190, flash: 0 };
}

test('34-radius Bomber fragment never heals a distant tank sharing its hash cell', () => {
  const t = tank(150);
  scenario(0, [t]);
  assert.equal(t.hp, 100);
  assert.equal(t.hits || 0, 0);
  assert.equal(Object.hasOwn(t, 'r'), false, 'temporary tank radius restored');
});

test('a distant tank in an adjacent cell remains outside splash', () => {
  const t = tank(190);
  scenario(0, [t]);
  assert.equal(t.hp, 100);
});

test('a tank genuinely within the splash radius still takes positive damage', () => {
  const t = tank(20);
  scenario(0, [t]);
  assert.ok(t.hp < 100 && t.hp > 90);
  assert.equal(t.hits, 1);
});

test('hexagon edge overlap across a spatial cell boundary is no longer lost', () => {
  const a = hex(185), b = hex(205);
  scenario(140, [a]);
  scenario(160, [b]);
  assert.ok(a.hp < 190, 'edge overlap receives real splash');
  assert.ok(Math.abs(a.hp - b.hp) < 1e-9,
    'translating identical geometry across hash-cell boundary changes no damage');
});

for (const radius of [34, 45, 72, 115]) {
  test('physical splash overlap and exclusion at radius ' + radius, () => {
    const edge = hex(140 + radius + 32);
    const outside = hex(140 + radius + 34);
    scenario(140, [edge, outside], radius);
    assert.ok(edge.hp < 190, 'intersecting shape is included in broad phase');
    assert.equal(outside.hp, 190, 'non-intersecting shape is excluded');
  });
}

test('preexisting tank radius remains intact', () => {
  const t = tank(20, 'bastion'); t.r = 21;
  scenario(0, [t]);
  assert.equal(t.r, 21);
});

test('query restoration and temporary radii survive an exception', () => {
  const { Game, SHash } = shippingCore();
  const g = new Game(), t = tank(20);
  g.tanks = [t]; g.hash = new SHash(); g.tmp = [];
  g.hash.query = () => { throw new Error('synthetic query failure'); };
  g.cam = { shake: 0 }; g.sfx = { explode() {} };
  g.addRing = () => {}; g.addParticles = () => {};
  const query = g.hash.query;
  assert.throws(() => g.splashAt(0, 0, 34, .25, 1, 0, '#fff', 20),
    /synthetic query failure/);
  assert.equal(g.hash.query, query);
  assert.equal(Object.hasOwn(t, 'r'), false);
});
