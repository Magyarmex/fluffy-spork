'use strict';
// Research-only chronological three-projectile oracle. This is NOT the shipping
// collision resolver, and it does not establish terrain/body/shell correctness.
const test = require('node:test');
const assert = require('node:assert/strict');
// Pair geometry is intentionally computed independently. The conservative
// certificate requires a *complete* competing-event context, which a three-shot
// research oracle cannot fake by passing null for other projectile contacts.
const shot = (id, x, vx, hp) => ({
  id, ownerId: id, kind: 'bullet', x, y: 0, vx, vy: 0, r: 3,
  ttl: .005, hp, pen: 0, hits: 0, dead: false, shell: false, beam: false
});
function physicalTime(a, b, horizon) {
  if (a.ownerId === b.ownerId || a.dead || b.dead) return null;
  const px = a.x - b.x, py = a.y - b.y;
  const vx = a.vx - b.vx, vy = a.vy - b.vy;
  const radius = a.r + b.r + 1.5;
  const c = px * px + py * py - radius * radius;
  let t = 0;
  if (c > 0) {
    const speed2 = vx * vx + vy * vy, dot = px * vx + py * vy;
    if (!(speed2 > 0) || !(dot < 0)) return null;
    const disc = dot * dot - speed2 * c;
    if (!(disc > 64 * Number.EPSILON *
        (Math.abs(dot * dot) + Math.abs(speed2 * c)))) return null;
    t = c / (-dot + Math.sqrt(disc));
  }
  return t >= 0 && t < Math.min(horizon, a.ttl, b.ttl) - 1e-10 ? t : null;
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
  // A shared simultaneous event needs a separate global tie policy. This
  // narrow oracle refuses to invent one from array order or projectile IDs.
  for (let i=1;i<events.length;i++) {
    if (Math.abs(events[i].t-events[i-1].t)<=1e-9) {
      throw new Error('ambiguous simultaneous projectile contacts');
    }
  }
  const applied = [];
  for (const event of events) {
    const [a,b] = event.ids.map(id=>state.get(id));
    if (a.dead || b.dead) continue;
    // Shipping Sniper semantics: each shot damages the other by its
    // pre-contact integrity, not a flat one HP per collision.
    const ah = a.hp, bh = b.hp;
    a.hp -= bh; b.hp -= ah;
    if (a.hp <= 0) a.dead = true;
    if (b.hp <= 0) b.dead = true;
    applied.push(event);
  }
  return { state, applied };
}
test('three-way: first collision destroys B; surviving A then intercepts C', () => {
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
    assert.deepEqual(applied.map(e=>e.ids),[[1,2],[1,3]]);
    assert.deepEqual([1,2,3].map(id=>state.get(id).hp),[0,-1,0]);
    assert.deepEqual([1,2,3].map(id=>state.get(id).dead),[true,true,true]);
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
test('simultaneous three-way contacts abstain instead of using ID order', () => {
  const a=shot(1,-20,6000,1),b=shot(2,0,0,1),c=shot(3,20,-6000,1);
  assert.throws(()=>resolveChronologically([a,b,c],1/240),
    /ambiguous simultaneous projectile contacts/);
});
