'use strict';
// Research-only chronological three-projectile oracle. This is NOT the shipping
// collision resolver, and it does not establish terrain/body/shell correctness.
const test = require('node:test');
const assert = require('node:assert/strict');
const { firstContact } = require('../research/projectile-first-event-certificate.cjs');
const complete = Object.freeze({
  allied: false, complete: true, unscanned: false,
  aTerrain: null, bTerrain: null, aBody: null, bBody: null,
  aOtherProjectile: null, bOtherProjectile: null
});
const shot = (id, x, vx, hp) => ({
  id, ownerId: id, kind: 'bullet', x, y: 0, vx, vy: 0, r: 3,
  ttl: .005, hp, pen: 0, hits: 0, dead: false, shell: false, beam: false
});
function physicalTime(a, b, horizon) {
  // This narrow test has no terrain, body or competing projectile side effects
  // until its first event; the oracle supplies the same pairwise disc geometry.
  return firstContact(a, b, horizon, complete);
}
function resolveChronologically(input, horizon) {
  const state = new Map(input.map(b => [b.id, { ...b }]));
  assert.equal(state.size, input.length, 'projectile ids must be unique');
  const events = [];
  for (let i = 0; i < input.length; i++) {
    for (let j = i + 1; j < input.length; j++) {
      const a = input[i], b = input[j], t = physicalTime(a, b, horizon);
      if (t !== null) events.push({ t, ids: [a.id, b.id].sort((x,y)=>x-y) });
    }
  }
  events.sort((a,b)=>a.t-b.t || a.ids[0]-b.ids[0] || a.ids[1]-b.ids[1]);
  const applied = [];
  for (const event of events) {
    const [a,b] = event.ids.map(id=>state.get(id));
    if (a.dead || b.dead) continue;
    // Simplified research integrity rule: one HP per participant per contact.
    a.hp--; b.hp--;
    if (a.hp <= 0) a.dead = true;
    if (b.hp <= 0) b.dead = true;
    applied.push(event);
  }
  return { state, applied };
}
test('three-way: surviving middle shot participates in the second event', () => {
  const a = shot(1, -20, 6000, 3), b = shot(2, 0, 0, 2),
    c = shot(3, 25, -6000, 1);
  const ab = physicalTime(a,b,1/240), bc = physicalTime(b,c,1/240),
    ac = physicalTime(a,c,1/240);
  assert.ok(Math.abs(ab-12.5/6000)<1e-12);
  assert.ok(Math.abs(bc-17.5/6000)<1e-12);
  assert.ok(Math.abs(ac-37.5/12000)<1e-12);
  assert.ok(ab < bc && bc < ac);
  for (const input of [[a,b,c],[c,b,a],[b,a,c]]) {
    const {state,applied} = resolveChronologically(input,1/240);
    assert.deepEqual(applied.map(e=>e.ids),[[1,2],[2,3]]);
    assert.deepEqual([1,2,3].map(id=>state.get(id).hp),[2,0,0]);
    assert.deepEqual([1,2,3].map(id=>state.get(id).dead),[false,true,true]);
  }
});
test('three-way: if first pair destroys both, no later contact can resurrect them', () => {
  const a=shot(1,-20,6000,1),b=shot(2,0,0,1),c=shot(3,25,-6000,1);
  const {state,applied}=resolveChronologically([c,b,a],1/240);
  assert.deepEqual(applied.map(e=>e.ids),[[1,2]]);
  assert.equal(state.get(3).hp,1);
});
test('short TTL contact occurs before expiry; one-sided expiry vetoes it', () => {
  const a=shot(1,-20,6000,1),b=shot(2,20,-6000,1);
  for (const hz of [30,60,120,240]) {
    assert.ok(Math.abs(physicalTime(a,b,1/hz)-32.5/12000)<1e-12);
    assert.deepEqual(resolveChronologically([a,b],1/hz).applied.map(e=>e.ids),[[1,2]]);
    assert.equal(physicalTime({...a,ttl:.001},b,1/hz),null);
  }
});
test('oracle never mutates the supplied projectile objects', () => {
  const a=shot(1,-20,6000,3),b=shot(2,0,0,2),c=shot(3,25,-6000,1);
  const before=JSON.stringify([a,b,c]);
  resolveChronologically([a,b,c],1/240);
  assert.equal(JSON.stringify([a,b,c]),before);
});
