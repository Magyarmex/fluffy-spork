'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { firstDetachedPermanentTerrainEvent: query } = require('../research/projectile-detached-permanent-terrain.cjs');
const shot = () => ({ kind: 'bullet', dead: false, shell: false, beam: false, pen: 0, hits: 0, x: -20, y: 0, vx: 1000, vy: 0, r: 3, ttl: .5 });
const wall = () => ({ shape: 'rect', x: 0, y: 0, w: 4, h: 40, solid: true, destructible: false });
const game = (terrain, fraction = .5) => ({
  __novaTerrain: terrain,
  firstTerrainHit(ax, ay, bx, by, pad) {
    assert.equal(this.__novaTerrain.length, terrain.length);
    assert.notStrictEqual(this.__novaTerrain, terrain);
    assert.notStrictEqual(this.__novaTerrain[0], terrain[0]);
    assert.equal(pad, 1.35);
    this.__novaBattlefieldIndex = { scratch: [] };
    this.__novaTerrain[0].__novaBattlefieldStamp = 123;
    return fraction == null ? null : { solid: this.__novaTerrain[0], hit: { t: fraction } };
  }
});
test('detached query returns frame-relative wall time without touching live geometry or index', () => {
  const g = game([wall()]);
  const before = JSON.stringify(g);
  assert.deepEqual(query(g, shot(), .04), { complete: true, time: .02, reason: null });
  assert.equal(JSON.stringify(g), before);
  assert.equal(Object.hasOwn(g, '__novaBattlefieldIndex'), false);
});
test('clear path is complete, not an unknown terrain event', () => {
  const g = game([wall()], null);
  assert.deepEqual(query(g, shot(), .04), { complete: true, time: null, reason: null });
});
test('destructible cover refuses positive terrain chronology', () => {
  const g = game([{ ...wall(), destructible: true, hp: 10 }]);
  assert.equal(query(g, shot(), .04).complete, false);
});
test('missing, malformed, and sparse terrain refuse certification', () => {
  const g = game([wall()]);
  delete g.__novaTerrain;
  assert.equal(query(g, shot(), .04).complete, false);
  const sparse = Array(2); sparse[0] = wall();
  assert.equal(query(game(sparse), shot(), .04).complete, false);
  assert.equal(query(game([{ ...wall(), w: NaN }]), shot(), .04).complete, false);
});
test('invalid hit fractions and foreign solids are rejected', () => {
  for (const fraction of [-.01, 1.01, NaN])
    assert.equal(query(game([wall()], fraction), shot(), .04).complete, false);
  const g = game([wall()]);
  g.firstTerrainHit = () => ({ solid: wall(), hit: { t: .2 } });
  assert.equal(query(g, shot(), .04).complete, false);
});
test('query failures abstain without touching live terrain', () => {
  const g = game([wall()]);
  g.firstTerrainHit = function () { this.__novaTerrain[0].x = 900; throw Error('failure'); };
  assert.equal(query(g, shot(), .04).complete, false);
  assert.equal(g.__novaTerrain[0].x, 0);
});
