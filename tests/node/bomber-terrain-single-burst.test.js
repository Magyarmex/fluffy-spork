'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the exact materialized core updater: it moves dead projectiles in
// its first pass and can expire a shell already burst by Battlefield terrain.
function realCoreUpdater() {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core updater missing');
  let end = start + marker.length, depth = 1;
  for (; end < html.length && depth; end++) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'unbalanced core method');
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
      { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
      { CLASSES: { scout: { size: 14 } } }, 2250);
}
const coreUpdate = realCoreUpdater();

function boot(performanceLayer) {
  function Game() {
    this.hash = { query(_x, _y, _r, out) { out.length = 0; } };
    this.tmp = [];
    this.cam = { shake: 0 };
  }
  for (const name of ['spawnPlayer', 'spawnShape', 'spawnPowerup', 'tryFire',
    'initBulletIntegrity', 'resolveBulletCollisions', 'addParticles', 'addFlash',
    'splashAt', 'updateDrones', 'update']) Game.prototype[name] = function () {};
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.moveTank = function (t, vx, vy, dt) { t.x += vx * dt; t.y += vy * dt; };
  Game.prototype.getTank = () => null;
  Game.prototype.updateBullets = coreUpdate;
  function Sfx() {}
  Sfx.prototype.resume = function () {};
  const modules = {
    'game/audio': m => { m.exports = { Sfx }; },
    'game/engine': m => { m.exports = { Game }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; },
  };
  const ctx = { window: { __novaModules: modules }, console, Math, Map, Date,
    performance: { now: () => 0 } };
  const files = ['battlefield-v1.6.0.js'];
  if (performanceLayer) files.push('performance-v1.7.5.js');
  for (const file of files) vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8'),
    ctx, { filename: file });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => {
    if (spec === './classes') return { CLASSES: { scout: { size: 14 } } };
    if (spec === './types') return { ARENA_HALF: 2250 };
    throw new Error('Unexpected dependency: ' + spec);
  });
  return module.exports.Game;
}

function fire(Game, opts = {}) {
  const g = new Game();
  g.time = 1;
  g.__novaBattlefield = { coverBroken: 0 };
  g.__novaTerrain = opts.terrain === false ? [] : [{
    id: -1, shape: 'rect', x: opts.wallX || 0, y: 0, w: 160, h: 160,
    solid: true, destructible: !!opts.destructible, hp: opts.destructible ? 5 : 0,
  }];
  let bursts = 0;
  g.clusterBurst = () => { bursts++; };
  g.weakenBullet = () => {};
  const b = { x: opts.x ?? -120, y: 0, vx: opts.vx ?? 6000, vy: 0,
    r: 2, dmg: 12, ttl: opts.ttl ?? 0.005, shell: opts.shell ?? true, ownerId: 1,
    pen: opts.pen ?? 0, hits: 0, dead: false };
  g.bullets = [b];
  g.updateBullets(1 / 60);
  return { bursts, b, g };
}

for (const optimized of [false, true]) {
  const label = optimized ? 'Battlefield + Performance' : 'Battlefield';
  test(label + ': terrain impact and same-tick TTL expiry burst once', () => {
    const { bursts, b, g } = fire(boot(optimized));
    assert.equal(bursts, 1, 'same shell burst at wall and again at TTL expiry');
    assert.equal(b.dead, true);
    assert.equal(g.bullets.length, 0);
  });
  test(label + ': terrain impact and arena boundary expiry burst once', () => {
    const { bursts, b } = fire(boot(optimized), { wallX: 2150, x: 2000,
      vx: 15000, ttl: 2 });
    assert.equal(bursts, 1, 'same shell burst at wall and arena exit');
    assert.equal(b.dead, true);
  });
  test(label + ': ordinary terrain shell burst remains intact', () => {
    const { bursts, b } = fire(boot(optimized), { ttl: 2 });
    assert.equal(bursts, 1);
    assert.equal(b.dead, true);
  });
  test(label + ': natural shell expiry without terrain still bursts', () => {
    const { bursts, b } = fire(boot(optimized), { terrain: false, ttl: 0.005 });
    assert.equal(bursts, 1);
    assert.equal(b.dead, true);
  });
  test(label + ': penetrating destructible cover retains shell until actual expiry', () => {
    const { bursts, b, g } = fire(boot(optimized), {
      destructible: true, pen: 3, ttl: 0.005,
    });
    assert.equal(g.__novaTerrain[0].solid, false);
    assert.equal(b.__novaBreachAtTime, g.time, 'surviving cover breach must be stamped');
    assert.equal(bursts, 1, 'penetrating shell must still burst at TTL');
    assert.equal(b.dead, true);
  });
}

/* Battlefield stops a projectile at cover before invoking the materialized
 * core updater. The core still advances dead projectiles in its first pass.
 * Without a boundary fix, an impact at x=-80.9 moves to x=19.1 before
 * spawning a possible trail, visibly leaking through solid cover. */
for (const optimized of [false, true]) {
  const label = optimized ? 'Battlefield + Performance' : 'Battlefield';
  for (const shell of [false, true]) {
    test(label + ': terrain-killed ' + (shell ? 'shell' : 'ordinary shot') +
      ' remains at its first physical contact after core update', () => {
      const { b, g } = fire(boot(optimized), { ttl: 2, shell });
      assert.equal(b.dead, true);
      assert.equal(g.bullets.length, 0);
      assert.ok(b.x > -82 && b.x < -80,
        'dead projectile must not advance beyond the wall; x=' + b.x);
      assert.equal(b.vx, 0, 'dead projectile must not retain forward velocity');
    });
  }
  test(label + ': shell that breaches cover retains forward velocity', () => {
    const { b, g } = fire(boot(optimized), {
      destructible: true, pen: 3, ttl: 2,
    });
    assert.equal(g.__novaTerrain[0].solid, false);
    assert.equal(b.dead, false);
    assert.equal(b.vx, 6000, 'legitimate cover penetration must keep velocity');
    assert.ok(b.x > -30 && b.x < -10, 'breaching shot must advance normally');
  });
}


/* Regression: an ordinary bullet must not damage terrain that it could only
 * reach AFTER its physical lifetime. Battlefield's pre-core terrain sweep
 * must honor remaining TTL independently of the core's full-frame movement.
 * This deliberately does not change the unresolved shell burst timing. */
function ordinaryTTLCase(Game,fps,wallX,ttl=.005){
  const g=new Game();
  g.time=1;g.__novaBattlefield={coverBroken:0};
  g.__novaTerrain=[{id:-99,shape:'rect',x:wallX,y:0,w:20,h:100,
    solid:true,destructible:true,hp:100,maxHp:100}];
  g.weakenBullet=()=>{};
  const b={id:42,x:0,y:0,vx:6000,vy:0,r:3,dmg:10,ttl,
    shell:false,ownerId:1,pen:0,hits:0,dead:false};
  g.bullets=[b];
  for(let frame=0;frame<4&&g.bullets.length;frame++)g.updateBullets(1/fps);
  return {hp:g.__novaTerrain[0].hp,bullet:b,game:g};
}
for(const optimized of [false,true]){
  const label=optimized?'Battlefield + Performance':'Battlefield';
  for(const fps of [30,60,120,240]){
    test(label+': ordinary bullet cannot damage cover beyond TTL at '+fps+'Hz',()=>{
      const {hp}=ordinaryTTLCase(boot(optimized),fps,100);
      assert.equal(hp,100,'wall contact at x≈88.65 occurs after expiry x=30');
    });
    test(label+': ordinary bullet still damages cover before TTL at '+fps+'Hz',()=>{
      const {hp}=ordinaryTTLCase(boot(optimized),fps,20);
      assert.equal(hp,90,'wall contact at x≈8.65 occurs before expiry x=30');
    });
  }
  test(label+': already expired ordinary bullet cannot damage overlapping cover',()=>{
    const {hp}=ordinaryTTLCase(boot(optimized),60,0,0);
    assert.equal(hp,100);
  });
}
