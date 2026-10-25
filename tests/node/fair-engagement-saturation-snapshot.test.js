'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/fair-engagement-v1.11.2.js'), 'utf8');

function boot() {
  const window = { __novaModules: {} };
  vm.runInNewContext(source, { window, Math, Number, Object, Array, Map,
    console: { info() {}, warn() {}, error() {} } });
  return window.__NOVA_FAIR_ENGAGEMENT_TEST__;
}

const classes = {
  lineageForClass(id) { return ({ marksman: 'sniper', cannon: 'cannon',
    carrier: 'controller', guardian: 'guardian' })[id] || 'gunner'; }
};

function naiveChoose(T, g, observer, now) {
  let best = null, score = -Infinity;
  for (const target of g.tanks) {
    if (!target || target.id === observer.id) continue;
    // The public score helper retains the uncached, per-candidate saturation scan.
    const candidate = T.scoreTarget(g, classes, observer, observer.ai, target, now);
    if (candidate > score) { score = candidate; best = target; }
  }
  return best;
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296; };
}

test('cached saturation exactly preserves legacy target selection in 4,000 seeded worlds', () => {
  const T = boot(), random = seeded(0xFEEDBEEF);
  const classesList = ['basic', 'marksman', 'cannon', 'carrier', 'guardian'];
  const states = ['hunt', 'farm', 'wander', 'flee'];
  const postures = [undefined, 'pressure', 'flank', 'route', 'hold'];
  let compared = 0;
  for (let world = 0; world < 4000; world++) {
    const count = 3 + Math.floor(random() * 23);
    const tanks = Array.from({ length: count }, (_, i) => ({
      id: i + 1, x: (random() - .5) * 1300, y: (random() - .5) * 1000,
      hp: 1 + Math.floor(random() * 100), maxHp: 100,
      alive: random() > .07, spawnShieldT: random() < .09 ? 1 : 0,
      cls: classesList[Math.floor(random() * classesList.length)],
      tier: Math.floor(random() * 5), isPlayer: random() < .2,
      team: random() < .2 ? 1 : 2,
      ai: { state: states[Math.floor(random() * states.length)],
        __v180Posture: postures[Math.floor(random() * postures.length)],
        __v1112TargetId: random() < .6 ? 1 + Math.floor(random() * count) : -1,
        __v1105TargetId: random() < .4 ? 1 + Math.floor(random() * count) : -1,
        __v180TargetId: random() < .4 ? 1 + Math.floor(random() * count) : -1,
        targetId: random() < .4 ? 1 + Math.floor(random() * count) : -1 }
    }));
    const observer = tanks[0]; observer.alive = true;
    const g = { tanks, w: 1000, h: 700, cam: { zoom: 1 },
      time: world / 60, getTank(id) { return tanks.find(t => t.id === id) || null; } };
    const expected = naiveChoose(T, g, observer, g.time);
    const actual = T.chooseTarget(g, classes, observer, observer.ai, g.time);
    assert.equal(actual && actual.id, expected && expected.id,
      'candidate choice changed in seeded world ' + world);
    compared++;
  }
  assert.equal(compared, 4000);
});

test('strict numeric versus string target IDs retain their distinct saturation counts', () => {
  const T = boot();
  const observer = { id: 1, x: 0, y: 0, alive: true, hp: 100, maxHp: 100,
    team: 1, cls: 'basic', ai: { state: 'hunt', targetId: -1 } };
  const numeric = { id: 2, x: 100, y: 0, alive: true, hp: 100, maxHp: 100,
    team: 2, cls: 'basic', spawnShieldT: 0 };
  const textual = { ...numeric, id: '2', x: 105 };
  const attacker = { id: 4, x: -100, y: 0, alive: true, hp: 100, maxHp: 100,
    team: 1, cls: 'basic', ai: { state: 'hunt', __v1112TargetId: 2 } };
  const g = { tanks: [observer, numeric, textual, attacker], w: 900, h: 700,
    cam: { zoom: 1 }, time: 1 };
  assert.equal(T.chooseTarget(g, classes, observer, observer.ai, 1)?.id,
    naiveChoose(T, g, observer, 1)?.id);
});

test('saturation changes between choices are observed rather than cached across frames', () => {
  const T = boot();
  const owner = { id: 1, x: 0, y: 0, hp: 100, maxHp: 100, alive: true,
    cls: 'basic', ai: { state: 'hunt', targetId: -1 } };
  const a = { id: 2, x: 100, y: 0, hp: 100, maxHp: 100, alive: true,
    cls: 'basic', ai: { state: 'wander', targetId: -1 } };
  const b = { id: 3, x: 102, y: 0, hp: 100, maxHp: 100, alive: true,
    cls: 'basic', ai: { state: 'wander', targetId: -1 } };
  const other = { id: 4, x: -200, y: 0, hp: 100, maxHp: 100, alive: true,
    cls: 'basic', ai: { state: 'hunt', __v1112TargetId: 2 } };
  const g = { tanks: [owner, a, b, other], w: 900, h: 700, cam: { zoom: 1 }, time: 1 };
  for (const target of [2, 3, 2]) {
    other.ai.__v1112TargetId = target;
    assert.equal(T.chooseTarget(g, classes, owner, owner.ai, g.time)?.id,
      naiveChoose(T, g, owner, g.time)?.id);
  }
});

test('dense visible target choice scans each AI assignment once, not per candidate', () => {
  const T = boot(), tanks = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1, x: i * 4, y: 0, hp: 100, maxHp: 100, alive: true,
    cls: 'basic', ai: { state: 'hunt', targetId: 2, __v1112TargetId: 2 }
  }));
  let reads = 0;
  const proxied = new Proxy(tanks, {
    get(target, key, receiver) {
      if (typeof key === 'string' && Number.isInteger(+key) && String(+key) === key) reads++;
      return Reflect.get(target, key, receiver);
    }
  });
  const g = { tanks: proxied, w: 1000, h: 700, cam: { zoom: 1 }, time: 1 };
  T.chooseTarget(g, classes, tanks[0], tanks[0].ai, 1);
  const optimizedReads = reads;
  reads = 0;
  naiveChoose(T, g, tanks[0], 1);
  const originalReads = reads;
  assert.ok(originalReads > optimizedReads * 10,
    'expected fewer candidate reads: ' + optimizedReads + ' versus ' + originalReads);
});
