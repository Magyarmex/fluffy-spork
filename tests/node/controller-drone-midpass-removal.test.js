'use strict';
// Regression for a real War Room CI crash: Controller.updateDrones iterated
// live indices while killTank removed another owner's drones mid-pass.
// Test the exact shipping method body, not a rewritten iterator.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,
  '../../nova-updates/controller-v1.3.0.js'), 'utf8');
const anchor = 'Game.prototype.updateDrones = function (dt) {';
const start = src.indexOf(anchor), end = src.indexOf('\n    };', start);
assert.ok(start >= 0 && end > start, 'canonical Controller updateDrones exists');
const body = src.slice(start + 'Game.prototype.updateDrones = '.length, end + 6)
  .trim().replace(/;$/, '');

function run({ remove = [], swap = false } = {}) {
  const updated = [], removed = [];
  const update = new Function('CLASSES', 'isController', 'squadFor',
    'updateCommand', 'profileFor', 'controllerTarget', 'chooseStrike',
    'controllerState', 'simulateControllerDrone', 'simulateLegacyDrone',
    'clamp', 'MAP_LIMIT', 'return (' + body + ')')(
    { basic: { droneCount: 0 } }, () => false, () => {},
    () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    (g, owner, d) => {
      updated.push(d.id);
      if (d.id === 5) {
        for (const id of remove) {
          const index = g.drones.findIndex(x => x.id === id);
          if (index >= 0) g.removeDroneAt(index);
        }
      }
    },
    (v, lo, hi) => Math.max(lo, Math.min(hi, v)), 2200);
  const owner = { id: 1, alive: true, cls: 'basic', gene: null,
    swarmT: 0, droneRespawnT: 100 };
  const g = { tanks: [owner], tankById: new Map([[1, owner]]),
    droneCounts: new Map(), quality: 'low',
    drones: [1,2,3,4,5].map(id => ({ id, ownerId: 1, hp: 20,
      x: 0, y: 0, hitFlash: 0, attackCd: 0 })),
    removeDroneAt(i) {
      removed.push(this.drones[i]?.id);
      if (swap) {
        const last = this.drones.length - 1;
        this.drones[i] = this.drones[last];
        this.drones.pop();
      } else this.drones.splice(i, 1);
    } };
  update.call(g, 1/60);
  return { updated, removed, remaining: g.drones.map(d => d.id) };
}

test('ordinary stable drone array still updates each owner exactly once in reverse order', () => {
  assert.deepEqual(run().updated, [5,4,3,2,1]);
});
for (const swap of [false, true]) {
  const method = swap ? 'swap-with-last' : 'splice';
  test(method + ': two lower-index drones removed during a committed attack never crash or double-update', () => {
    const out = run({ remove: [1,2], swap });
    assert.deepEqual(out.updated, [5,4,3]);
    assert.deepEqual([...out.remaining].sort((a,b)=>a-b), [3,4,5]);
  });
  test(method + ': current drone removed mid-pass is not simulated twice', () => {
    const out = run({ remove: [5,1], swap });
    assert.deepEqual(out.updated, [5,4,3,2]);
    assert.deepEqual([...out.remaining].sort((a,b)=>a-b), [2,3,4]);
  });
  test(method + ': three same-owner drone removals preserve all surviving updates', () => {
    const out = run({ remove: [1,2,3], swap });
    assert.deepEqual(out.updated, [5,4]);
    assert.deepEqual([...out.remaining].sort((a,b)=>a-b), [4,5]);
  });
}
test('real shipping shell still loads Controller before Live Vector', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const a = html.indexOf('src="./nova-updates/controller-v1.3.0.js"');
  const b = html.indexOf('src="./nova-updates/second-body-live-vector-v1.10.7.js"');
  assert.ok(a >= 0 && b > a);
});
