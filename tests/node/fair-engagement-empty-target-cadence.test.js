'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/fair-engagement-v1.11.2.js'), 'utf8');

function boot() {
  const modules = {
    'game/ai': module => {
      module.exports.updateAI = function(owner, g) {
        g.__legacyVisible = g.tanks.map(t => t.id);
      };
    },
    'game/engine': module => {
      class Game {}
      Game.prototype.updateDrones = function() {};
      module.exports.Game = Game;
    }
  };
  const window = { __novaModules: modules };
  vm.runInNewContext(source, {
    window, Math, Number, Object, Array,
    console: { info() {}, warn() {}, error() {} }
  }, { filename: 'fair-engagement-v1.11.2.js' });
  const classes = {
    CLASSES: { carrier: { droneLeash: 650 } },
    lineageForClass: () => 'gunner'
  };
  function load(id) {
    const m = { exports: {} };
    modules[id](m, m.exports, spec => {
      assert.equal(spec, './classes');
      return classes;
    });
    return m.exports;
  }
  return { ai: load('game/ai'), Game: load('game/engine').Game };
}

function tank(id, x, extra = {}) {
  return Object.assign({
    id, x, y: 0, hp: 100, maxHp: 100, alive: true,
    spawnShieldT: 0, cls: 'basic', tier: 1, isPlayer: false,
    ai: { state: 'wander', targetId: -1 }
  }, extra);
}

function world(tanks) {
  return {
    time: 1, w: 400, h: 300, cam: { zoom: 1 },
    tanks, player: null,
    getTank(id) { return this.tanks.find(t => t.id === id) || null; }
  };
}

function countedWorld(tanks) {
  let reads = 0;
  const counted = new Proxy(tanks, {
    get(target, key, receiver) {
      if (typeof key === 'string' && Number.isInteger(+key) && String(+key) === key) reads++;
      return Reflect.get(target, key, receiver);
    }
  });
  return { g: world(counted), reads: () => reads };
}

test('unobserved opponents are scanned at bounded think cadence, not 60 times per second', () => {
  const { ai } = boot();
  const owner = tank(1, 0), hidden = tank(2, 800);
  const { g, reads } = countedWorld([owner, hidden]);
  for (let i = 0; i < 60; i++) {
    g.time = 1 + i / 60;
    ai.updateAI(owner, g, 1 / 60);
    assert.equal(owner.ai.__v1112TargetId, -1);
  }
  assert.ok(reads() >= 8 && reads() <= 16,
    'one second should use about six full candidate scans, not sixty: ' + reads());
});

test('a newly visible opponent is acquired within the normal reaction interval', () => {
  const { ai } = boot();
  const owner = tank(1, 0), rival = tank(2, 800);
  const g = world([owner, rival]);
  ai.updateAI(owner, g, 1 / 60);
  assert.equal(owner.ai.__v1112TargetId, -1);
  rival.x = 100;
  g.time = 1.1;
  ai.updateAI(owner, g, 1 / 60);
  assert.equal(owner.ai.__v1112TargetId, -1,
    'no-target acquisition should obey the same finite think cadence');
  g.time = 1.2;
  ai.updateAI(owner, g, 1 / 60);
  assert.equal(owner.ai.__v1112TargetId, rival.id);
});

test('a newly shielded cached opponent is replaced immediately, even between think ticks', () => {
  const { ai } = boot();
  const owner = tank(1, 0), shielded = tank(2, 80, { spawnShieldT: 2 });
  const alternate = tank(3, 140);
  owner.ai.__v1112TargetId = shielded.id;
  owner.ai.__v1112NextThink = 5;
  const g = world([owner, shielded, alternate]);
  ai.updateAI(owner, g, 1 / 60);
  assert.equal(owner.ai.__v1112TargetId, alternate.id);
  assert.equal(owner.ai.targetId, alternate.id);
});

test('an occluded or dead cached target is dropped without waiting for cadence', () => {
  const { ai } = boot();
  const owner = tank(1, 0), hidden = tank(2, 800);
  owner.ai.__v1112TargetId = hidden.id;
  owner.ai.__v1112NextThink = 5;
  const g = world([owner, hidden]);
  ai.updateAI(owner, g, 1 / 60);
  assert.equal(owner.ai.__v1112TargetId, -1);
  assert.equal(owner.ai.targetId, -1);
  assert.deepEqual(Array.from(g.__legacyVisible), [owner.id]);
  assert.equal(g.tanks.length, 2, 'legacy AI visibility narrowing must be restored');
});

test('Controller no-target sync also avoids a second full search every frame', () => {
  const { Game } = boot();
  const owner = tank(1, 0, { cls: 'carrier' }), hidden = tank(2, 800);
  const { g, reads } = countedWorld([owner, hidden]);
  Object.setPrototypeOf(g, Game.prototype);
  for (let i = 0; i < 60; i++) {
    g.time = 1 + i / 60;
    g.updateDrones(1 / 60);
    assert.equal(owner.ai.__v1112TargetId, -1);
    assert.equal(owner.__novaLiveVectorAI.active, false);
  }
  assert.ok(reads() < 150,
    'Controller should perform its ordinary owner iteration plus bounded scans: ' + reads());
});

test('a restarted match clock cannot strand an empty AI target slot', () => {
  const { ai } = boot();
  const owner = tank(1, 0), rival = tank(2, 100);
  const g = world([owner, rival]);
  owner.ai.__v1112TargetId = -1;
  owner.ai.__v1112NextThink = 500;
  g.time = 1;
  ai.updateAI(owner, g, 1 / 60);
  assert.equal(owner.ai.__v1112TargetId, rival.id);
});

test('a non-finite AI think timestamp cannot permanently suppress acquisition', () => {
  const { ai } = boot();
  const owner = tank(1, 0), rival = tank(2, 100);
  const g = world([owner, rival]);
  owner.ai.__v1112TargetId = -1;
  owner.ai.__v1112NextThink = Number.NaN;
  ai.updateAI(owner, g, 1 / 60);
  assert.equal(owner.ai.__v1112TargetId, rival.id);
});
