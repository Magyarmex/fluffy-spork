'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/living-front-instincts-v1.12.0.js'), 'utf8');
const removeText = source.match(/^function remove\(g,s\)\{[^\n]+/m)?.[0];
const starText = source.match(/^function star\(g,st,s,defs,now\)\{[^\n]+/m)?.[0];
assert.ok(removeText, 'Living Front removal function must exist');
assert.ok(starText, 'Living Front Star behavior must exist');
const { remove, star } = vm.runInNewContext(
  removeText + '\n' + starText + '\n({remove,star})',
  { Math, Number },
  { filename: 'living-front-instincts-removal.js' }
);

function fixture() {
  const a = { id: 11, type: 'circle', hp: 1 };
  const b = { id: 12, type: 'star', hp: 1, __lfStarBorn: 0 };
  const c = { id: 13, type: 'triangle', hp: 1 };
  const g = { shapes: [a, b, c], shapeById: new Map([[11,a],[12,b],[13,c]]) };
  return { a, b, c, g };
}

test('expiring a Rogue Star removes it without interrupting the update', () => {
  const { a, b, c, g } = fixture();
  const st = { stats: { starsExpired: 0, starLifetimeTotal: 0 } };
  assert.equal(star(g, st, b, {}, 33), false);
  assert.equal(st.stats.starsExpired, 1);
  assert.equal(st.stats.starLifetimeTotal, 33);
  assert.equal(g.shapes.length, 2);
  assert.ok(g.shapes.includes(a));
  assert.ok(g.shapes.includes(c));
  assert.ok(!g.shapes.includes(b));
  assert.equal(g.shapeById.has(12), false);
  assert.equal(g.shapeById.size, 2);
});

test('swap removal preserves other shape identities and indexes', () => {
  const { a, b, c, g } = fixture();
  assert.equal(remove(g, a), true);
  assert.equal(g.shapes.length, 2);
  assert.equal(g.shapes[0], c);
  assert.equal(g.shapes[1], b);
  assert.equal(g.shapeById.has(11), false);
  assert.equal(g.shapeById.get(12), b);
  assert.equal(g.shapeById.get(13), c);
});

test('last-element removal and repeated removal remain safe', () => {
  const { c, g } = fixture();
  assert.equal(remove(g, c), true);
  assert.equal(remove(g, c), false);
  assert.equal(g.shapes.length, 2);
  assert.equal(g.shapeById.size, 2);
});

test('empty and map-free shape lists are handled', () => {
  const absent = { id: 999 };
  assert.equal(remove({ shapes: [] }, absent), false);
  assert.equal(remove({ shapes: [absent] }, absent), true);
});
