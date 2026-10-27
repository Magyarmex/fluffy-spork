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


/* Regression-first proof: this exact materialized-core fixture failed before
 * the bounded whole-batch recovery, at 30/60/120Hz in both array orders.
 * The nonlethal disjoint cases must now remain green. */
const Game=boot(),OptimizedGame=boot(undefined,true);
function batchWorld(fps,{reverse=false,far=false,wall=false,mutate=null,optimized=false}={}){
 const g=new (optimized?OptimizedGame:Game)();
 g.tanks=[{kind:'tank',id:2,x:far?100:40,y:0,cls:'scout',hp:100,alive:true},
          {kind:'tank',id:3,x:far?100:40,y:400,cls:'scout',hp:100,alive:true}];
 // Real neutral ecology is dense; distant shapes must not suppress
 // two independent local first-contact proofs.
 g.shapes=Array.from({length:120},(_,i)=>({
  kind:'shape',id:100+i,x:1000+i*3,y:1000,r:12,hp:100,
  type:'circle',born:0
 }));
 if(wall)g.__novaTerrain=[{id:-1,shape:'rect',x:10,y:0,
  w:4,h:80,solid:true,destructible:false}];
 const local=[0,400].map((y,i)=>({
  kind:'bullet',id:1+i,ownerId:1,x:0,y,vx:6000,vy:0,
  r:3,dmg:20,ttl:.005,pen:0,hits:0,dead:false,shell:false,beam:false
 }));
 const remote=Array.from({length:500},(_,i)=>({
  kind:'bullet',id:500+i,ownerId:9,x:1100+i*2,y:1100,
  vx:0,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false
 }));
 g.bullets=[...local,...remote];
 if(mutate)mutate(g);
 if(reverse)g.bullets.reverse();
 g.updateBullets(1/fps);
 return g;
}
for(const fps of [30,60,120,240])for(const reverse of [false,true]){
 test('two disjoint ordinary TTL shots both hit at '+fps+'Hz reversed='+reverse,()=>{
  const g=batchWorld(fps,{reverse});
  assert.equal(g.hits,2,'each independently reachable hull must be hit before physical TTL; never first-N');
 });
 test('no phantom TTL hits past expiry at '+fps+'Hz reversed='+reverse,()=>{
  assert.equal(batchWorld(fps,{reverse,far:true}).hits,0);
 });
}
for(const fps of [30,60,120,240]){
 test('earlier cover vetoes only its own lane at '+fps+'Hz',()=>{
  const g=batchWorld(fps,{wall:true});
  assert.equal(g.hits,1,'cover must stop first lane without suppressing disjoint valid second lane');
 });
}

/* The preflight is deliberately all-or-nothing when target attribution
 * could depend on bullet order, a lethal callback, or unknown movement.
 * These controls must stay conservative until a full chronological solver. */
for(const fps of [30,60,120]){
 test('shared target never receives speculative batch damage at '+fps+'Hz',()=>{
  const g=batchWorld(fps,{mutate:g=>{g.bullets[1].y=0;}});
  assert.equal(g.hits,0,'two shots sharing a hull require chronological arbitration');
 });
 test('potentially lethal shared-frame batch defers at '+fps+'Hz',()=>{
  const g=batchWorld(fps,{mutate:g=>{g.tanks[0].hp=30;}});
  assert.equal(g.hits,0,'nonlethal proof must not pre-commit kill/reward side effects');
 });
 test('moving hull crossing both lanes vetoes batch at '+fps+'Hz',()=>{
  const g=batchWorld(fps,{mutate:g=>{
   g.tanks[0].__novaSweepMoveTime=g.time;
   g.tanks[0].__novaSweepPrevX=40;g.tanks[0].__novaSweepPrevY=400;
  }});
  assert.equal(g.hits,0,'shared swept hull cannot be assigned to both bullets');
 });
 test('earlier competing projectile vetoes only its own lane at '+fps+'Hz',()=>{
  const g=batchWorld(fps,{mutate:g=>g.bullets.push({
   kind:'bullet',id:9999,ownerId:3,x:10,y:0,vx:0,vy:0,
   r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false
  })});
  assert.equal(g.hits,1,'a credible interceptor must not erase independent second contact');
 });
 test('uncertified nearby drone prevents speculative batch contact at '+fps+'Hz',()=>{
  const g=batchWorld(fps,{mutate:g=>g.drones.push({
   kind:'drone',id:800,ownerId:4,x:12,y:0,r:8,hp:20
  })});
  assert.equal(g.hits,0,'unknown drone contact requires a stronger time witness');
 });
}

test('seeded independent two-lane TTL contacts agree with analytic geometry',()=>{
 let seed=20261027;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 let worlds=0,reachable=0;
 for(const fps of [30,60,120])for(const reverse of [false,true])
  for(let n=0;n<100;n++){
   const xs=[25+rand()*65,25+rand()*65];
   const g=batchWorld(fps,{reverse,mutate:g=>{
    g.tanks[0].x=xs[0];g.tanks[1].x=xs[1];
   }});
   const expected=xs.filter(x=>x-21<=6000*.005).length;
   reachable+=expected;worlds++;
   assert.equal(g.hits,expected,
    'nonlethal independent physical contacts must not depend on remote density, order or FPS: '+
    JSON.stringify({fps,reverse,xs,expected,actual:g.hits}));
  }
 assert.equal(worlds,600);
 assert.ok(reachable>100&&reachable<1000,'oracle must exercise hits and misses');
});

/* The optional performance overlay is loaded after Battlefield in shipping.
 * It must not erase the new bounded recovery or change first-event parity. */
for(const fps of [30,60,120,240])for(const reverse of [false,true]){
 test('optimized shipping overlay retains two independent TTL contacts at '+
  fps+'Hz reversed='+reverse,()=>{
  const g=batchWorld(fps,{reverse,optimized:true});
  assert.equal(g.hits,2);
 });
 test('optimized shipping overlay retains no-hit TTL bound at '+
  fps+'Hz reversed='+reverse,()=>{
  assert.equal(batchWorld(fps,{reverse,far:true,optimized:true}).hits,0);
 });
}

for(const fps of [30,60,120]){
 test('lateral competing projectile cannot steal first-lane attribution at '+fps+'Hz',()=>{
  const g=batchWorld(fps,{mutate:g=>{
   g.contacts=[];
   g.damageTank=function(t,dmg,ownerId){
    this.hits++;this.contacts.push({target:t.id,owner:ownerId});
   };
   g.bullets.push({
    kind:'bullet',id:10001,ownerId:3,x:40,y:19,vx:0,vy:0,
    r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false
   });
  }});
  /* The lateral bullet itself legitimately starts INSIDE tank 2 and can
   * damage it through the core. Count attribution, not total damage events:
   * our expiring first-lane shot must abstain while lane 2 still hits. */
  assert.deepEqual(g.contacts.filter(c=>c.owner===1).map(c=>c.target),[3],
   'only the independent second lane may claim a recovered contact');
  assert.ok(g.contacts.some(c=>c.owner===3&&c.target===2),
   'the real lateral bullet retains its own legitimate hit');
 });
}
