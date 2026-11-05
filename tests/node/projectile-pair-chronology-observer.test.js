'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { observeProjectilePairs, MAX_PAIRS } =
  require('../research/projectile-pair-chronology-observer.cjs');
const blockers = { aTerrain: null, bTerrain: null, aBody: null,
  bBody: null, aOtherProjectile: null, bOtherProjectile: null };
const verified = () => ({ complete: true, allied: false, unscanned: false, ...blockers });
const shot = (ownerId, x, vx, y = 0) => ({
  kind: 'bullet', ownerId, x, y, vx, vy: 0, ttl: .1, r: 3,
  pen: 0, hits: 0, shell: false, beam: false, dead: false
});
test('unique earliest first contact is certified without mutating Game', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  const before = JSON.stringify(g);
  const r = observeProjectilePairs(g, .05, verified);
  assert.equal(r.incomplete, false);
  assert.equal(r.certified.length, 1);
  assert.ok(Math.abs(r.certified[0].time - .01625) < 1e-10);
  assert.equal(JSON.stringify(g), before);
});
test('earlier wall vetoes interception', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  const r = observeProjectilePairs(g, .05, () => ({ ...verified(), aTerrain: .01 }));
  assert.equal(r.certified.length, 0);
  assert.equal(r.incomplete, false);
});
test('missing competing-event context fails closed', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  const r = observeProjectilePairs(g, .05, () => ({ complete: true, allied: false }));
  assert.equal(r.incomplete, true);
  assert.equal(r.certified.length, 0);
});
test('event-provider failure fails closed', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  const r = observeProjectilePairs(g, .05, () => { throw Error('terrain unavailable'); });
  assert.equal(r.incomplete, true);
  assert.equal(r.certified.length, 0);
});
test('pair budget fails closed before expensive work', () => {
  const g = { bullets: Array.from({ length: 24 }, (_, i) => shot(i, i * 10, 0)) };
  let calls = 0;
  const r = observeProjectilePairs(g, .05, () => { calls++; return verified(); });
  assert.ok(24 * 23 / 2 > MAX_PAIRS);
  assert.equal(r.incomplete, true);
  assert.equal(r.certified.length, 0);
  assert.equal(calls, 0);
});
test('simultaneous independent contacts abstain instead of array-order tie-break', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000),
    shot(3, -20, 1000, 100), shot(4, 20, -1000, 100)] };
  const r = observeProjectilePairs(g, .05, verified);
  assert.equal(r.certified.length, 0);
  assert.equal(r.reason, 'simultaneous-contact');
});
test('later contact cannot override the earliest physical contact', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000),
    shot(3, -30, 1000, 100), shot(4, 30, -1000, 100)] };
  const r = observeProjectilePairs(g, .05, verified);
  assert.equal(r.certified.length, 1);
  assert.deepEqual([r.certified[0].i, r.certified[0].j], [0, 1]);
});
test('disabled/missing observer context never calls the updater', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)],
    updateBullets() { throw Error('must not invoke gameplay'); } };
  const r = observeProjectilePairs(g, .05);
  assert.equal(r.incomplete, true);
  assert.equal(r.certified.length, 0);
});

test('late missing context clears earlier positive certificates', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000),
    shot(3, 300, 0, 100)] };
  let calls = 0;
  const r = observeProjectilePairs(g, .05, () => ++calls === 1 ? verified() : null);
  assert.equal(r.incomplete, true);
  assert.equal(r.certified.length, 0);
  assert.equal(r.reason, 'unverified-pair');
});
test('event provider cannot mutate frozen snapshots or receive Game', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  const before = JSON.stringify(g);
  const r = observeProjectilePairs(g, .05, (a, b, i, j, dt, game) => {
    assert.equal(game, undefined);
    assert.equal(Object.isFrozen(a), true);
    a.x = 100;
    return verified();
  });
  assert.equal(r.incomplete, true);
  assert.equal(r.certified.length, 0);
  assert.equal(JSON.stringify(g), before);
});
