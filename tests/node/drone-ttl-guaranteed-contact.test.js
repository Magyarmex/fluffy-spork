'use strict';
// Bounded physical-first-contact regression for ordinary projectiles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function shippingCoreBullets() {
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core bullet updater missing');
  let end = start + marker.length, depth = 1;
  while (depth && end < html.length) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0);
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
    { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
    { CLASSES: { scout: { size: 15 } } }, 2250);
}

function boot(updateImpl, optimized = false) {
  class Game {
    constructor() {
      this.time = 1;
      this.bullets = []; this.tmp = []; this.__novaTerrain = [];
      this.tanks = []; this.shapes = []; this.drones = [];
      this.cam = { shake: 0 }; this.sfx = {};
      this.player = { id: 999, x: 1000, y: 1000, alive: true };
      this.hits = 0;
      this.hash = { query: (_x, _y, _r, out) => {
        out.length = 0;
        out.push(...this.tanks, ...this.shapes, ...this.drones);
      } };
    }
  }
  for (const method of ['spawnPlayer', 'spawnShape', 'spawnPowerup',
    'tryFire', 'updateDrones', 'update', 'moveTank', 'addParticles',
    'splashAt', 'initBulletIntegrity', 'addRing', 'addFlash',
    'addImpactDebris', 'damageShape', 'damageDrone', 'weakenBullet',
    'clusterBurst']) Game.prototype[method] = function() {};
  if (typeof updateImpl === 'function') Game.prototype.update = updateImpl;
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.getTank = () => null;
  Game.prototype.resolveBulletCollisions = function() {};
  Game.prototype.damageTank = function() { this.hits++; };
  Game.prototype.damageShape = function() { this.hits++; };
  Game.prototype.damageDrone = function() { this.hits++; };
  Game.prototype.updateBullets = shippingCoreBullets();
  class Sfx { resume() {} }
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; }
  };
  const context = { window: { __novaModules: modules },
    console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Date, performance: { now: () => 0 } };
  const layers = ['battlefield-v1.6.0.js'];
  if (optimized) layers.push('performance-v1.7.5.js');
  for (const file of layers) vm.runInNewContext(fs.readFileSync(path.join(root,
    'nova-updates', file), 'utf8'), context, { filename: file });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => spec === './classes'
    ? { CLASSES: { scout: { size: 15 } } }
    : { ARENA_HALF: 2250 });
  return module.exports.Game;
}


/* Run 382: a witnessed, bounded-speed drone may be guaranteed to intersect a
 * fast projectile before TTL even when the drone's exact subframe route is
 * unknown. The proof uses the START position plus a conservative movement
 * envelope, never a guessed linear interpolation between endpoints.
 * Every case runs the real Battlefield Game.update wrapper. */
function droneWorld(hz, optimized, options={}) {
  const FullGame=boot(function(dt){
    this.time+=dt;
    if(options.move!==false) this.drones[0].y+=2;
    this.updateBullets(dt);
  },optimized);
  const g=new FullGame();
  g.tanks=[];g.shapes=[];g.hitOwners=[];
  g.damageDrone=function(_d,_damage,ownerId){this.hits++;this.hitOwners.push(ownerId);};
  g.drones=[{kind:'drone',id:7,ownerId:options.owned?1:2,
    x:options.x===undefined?22:options.x,y:0,r:8,hp:20,
    speed:options.speed===undefined?200:options.speed,
    __novaPhase:options.phase||'form',__novaVX:options.residual||0}];
  g.__novaTerrain=options.terrain||[];
  g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,
    vx:options.vx===undefined?6000:options.vx,vy:0,
    r:3,dmg:20,ttl:options.ttl===undefined?.004:options.ttl,
    pen:0,hits:0,dead:false,shell:false,beam:false}];
  if(options.otherBullets)g.bullets.push(...options.otherBullets);
  g.update(1/hz);
  return g;
}
for(const optimized of [false,true])for(const hz of [30,60,120,240]){
 const label=(optimized?'optimized':'baseline')+' '+hz+'Hz';
 test('guaranteed drone contact before TTL in real update '+label,()=>{
  const g=droneWorld(hz,optimized);
  assert.equal(g.hits,1,'start-position speed envelope proves pre-expiry overlap');
 });
 test('earlier permanent cover still vetoes drone TTL contact '+label,()=>{
  const g=droneWorld(hz,optimized,{terrain:[{id:-1,shape:'rect',
    x:6,y:0,w:2,h:70,solid:true,destructible:false}]});
  assert.equal(g.hits,0);
 });
 test('owned drone remains transparent '+label,()=>{
  const g=droneWorld(hz,optimized,{owned:true});
  assert.equal(g.hits,0);
 });
 test('unreachable drone beyond TTL is not hit '+label,()=>{
  const g=droneWorld(hz,optimized,{x:100});
  assert.equal(g.hits,0);
 });
 test('uncertain slow projectile does not invent drone contact '+label,()=>{
  const g=droneWorld(hz,optimized,{x:13,vx:500});
  assert.equal(g.hits,0);
 });
 test('committed dash cannot be inferred from endpoint envelope '+label,()=>{
  const g=droneWorld(hz,optimized,{phase:'dash'});
  assert.equal(g.hits,0);
 });
 test('unbounded residual drone velocity cannot authorize backdated hit '+label,()=>{
  const g=droneWorld(hz,optimized,{residual:20000});
  assert.equal(g.hits,0);
 });
 test('earlier projectile contact on same drone blocks guessed kill credit '+label,()=>{
  const g=droneWorld(hz,optimized,{otherBullets:[{kind:'bullet',id:99,
   ownerId:3,x:22,y:0,vx:0,vy:0,r:3,dmg:20,ttl:1,pen:0,
   hits:0,dead:false,shell:false,beam:false}]});
  assert.ok(!g.hitOwners.includes(1),'first event belongs to competing shot');
 });

}
