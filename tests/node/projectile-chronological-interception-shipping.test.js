'use strict';
// Production acceptance for bounded chronological ordinary projectile ordering.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { firstContact } = require('../research/projectile-first-event-certificate.cjs');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const marker = '    updateBullets(dt) {';
const start = html.indexOf(marker);
assert.ok(start >= 0, 'shipping bullet updater missing');
let end = start + marker.length, depth = 1;
while (depth && end < html.length) {
  if (html[end] === '{') depth++;
  else if (html[end] === '}') depth--;
  end++;
}
assert.equal(depth, 0, 'shipping updater must be extractable');
const update = new Function('types_1', 'classes_1', 'M',
  'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
  { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
  { CLASSES: { scout: { size: 15 } } }, 2250);

function boot() {
  class Game {
    constructor() {
      this.bullets = []; this.time = 1;
      this.__novaTerrain = []; this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
      this.tmp = []; this.tanks = []; this.drones = []; this.shapes = [];
      this.cam = { shake: 0 }; this.tankById = new Map();
    }
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup',
    'tryFire', 'updateDrones', 'update', 'moveTank', 'damageTank',
    'damageDrone', 'damageShape', 'setClass', 'addParticles', 'addRing',
    'addImpactDebris', 'splashAt', 'initBulletIntegrity', 'useAbility',
    'addFlash']) Game.prototype[name] = function() {};
  Game.prototype.resolveBulletCollisions = function() {};
  Game.prototype.updateBullets = update;
  Game.prototype.weakenBullet = function(b, damage) {
    b.hp -= damage;
    if (b.hp <= 0) b.dead = true;
  };
  Game.prototype.clusterBurst = function() {};
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  class Sfx { resume() {} }
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/render': m => { m.exports = { render() {} }; },
    'game/ai': m => { m.exports = { updateAI() {} }; }
  };
  const context = { window: { __novaModules: modules },
    console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Date, Number, Object,
    performance: { now: () => 0 }, document: {}, navigator: {} };
  for (const file of ['sniper-v1.2.0.js', 'polish-v1.3.1.js',
    'battlefield-v1.6.0.js', 'apex-disciplines-v1.7.1.js',
    'performance-v1.7.5.js', 'performance-v1.7.8.js',
    'precision-contact-v1.8.3.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  }
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, spec => spec.includes('classes')
    ? { CLASSES: { scout: { size: 15 } }, lineageForClass: () => null }
    : { ARENA_HALF: 2250 });
  return new m.exports.Game();
}
function shot(id, ownerId, x, vx, ttl = .005) {
  return { id, kind: 'bullet', ownerId, x, y: 0, vx, vy: 0,
    r: 3, hp: id === 1 ? 1 : 3, maxHp: id === 1 ? 1 : 3,
    ttl, dmg: 8, pen: 0, hits: 0, shell: false, beam: false, dead: false };
}
const clear = Object.freeze({ allied: false, complete: true, unscanned: false,
  aTerrain: null, bTerrain: null, aBody: null, bBody: null,
  aOtherProjectile: null, bOtherProjectile: null });


for (const fps of [30, 60, 120, 240]) {
test('three ordinary projectiles resolve earliest contact independently of storage order at ' + fps + 'Hz', () => {
  function run(reverse) {
    const g = boot(), a = shot(1, 1, -20, 6000, 1);
    const b = shot(2, 2, 0, 0, 1);
    const c = shot(3, 3, 25, -6000, 1);
    a.hp = a.maxHp = 3;
    b.hp = b.maxHp = 2;
    c.hp = c.maxHp = 1;
    g.bullets = reverse ? [c, b, a] : [a, b, c];
    const weakened = [], original = g.weakenBullet.bind(g);
    g.weakenBullet = function (bullet, damage) {
      weakened.push(bullet.id);
      return original(bullet, damage);
    };
    g.updateBullets(1 / fps);
    return { a: [a.hp, a.dead], b: [b.hp, b.dead], c: [c.hp, c.dead], weakened };
  }
  const forward = run(false), reverse = run(true);
  assert.deepEqual(forward.a, reverse.a);
  assert.deepEqual(forward.b, reverse.b);
  assert.deepEqual(forward.c, reverse.c);
  assert.equal(forward.a[1], true, 'A-B then A-C should destroy A');
  assert.equal(forward.b[1], true, 'A-B should destroy B');
  assert.equal(forward.c[1], true, 'A-C should destroy C');
});
}

test('two ordinary shots retain the established interception path', () => {
  const g = boot(), a = shot(1, 1, -20, 6000, 1);
  const b = shot(2, 2, 20, -6000, 1);
  g.bullets = [a, b];
  const weakened = [], original = g.weakenBullet.bind(g);
  g.weakenBullet = function (bullet, damage) {
    weakened.push(bullet.id);
    return original(bullet, damage);
  };
  g.updateBullets(1 / 240);
  assert.deepEqual(weakened.sort(), [1, 2]);
});

test('shells preserve the existing legacy resolver path', () => {
  const g = boot(), a = shot(1, 1, -20, 6000, 1);
  const b = shot(2, 2, 20, -6000, 1);
  const c = shot(3, 3, 300, 0, 1);
  c.shell = true;
  g.bullets = [a, b, c];
  const weakened = [], original = g.weakenBullet.bind(g);
  g.weakenBullet = function (bullet, damage) {
    weakened.push(bullet.id);
    return original(bullet, damage);
  };
  g.updateBullets(1 / 240);
  assert.deepEqual(weakened.sort(), [1, 2]);
});

test('bounded ordinary volley agrees with independent chronological event oracle', () => {
  let seed = 0x7412026;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const dt = 1 / 120;
  const g = boot();
  let checked = 0;
  function first(a, b) {
    const rr = a.r + b.r + 1.5;
    const px = a.px - b.px, py = a.py - b.py;
    const vx = (a.x - a.px) - (b.x - b.px);
    const vy = (a.y - a.py) - (b.y - b.py);
    const c = px * px + py * py - rr * rr;
    if (c <= 0) return 0;
    const aa = vx * vx + vy * vy;
    if (aa < 1e-12) return null;
    const bb = 2 * (px * vx + py * vy);
    const d = bb * bb - 4 * aa * c;
    if (d < 0) return null;
    const t = (-bb - Math.sqrt(d)) / (2 * aa);
    return t >= 0 && t <= 1 ? t : null;
  }
  for (let world = 0; world < 500; world++) {
    const shots = [0, 1, 2, 3].map(i => {
      const x = (i - 1.5) * 20 + (random() - .5) * 10;
      const y = (random() - .5) * 12;
      const vx = (1.5 - i) * 3500 + (random() - .5) * 2000;
      const vy = (random() - .5) * 2000;
      const b = shot(i + 1, i + 1, x, vx, 1);
      b.y = y; b.vy = vy; b.px = x; b.py = y;
      b.x += vx * dt; b.y += vy * dt;
      b.hp = b.maxHp = 1 + Math.floor(random() * 4);
      return b;
    });
    const expected = shots.map(b => ({ hp: b.hp, dead: false }));
    const events = [];
    for (let i = 0; i < shots.length; i++)
      for (let j = i + 1; j < shots.length; j++) {
        const time = first(shots[i], shots[j]);
        if (time !== null) events.push({ i, j, time });
      }
    events.sort((a, b) => a.time - b.time);
    if (events.some((e, i) => i > 0 && Math.abs(e.time - events[i-1].time) <= 1e-9))
      continue;
    for (const e of events) {
      const a = expected[e.i], b = expected[e.j];
      if (a.dead || b.dead) continue;
      const ah = a.hp, bh = b.hp;
      a.hp -= bh; b.hp -= ah;
      a.dead = a.hp <= 0; b.dead = b.hp <= 0;
    }
    g.bullets = shots;
    g.resolveBulletCollisions();
    for (let i = 0; i < shots.length; i++) {
      assert.equal(shots[i].hp, expected[i].hp, 'integrity mismatch world ' + world + ', projectile ' + i);
      assert.equal(shots[i].dead, expected[i].dead, 'survival mismatch world ' + world + ', projectile ' + i);
    }
    checked++;
  }
  assert.ok(checked >= 450);
});

test('allied earlier geometric contacts cannot steal later hostile interceptions', () => {
  function run(reverse) {
    const g = boot();
    const a = shot(1, 1, -20, 6000, 1);
    const b = shot(2, 2, 0, 0, 1);
    const c = shot(3, 3, 25, -6000, 1);
    a.hp = a.maxHp = 3;
    b.hp = b.maxHp = 2;
    c.hp = c.maxHp = 1;
    g.tankById = new Map([
      [1, { id: 1, team: 'blue' }],
      [2, { id: 2, team: 'blue' }],
      [3, { id: 3, team: 'red' }]
    ]);
    g.areAllies = (x, y) => x.team === y.team;
    g.bullets = reverse ? [c, b, a] : [a, b, c];
    g.updateBullets(1 / 240);
    return [a.hp, b.hp, c.hp, !!a.dead, !!b.dead, !!c.dead];
  }
  const forward = run(false), reversed = run(true);
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward, [3, 1, -1, false, false, true]);
});

test('simultaneous allied crossing cannot suppress an earlier hostile contact', () => {
  const g = boot();
  const points = [
    [3, 31.616202648729086, -16.679326933808625, -1.4414978679269552, -62.02501654624939, 2],
    [5, 34.144912799820304, -15.415081824176013, 68.67832350544631, 33.64649759605527, 5],
    [4, 30.172903882339597, -23.558451398275793, 22.465986153110862, -57.18489857390523, 1],
    [2, 34.26265250891447, -34.72580185625702, -7.465336425229907, 8.100388757884502, 2]
  ];
  g.bullets = points.map(([ownerId, px, py, x, y, hp], i) => ({
    id: i + 1, kind: 'bullet', ownerId, px, py, x, y,
    vx: 0, vy: 0, r: 3, hp, maxHp: hp, ttl: 1, pen: 0,
    dead: false, shell: false, beam: false
  }));
  g.tankById = new Map([2, 3, 4, 5].map(id => [id, { id, team: id % 2 }]));
  g.areAllies = (a, b) => a.team === b.team;
  g.resolveBulletCollisions();
  assert.deepEqual(g.bullets.map(b => [b.hp, !!b.dead]),
    [[-1, true], [5, false], [-1, true], [1, false]]);
});


function ttlWitness(g) {
  g.__novaShapeSweepEpoch = 1;
  g.__novaFrameStartBulletEpoch = 1;
  g.__novaFrameStartBulletIdCeiling = 4;
}
/* Issue #147: an ordinary pair must meet before both physical TTLs even
 * when the core would discard both at the end of a low-refresh frame.
 * This narrow first release requires a complete, isolated two-shot proof. */
for (const fps of [30, 60, 120, 240]) {
  test('isolated mutually fatal projectile interception precedes TTL at ' + fps + 'Hz', () => {
    for (const reverse of [false, true]) {
      const g = boot(), a = shot(1, 1, -20, 6000, .005);\n      ttlWitness(g);
      const b = shot(2, 2, 20, -6000, .005);
      a.hp = a.maxHp = b.hp = b.maxHp = 1;
      ttlWitness(g);\n    g.tankById.set(1, {id:1, team:1});
      g.tankById.set(2, {id:2, team:2});
      g.bullets = reverse ? [b, a] : [a, b];
      const hits=[], original = g.weakenBullet.bind(g);
      g.weakenBullet = function (s, damage) {
        hits.push(s.id);
        return original(s, damage);
      };
      g.updateBullets(1 / fps);
      assert.deepEqual(hits.sort(), [1,2], 'interception must occur before expiry');
      assert.equal(a.dead, true);
      assert.equal(b.dead, true);
    }
  });
}
test('mutual TTL preflight abstains on allied, unknown and competing contexts', () => {
  function run(setup) {
    const g = boot(), a = shot(1, 1, -20, 6000, .005),
      b = shot(2, 2, 20, -6000, .005);
    a.hp = a.maxHp = b.hp = b.maxHp = 1;
    ttlWitness(g);\n    g.tankById.set(1, {id:1, team:1});
    g.tankById.set(2, {id:2, team:2});
    g.bullets = [a,b];
    const hits=[], original=g.weakenBullet.bind(g);
    g.weakenBullet = function(s,damage) {hits.push(s.id);return original(s,damage);};
    setup(g,a,b);
    g.updateBullets(1/30);
    return hits;
  }
  assert.deepEqual(run(g=>g.tankById.get(2).team=1), [],
    'allied projectiles never intercept');
  assert.deepEqual(run(g=>g.tankById.delete(2)), [],
    'unknown ownership cannot prove hostility');
  assert.deepEqual(run(g=>g.bullets.push(shot(3,3,400,0,.005))), [],
    'unscanned third projectile must veto');
  assert.deepEqual(run(g=>{
    g.__novaTerrain=[{shape:'rect',x:-12,y:0,w:3,h:50,
      solid:true,destructible:false}];
  }), [], 'earlier permanent wall must veto');
  assert.deepEqual(run(g=>{
    g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=2;
    g.shapes=[{kind:'shape',x:-12,y:0,r:10,hp:100,
      __novaShapeSweepEpoch:2,__novaShapeSweepPrevX:-12,
      __novaShapeSweepPrevY:0}];
  }), [], 'earlier body must veto');
  assert.deepEqual(run(g=>{
    g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=2;
    g.shapes=[{kind:'shape',x:700,y:700,r:10,hp:100,
      __novaShapeSweepEpoch:2,__novaShapeSweepPrevX:700,
      __novaShapeSweepPrevY:700}];
  }), [1,2], 'remote witnessed neutral must not veto');
});


test('mutual TTL recovery respects both lifetime and integrity budgets', () => {
  function run(ttlA,ttlB,hpA,hpB,wall) {
    const g=boot(),a=shot(1,1,-20,6000,ttlA),b=shot(2,2,20,-6000,ttlB);
    a.hp=a.maxHp=hpA;b.hp=b.maxHp=hpB;
    ttlWitness(g);\n    ttlWitness(g);\n  g.tankById.set(1,{id:1,team:1});
    g.tankById.set(2,{id:2,team:2});
    g.bullets=[a,b];
    if(wall)g.__novaTerrain=[wall];
    const hits=[],original=g.weakenBullet.bind(g);
    g.weakenBullet=function(s,damage){hits.push(s.id);return original(s,damage);};
    g.updateBullets(1/30);
    return hits;
  }
  assert.deepEqual(run(.001,.005,1,1),[],
    'contact beyond A lifetime is not a collision');
  assert.deepEqual(run(.005,.001,1,1),[],
    'contact beyond B lifetime is not a collision');
  assert.deepEqual(run(.005,.005,2,1),[],
    'nonmutual integrity requires the full chronological event owner');
  assert.deepEqual(run(.005,.005,1,1,
    {shape:'rect',x:40,y:0,w:3,h:50,solid:true,destructible:false}),
    [1,2], 'wall beyond first contact must not erase interception');
});
test('mutual TTL preflight refuses separately referenced player at contact',()=>{
  const g=boot(),a=shot(1,1,-20,6000,.005),b=shot(2,2,20,-6000,.005);
  a.hp=a.maxHp=b.hp=b.maxHp=1;
  ttlWitness(g);\n  g.tankById.set(1,{id:1,team:1});
  g.tankById.set(2,{id:2,team:2});
  g.bullets=[a,b];
  g.player={id:3,cls:'scout',alive:true,x:0,y:0,
    __novaSweepMoveTime:g.time,__novaSweepPrevX:0,__novaSweepPrevY:0};
  const hits=[],original=g.weakenBullet.bind(g);
  g.weakenBullet=function(s,damage){hits.push(s.id);return original(s,damage);};
  g.updateBullets(1/30);
  assert.deepEqual(hits,[]);
});
