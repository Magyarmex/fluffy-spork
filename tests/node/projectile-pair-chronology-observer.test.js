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
    shot(3, 0, 0, 0)] };
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

test('swept disjoint pairs skip expensive competing-event provider safely', () => {
  const g = { bullets: Array.from({ length: 23 }, (_, i) =>
    shot(i + 1, i * 100, 0, i * 100)) };
  let calls = 0;
  const r = observeProjectilePairs(g, .05, () => { calls++; return verified(); });
  assert.equal(r.incomplete, false);
  assert.equal(r.certified.length, 0);
  assert.equal(r.pairs, 253);
  assert.equal(calls, 0);
});
test('swept boxes do not skip fast crossings with distant endpoints', () => {
  const g = { bullets: [shot(1, -100, 6000), shot(2, 100, -6000)] };
  let calls = 0;
  const r = observeProjectilePairs(g, .05, () => { calls++; return verified(); });
  assert.equal(calls, 1);
  assert.equal(r.certified.length, 1);
});

test('reversing projectile storage order preserves physical first-contact time', () => {
  const a = shot(1, -20, 1000), b = shot(2, 20, -1000);
  const forward = observeProjectilePairs({ bullets: [a, b] }, .05, verified);
  const reversed = observeProjectilePairs({ bullets: [b, a] }, .05, verified);
  assert.equal(forward.certified.length, 1);
  assert.equal(reversed.certified.length, 1);
  assert.ok(Math.abs(forward.certified[0].time - reversed.certified[0].time) < 1e-12);
});
test('no positive certificate before a future-frame crossing', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  const r = observeProjectilePairs(g, 1 / 120, verified);
  assert.equal(r.incomplete, false);
  assert.equal(r.certified.length, 0);
});
test('expiration before physical contact never creates an interception', () => {
  const a = shot(1, -20, 1000), b = shot(2, 20, -1000);
  a.ttl = .005;
  const r = observeProjectilePairs({ bullets: [a, b] }, .05, verified);
  assert.equal(r.certified.length, 0);
});

test('three-way chronology chooses earliest A-B over later B-C and A-C', () => {
  const a = shot(1, -20, 6000), b = shot(2, 0, 0), c = shot(3, 25, -6000);
  const ab = (20 - 7.5) / 6000;
  const bc = (25 - 7.5) / 6000;
  const ac = (45 - 7.5) / 12000;
  const events = (x, y) => {
    const ids = [x.ownerId, y.ownerId].sort((p, q) => p - q).join('-');
    if (ids === '1-2') return { ...verified(), aOtherProjectile: ac, bOtherProjectile: bc };
    if (ids === '2-3') return { ...verified(), aOtherProjectile: ab, bOtherProjectile: ac };
    return { ...verified(), aOtherProjectile: ab, bOtherProjectile: bc };
  };
  const r = observeProjectilePairs({ bullets: [a, b, c] }, 1 / 240, events);
  assert.equal(r.incomplete, false);
  assert.equal(r.certified.length, 1);
  assert.deepEqual([r.certified[0].i, r.certified[0].j], [0, 1]);
  assert.ok(Math.abs(r.certified[0].time - ab) < 1e-12);
});

test('malformed event getter cannot throw through read-only observer', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  const context = verified();
  Object.defineProperty(context, 'aTerrain', {
    get() { throw Error('broken event source'); }
  });
  const r = observeProjectilePairs(g, .05, () => context);
  assert.equal(r.incomplete, true);
  assert.equal(r.reason, 'event-provider-error');
  assert.equal(r.certified.length, 0);
});

test('nearby unsupported shell invalidates an otherwise positive pair certificate', () => {
  const a = shot(1, -20, 1000), b = shot(2, 20, -1000);
  const shell = shot(3, 0, 0);
  shell.shell = true;
  const r = observeProjectilePairs({ bullets: [a, b, shell] }, .05, verified);
  assert.equal(r.incomplete, true);
  assert.equal(r.reason, 'unsupported-projectile-present');
  assert.equal(r.certified.length, 0);
});
test('distant unsupported shell still invalidates unobserved fragment births', () => {
  const a = shot(1, -20, 1000), b = shot(2, 20, -1000);
  const shell = shot(3, 1000, 0, 1000);
  shell.shell = true;
  const r = observeProjectilePairs({ bullets: [a, b, shell] }, .05, verified);
  assert.equal(r.incomplete, true);
  assert.equal(r.certified.length, 0);
});

test('undefined competing-event time in later pair revokes earlier certificate', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000),
    shot(3, 0, 0)] };
  let calls = 0;
  const r = observeProjectilePairs(g, .05, () =>
    ++calls === 1 ? verified() : { ...verified(), aTerrain: undefined });
  assert.equal(r.incomplete, true);
  assert.equal(r.reason, 'unverified-pair');
  assert.equal(r.certified.length, 0);
});

test('malformed projectile getter cannot interrupt the real Game update', () => {
  const bad = shot(1, -20, 1000);
  Object.defineProperty(bad, 'x', { get() { throw Error('invalid projectile'); } });
  const g = { bullets: [bad, shot(2, 20, -1000)] };
  const r = observeProjectilePairs(g, .05, verified);
  assert.equal(r.incomplete, true);
  assert.equal(r.reason, 'snapshot-error');
  assert.equal(r.certified.length, 0);
});

test('event provider receives frozen snapshots, independently witnessed', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  let frozen = false, sawGame = false;
  const r = observeProjectilePairs(g, .05, (a, b, i, j, dt, game) => {
    frozen = Object.isFrozen(a) && Object.isFrozen(b);
    sawGame = game !== undefined;
    return verified();
  });
  assert.equal(frozen, true);
  assert.equal(sawGame, false);
  assert.equal(r.certified.length, 1);
});
test('missing one competing-event field invalidates an otherwise complete context', () => {
  const g = { bullets: [shot(1, -20, 1000), shot(2, 20, -1000)] };
  const context = verified();
  delete context.bOtherProjectile;
  const r = observeProjectilePairs(g, .05, () => context);
  assert.equal(r.incomplete, true);
  assert.equal(r.reason, 'unverified-pair');
  assert.equal(r.certified.length, 0);
});

test('chronological ordering beats projectile array enumeration', () => {
  const lateA = shot(1, -30, 1000, 100), lateB = shot(2, 30, -1000, 100);
  const earlyA = shot(3, -20, 1000), earlyB = shot(4, 20, -1000);
  const r = observeProjectilePairs({ bullets: [lateA, lateB, earlyA, earlyB] },
    .05, verified);
  assert.equal(r.incomplete, false);
  assert.equal(r.certified.length, 1);
  assert.deepEqual([r.certified[0].i, r.certified[0].j], [2, 3]);
  assert.ok(Math.abs(r.certified[0].time - .01625) < 1e-12);
});
