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

function simulate(Game, fps, x, velocity, ttl, pen = 0) {
  const g = new Game();
  g.tanks = [{ kind: 'tank', id: 2, x, y: 0,
    cls: 'scout', hp: 100, alive: true }];
  g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1, x: 0, y: 0,
    vx: velocity, vy: 0, r: 3, dmg: 20, ttl, pen,
    hits: 0, dead: false, shell: false, beam: false }];
  for (let i = 0; i < 20 && g.bullets.length; i++) {
    g.updateBullets(1 / fps);
    g.time += 1 / fps;
  }
  return g.hits;
}


/* Run 371: narrow chronological penetrating-body acceptance.
 * This is the materialized shipping core plus Battlefield/Performance wrappers.
 * A penetrating shot must hit each distinct stationary hull reached before
 * expiration, regardless of frame partition, including death-slow simulation.
 * These assertions deliberately begin red against canonical main. */
function makeWorld(Game, secondX=65, reverse=false) {
 const g=new Game();
 const a={kind:'tank',id:2,x:40,y:0,cls:'scout',hp:100,alive:true,hitCount:0};
 const b={kind:'tank',id:3,x:secondX,y:0,cls:'scout',hp:100,alive:true,hitCount:0};
 g.tanks=reverse?[b,a]:[a,b];
 g.damageTank=function(t){t.hitCount++;this.hits++;};
 g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,vx:6000,vy:0,
  r:3,dmg:20,ttl:.01,pen:1,hits:0,dead:false,shell:false,beam:false}];
 return {g,a,b};
}
for(const optimized of [false,true]) {
 const mode=optimized?'Battlefield + Performance':'Battlefield';
 const Game=boot(undefined,optimized);
 for(const fps of [30,60,120,240]) {
  test(mode+' penetrating stationary pair preserves two victims at '+fps+'Hz in death-slow',()=>{
   const {g,a,b}=makeWorld(Game);
   const dt=.35/fps;
   for(let frame=0;frame<30&&g.bullets.length;frame++){g.time+=dt;g.updateBullets(dt);}
   assert.equal(a.hitCount,1,'first hull must be hit exactly once');
   assert.equal(b.hitCount,1,'second hull physically reached before TTL must be hit');
   assert.equal(g.hits,2);
  });
 }
 test(mode+' reversing hash target order does not change 30Hz victim identities',()=>{
  const {g,a,b}=makeWorld(Game,65,true);
  const dt=.35/30;g.time+=dt;g.updateBullets(dt);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
 });
 test(mode+' second hull beyond physical TTL is never hit',()=>{
  const {g,a,b}=makeWorld(Game,100);
  const dt=.35/30;g.time+=dt;g.updateBullets(dt);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,0);
 });
 test(mode+' earlier permanent wall still blocks both victims',()=>{
  const {g,a,b}=makeWorld(Game);
  g.__novaTerrain=[{id:-1,shape:'rect',x:10,y:0,w:4,h:80,
   solid:true,destructible:false}];
  const dt=.35/30;g.time+=dt;g.updateBullets(dt);
  assert.equal(a.hitCount,0);
  assert.equal(b.hitCount,0);
 });
 test(mode+' hostile projectile in the collision corridor prevents speculative penetration',()=>{
  const {g,a,b}=makeWorld(Game);
  g.bullets.push({kind:'bullet',id:5,ownerId:9,x:30,y:0,vx:0,vy:0,
   r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,shell:false,beam:false});
  const dt=.35/30;g.time+=dt;g.updateBullets(dt);
  assert.equal(b.hitCount,0,'interception must not be bypassed');
 });
}

/* Adversarial proof gates: geometry, witness ownership, and adjacent systems. */
for(const optimized of [false,true]) {
 const mode=optimized?'optimized':'baseline',Game=boot(undefined,optimized);
 test(mode+' 240 seeded stationary pairs preserve victim identities at 30Hz',()=>{
  let seed=3712026;
  const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<240;i++){
   const firstX=28+rnd()*16,secondX=firstX+24+rnd()*11;
   const {g,a,b}=makeWorld(Game,secondX,i%2===0);
   a.x=firstX;
   const dt=.35/30;g.time+=dt;g.updateBullets(dt);
   assert.equal(a.hitCount,1,'first victim '+i);
   assert.equal(b.hitCount,1,'second victim '+i);
  }
 });
 test(mode+' active movement epoch without tank witness cannot backdate penetration',()=>{
  const {g,a,b}=makeWorld(Game);
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=17;
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' observed moving target does not receive a speculative stationary hit',()=>{
  const {g,a,b}=makeWorld(Game);
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=17;
  g.time+=.35/30;
  for(const t of g.tanks){
   t.__novaSweepMoveTime=g.time;
   t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
  }
  b.__novaSweepPrevY=18;
  g.updateBullets(.35/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' real Game.update movement witness enables stationary piercing pair',()=>{
  const FullGame=boot(function(dt){
   this.time+=dt;
   for(const t of this.tanks){
    t.__novaSweepMoveTime=this.time;
    t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
   }
   this.updateBullets(dt);
  },optimized);
  const {g,a,b}=makeWorld(FullGame);
  g.update(.35/30);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
  assert.equal(g.__novaShapeSweepActive,false);
 });
 test(mode+' a wall between the victims never authorizes a second hit',()=>{
  const {g,b}=makeWorld(Game);
  g.__novaTerrain=[{id:-1,shape:'rect',x:40,y:0,w:3,h:90,
   solid:true,destructible:false}];
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' spawn-shielded second tank cannot be damaged by shortcut',()=>{
  const {g,b}=makeWorld(Game);b.spawnShieldT=2;
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(b.hitCount,0);
 });
}

for(const optimized of [false,true]) {
 test((optimized?'optimized':'baseline')+
  ' uncertain nearby neutral movement cannot be bypassed by piercing shortcut',()=>{
  const Game=boot(undefined,optimized),{g,b}=makeWorld(Game);
  /* At 38u lateral distance the shape is not currently overlapping the
   * projectile, but a normal within-frame displacement can enter its path.
   * The old unpadded endpoint-only exclusion would have backdated two hits. */
  g.shapes=[{kind:'shape',id:8,x:38,y:38,r:12,hp:100}];
  const dt=.35/30;g.time+=dt;g.updateBullets(dt);
  assert.equal(b.hitCount,0);
 });
}

for(const optimized of [false,true]) {
 test((optimized?'optimized':'baseline')+
  ' same-tick cover breach cannot use stationary piercing shortcut',()=>{
  const Game=boot(undefined,optimized),{g,b}=makeWorld(Game);
  g.bullets[0].__novaBreachAtTime=g.time;
  const dt=.35/30;g.time+=dt;
  g.bullets[0].__novaBreachAtTime=g.time;
  g.updateBullets(dt);
  assert.equal(b.hitCount,0,'prior cover breach requires full chronological arbitration');
 });
}

/* Canonical Minigun: 480u/s, pen=1, TTL=.8, emitted damage=7.084,
 * radius=3.8*(1+damage*.0085). Two stationary hulls near the lifetime
 * boundary should both receive direct damage, not depend on FPS. */
for(const optimized of [false,true])for(const fps of [30,60,120,240]){
 test((optimized?'optimized':'baseline')+
  ' full-lifetime Minigun penetrates two healthy hulls at '+fps+'Hz',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game,395);
  a.x=370;
  const shot=g.bullets[0];shot.vx=480;shot.ttl=.8;
  shot.r=3.8*(1+7.084*.0085);shot.dmg=7.084;
  for(let frame=0;frame<300&&g.bullets.length;frame++){
   const dt=1/fps;g.time+=dt;g.updateBullets(dt);
  }
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1,'second physical contact occurs before .8s expiry');
 });
}
