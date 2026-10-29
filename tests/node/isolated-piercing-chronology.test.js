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

/* Run 372: the previous TTL-only chain cannot fix a penetrating projectile
 * that reaches two distinct hulls inside one frame while its TTL remains
 * positive. Exercise the actual materialized core plus Battlefield wrappers.
 * No extra projectile lifetime, damage, or penetration is authorized. */
for(const optimized of [false,true]) {
 const mode=optimized?'Battlefield + Performance':'Battlefield';
 const Game=boot(undefined,optimized);
 for(const fps of [30,60,120,240]) {
  test(mode+' non-expiring piercing pair is FPS-invariant at '+fps+'Hz',()=>{
   const {g,a,b}=makeWorld(Game);
   g.bullets[0].ttl=.2;
   for(let frame=0;frame<30&&g.bullets.length;frame++){
    const dt=1/fps;g.time+=dt;g.updateBullets(dt);
   }
   assert.equal(a.hitCount,1,'first hull must be hit exactly once');
   assert.equal(b.hitCount,1,'second physical contact must survive frame partition');
   assert.equal(g.hits,2);
  });
 }
 test(mode+' non-expiring piercing refuses missing movement witness',()=>{
  const {g,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=372;
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0,'cannot backdate without authoritative tank motion');
 });
 test(mode+' non-expiring piercing respects intervening permanent wall',()=>{
  const {g,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;
  g.__novaTerrain=[{id:-372,shape:'rect',x:48,y:0,w:3,h:90,
   solid:true,destructible:false}];
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' non-expiring piercing respects spawn shield on later hull',()=>{
  const {g,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;b.spawnShieldT=2;
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' non-expiring piercing refuses hostile projectile interception',()=>{
  const {g,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;
  g.bullets.push({kind:'bullet',id:372,ownerId:9,x:30,y:0,vx:0,vy:0,
   r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,shell:false,beam:false});
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' non-expiring piercing refuses uncertain neutral corridor',()=>{
  const {g,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;
  g.shapes=[{kind:'shape',id:372,x:38,y:38,r:12,hp:100}];
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
}

/* Adversarial 372: high-speed two-body chronology must not depend on hash
 * ordering or a lucky frame boundary. Exercise 480 deterministic layouts
 * against both shipping module compositions. */
for(const optimized of [false,true]) {
 const Game=boot(undefined,optimized);
 test((optimized?'optimized':'baseline')+
  ' 240 randomized non-expiring pairs preserve both victims at 30Hz',()=>{
  let seed=3722026;
  const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<240;i++){
   const firstX=28+rnd()*16,secondX=firstX+24+rnd()*11;
   const {g,a,b}=makeWorld(Game,secondX,i%2===0);
   a.x=firstX;g.bullets[0].ttl=.2;
   g.time+=1/30;g.updateBullets(1/30);
   assert.equal(a.hitCount,1,'first victim '+i);
   assert.equal(b.hitCount,1,'second victim '+i);
   assert.equal(g.hits,2,'no duplicate hits '+i);
  }
 });
 test((optimized?'optimized':'baseline')+
  ' non-expiring shortcut cannot reach a second hull beyond this frame',()=>{
  const {g,a,b}=makeWorld(Game,300);
  g.bullets[0].ttl=.2;
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,0,'later physical contact belongs to later frame');
 });
 test((optimized?'optimized':'baseline')+
  ' same-tick cover breach vetoes non-expiring shortcut',()=>{
  const {g,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;
  const dt=1/30;g.time+=dt;
  g.bullets[0].__novaBreachAtTime=g.time;
  g.updateBullets(dt);
  assert.equal(b.hitCount,0,'no speculative replay after cover breach');
 });
 test((optimized?'optimized':'baseline')+
  ' moving tank witness vetoes non-expiring shortcut',()=>{
  const {g,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=372;
  g.time+=1/30;
  for(const t of g.tanks){
   t.__novaSweepMoveTime=g.time;
   t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
  }
  b.__novaSweepPrevY=18;
  g.updateBullets(1/30);
  assert.equal(b.hitCount,0,'moving hull must use full chronology');
 });
}

for(const optimized of [false,true]) {
 const mode=optimized?'optimized':'baseline';
 test(mode+' non-expiring pair works through real Game.update movement epoch',()=>{
  const Game=boot(function(dt){
   this.time+=dt;
   for(const t of this.tanks){
    t.__novaSweepMoveTime=this.time;
    t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
   }
   this.updateBullets(dt);
  },optimized);
  const {g,a,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;
  g.update(1/30);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
  assert.equal(g.__novaShapeSweepActive,false);
 });
 test(mode+' non-expiring pair resolves chronological damage despite reversed hash order',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game,65,true);
  g.bullets[0].ttl=.2;
  const order=[];
  g.damageTank=function(t){order.push(t.id);t.hitCount++;this.hits++;};
  g.time+=1/30;g.updateBullets(1/30);
  assert.deepEqual(order,[a.id,b.id],'physical first contact, not hash order');
 });
}

/* Non-expiring rounds must also preserve victim identities when the death
 * transition slows the simulation to 35% while render FPS remains unchanged. */
for(const optimized of [false,true])for(const fps of [30,60,120,240]){
 test((optimized?'optimized':'baseline')+
  ' non-expiring piercing survives death-slow at '+fps+'Hz',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game);
  g.bullets[0].ttl=.2;
  const dt=.35/fps;
  for(let frame=0;frame<60&&g.bullets.length;frame++){
   g.time+=dt;g.updateBullets(dt);
  }
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
  assert.equal(g.hits,2);
 });
}

/* 1,100u/s is within reach of upgraded mid-speed weapon lineages; unlike
 * the 6,000u/s stress case, this regression uses a modest 36.7u 30Hz step.
 * Starting at x=15 places both 25u-separated hull contacts inside it. */
for(const optimized of [false,true])for(const fps of [30,60,120,240]){
 test((optimized?'optimized':'baseline')+
  ' boosted mid-speed pen=1 shot reaches both hulls at '+fps+'Hz',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game);
  const shot=g.bullets[0];shot.x=15;shot.vx=1100;shot.ttl=.4;
  for(let frame=0;frame<60&&g.bullets.length;frame++){
   const dt=1/fps;g.time+=dt;g.updateBullets(dt);
  }
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
  assert.equal(g.hits,2);
 });
}

/* Run 372b: an expiring Marksman-family projectile can retain penetration
 * after one hull. Its remaining physically reachable hulls must still be
 * damaged before TTL even when the bullet expires mid-frame. Pen=2, speed
 * 1050u/s, radius 5.5; no shell/splash/beam or shield involved. */
for(const optimized of [false,true])for(const fps of [30,60,120,240]){
 test((optimized?'optimized':'baseline')+
  ' pen=2 Marksman TTL reaches two distinct hulls at '+fps+'Hz',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game,52);
  a.x=25;
  const shot=g.bullets[0];shot.vx=1050;shot.r=5.5;shot.ttl=.03;
  shot.pen=2;shot.dmg=21;
  for(let frame=0;frame<100&&g.bullets.length;frame++){
   const dt=1/fps;g.time+=dt;g.updateBullets(dt);
  }
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1,'second physical contact before expiry');
  assert.equal(g.hits,2);
 });
 test((optimized?'optimized':'baseline')+
  ' pen=2 Marksman TTL cannot damage unreachable hull at '+fps+'Hz',()=>{
  const Game=boot(undefined,optimized),{g,b}=makeWorld(Game,120);
  g.tanks[0].x=25;
  const shot=g.bullets[0];shot.vx=1050;shot.r=5.5;shot.ttl=.03;
  shot.pen=2;shot.dmg=21;
  for(let frame=0;frame<100&&g.bullets.length;frame++){
   const dt=1/fps;g.time+=dt;g.updateBullets(dt);
  }
  assert.equal(b.hitCount,0);
 });
}
for(const optimized of [false,true]) {
 test((optimized?'optimized':'baseline')+
  ' pen=2 expiring high-speed shot resolves three chronological hulls',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game,52);
  a.x=25;
  const c={kind:'tank',id:4,x:78,y:0,cls:'scout',hp:100,alive:true,hitCount:0};
  g.tanks.push(c);
  const shot=g.bullets[0];shot.vx=2500;shot.r=5.5;shot.ttl=.03;
  shot.pen=2;shot.dmg=21;
  g.time+=1/30;g.updateBullets(1/30);
  assert.deepEqual([a.hitCount,b.hitCount,c.hitCount],[1,1,1]);
  assert.equal(g.hits,3);
 });
}

/* Marksman TTL adversarial gates: no partial penetration may be backdated
 * through defense, unknown motion, cover or a competing projectile. */
for(const optimized of [false,true]) {
 const mode=optimized?'optimized':'baseline',Game=boot(undefined,optimized);
 function world(){
  const {g,a,b}=makeWorld(Game,52);a.x=25;
  const shot=g.bullets[0];shot.vx=1050;shot.r=5.5;
  shot.ttl=.03;shot.pen=2;shot.dmg=21;
  return {g,a,b};
 }
 test(mode+' pen=2 TTL refuses shielded later hull',()=>{
  const {g,b}=world();b.spawnShieldT=2;
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' pen=2 TTL refuses unknown tank motion',()=>{
  const {g,b}=world();g.__novaShapeSweepActive=true;
  g.__novaShapeSweepEpoch=372;
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' pen=2 TTL refuses moving tank witness',()=>{
  const {g,b}=world();g.__novaShapeSweepActive=true;
  g.__novaShapeSweepEpoch=372;
  g.time+=1/30;
  for(const t of g.tanks){
   t.__novaSweepMoveTime=g.time;
   t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
  }
  b.__novaSweepPrevY=18;
  g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' pen=2 TTL refuses permanent wall between contacts',()=>{
  const {g,b}=world();
  g.__novaTerrain=[{id:-372,shape:'rect',x:20,y:0,w:3,h:90,
   solid:true,destructible:false}];
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' pen=2 TTL refuses competing hostile projectile',()=>{
  const {g,b}=world();
  g.bullets.push({kind:'bullet',id:372,ownerId:9,x:15,y:0,vx:0,vy:0,
   r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,shell:false,beam:false});
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' pen=2 TTL never reaches hull beyond expiry',()=>{
  const {g,b}=world();b.x=70;
  g.time+=1/30;g.updateBullets(1/30);
  assert.equal(b.hitCount,0);
 });
 test(mode+' pen=2 TTL preserves chronological order under reversed hash',()=>{
  const {g,a,b}=world();g.tanks.reverse();
  const order=[];
  g.damageTank=function(t){order.push(t.id);t.hitCount++;this.hits++;};
  g.time+=1/30;g.updateBullets(1/30);
  assert.deepEqual(order,[a.id,b.id]);
 });
}

/* Remaining-penetration accounting uses projectile simulation time, not the
 * full-speed match clock, during the player's 35% death transition. */
for(const optimized of [false,true])for(const fps of [30,60,120,240]){
 test((optimized?'optimized':'baseline')+
  ' pen=2 Marksman TTL survives 35% death-slow at '+fps+'Hz',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game,52);
  a.x=25;
  const shot=g.bullets[0];shot.vx=1050;shot.r=5.5;
  shot.ttl=.03;shot.pen=2;shot.dmg=21;
  const dt=.35/fps;
  for(let frame=0;frame<120&&g.bullets.length;frame++){
   g.time+=1/fps;g.updateBullets(dt);
  }
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
  assert.equal(g.hits,2);
 });
}

for(const optimized of [false,true]) {
 test((optimized?'optimized':'baseline')+
  ' pen=2 TTL contact recovery works through real Game.update epoch',()=>{
  const Game=boot(function(dt){
   this.time+=dt;
   for(const t of this.tanks){
    t.__novaSweepMoveTime=this.time;
    t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
   }
   this.updateBullets(dt);
  },optimized);
  const {g,a,b}=makeWorld(Game,52);a.x=25;
  const shot=g.bullets[0];shot.vx=1050;shot.r=5.5;
  shot.ttl=.03;shot.pen=2;shot.dmg=21;
  g.update(1/30);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
  assert.equal(g.hits,2);
  assert.equal(g.__novaShapeSweepActive,false);
 });
}

/* Run 374: an isolated piercing shot must not lose physical contacts merely
 * because hundreds of unrelated projectiles exist elsewhere in the arena.
 * The background shots are remote, stationary, and harmless; the direct
 * collision system still owns any genuinely competing projectile. */
for(const optimized of [false,true]){
 const Game=boot(undefined,optimized),label=optimized?'optimized':'baseline';
 for(const fps of [30,60,120,240]){
  test(label+' remote projectile density preserves expiring penetration at '+fps+'Hz',()=>{
   const {g,a,b}=makeWorld(Game);
   for(let i=0;i<960;i++)g.bullets.push({kind:'bullet',id:100+i,ownerId:10+i,
    x:900+(i%24)*3,y:900+Math.floor(i/24)*3,vx:0,vy:0,
    r:2,dmg:1,ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
   const dt=.35/fps;
   for(let frame=0;frame<20;frame++){g.time+=dt;g.updateBullets(dt);}
   assert.equal(a.hitCount,1,'first physically reached hull');
   assert.equal(b.hitCount,1,'second physically reached hull despite remote fire');
  });
 }
 test(label+' remote projectile density preserves non-expiring same-frame penetration',()=>{
  const {g,a,b}=makeWorld(Game);
  g.bullets[0].ttl=.1;
  for(let i=0;i<960;i++)g.bullets.push({kind:'bullet',id:2000+i,ownerId:10+i,
   x:900+(i%24)*3,y:900+Math.floor(i/24)*3,vx:0,vy:0,
   r:2,dmg:1,ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
  g.time+=.02;g.updateBullets(.02);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
 });
 test(label+' dense remote fire cannot bypass a genuinely nearby interceptor',()=>{
  const {g,a,b}=makeWorld(Game);
  g.bullets.push({kind:'bullet',id:5,ownerId:8,x:10,y:0,vx:0,vy:0,
   r:3,dmg:5,ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
  for(let i=0;i<960;i++)g.bullets.push({kind:'bullet',id:3000+i,ownerId:10+i,
   x:900+(i%24)*3,y:900+Math.floor(i/24)*3,vx:0,vy:0,
   r:2,dmg:1,ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(b.hitCount,0,'uncertain interception must remain conservative');
 });
}

for(const optimized of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' dense distant-fire result is independent of projectile array ordering',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game);
  for(let i=0;i<960;i++)g.bullets.push({kind:'bullet',id:4000+i,ownerId:10+i,
   x:900+(i%24)*3,y:900+Math.floor(i/24)*3,vx:0,vy:0,
   r:2,dmg:1,ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
  g.bullets.reverse();
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(a.hitCount,1,'first physical contact despite reverse order');
  assert.equal(b.hitCount,1,'second physical contact despite reverse order');
 });
}

/* The dense-fire exception is not a license to cross earlier physical
 * defenses: terrain and protected hulls retain their conservative veto. */
for(const optimized of [false,true]){
 const Game=boot(undefined,optimized),mode=optimized?'optimized':'baseline';
 for(const defense of ['wall','shield']){
  test(mode+' remote fire cannot bypass earlier '+defense,()=>{
   const {g,a,b}=makeWorld(Game);
   if(defense==='wall')g.__novaTerrain=[{id:-10,shape:'rect',
    x:10,y:0,w:4,h:80,solid:true,destructible:false}];
   else a.spawnShieldT=1;
   for(let i=0;i<960;i++)g.bullets.push({kind:'bullet',id:6000+i,ownerId:10+i,
    x:900+(i%24)*3,y:900+Math.floor(i/24)*3,vx:0,vy:0,
    r:2,dmg:1,ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
   g.time+=.35/30;g.updateBullets(.35/30);
   assert.equal(b.hitCount,0,'protected first event prevents speculative second hit');
   if(defense==='wall')assert.equal(a.hitCount,0);
  });
 }
}

/* Distant neutral bodies must not defeat the same physical proof: the
 * previous helper rejected >360 total entities before checking location. */
for(const optimized of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' remote shapes and bullets preserve the isolated two-hull contact',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game);
  for(let i=0;i<400;i++){
   g.shapes.push({kind:'shape',id:8000+i,x:-900+(i%20)*4,
    y:-900+Math.floor(i/20)*4,r:12,hp:100});
   g.bullets.push({kind:'bullet',id:9000+i,ownerId:10+i,
    x:900+(i%20)*4,y:900+Math.floor(i/20)*4,vx:0,vy:0,
    r:2,dmg:1,ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
  }
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1,'remote neutral ecology cannot suppress penetration');
 });
}

/* Canonical ordinary-neutral population size plus crowded distant fire:
 * the two eligible hulls are the only local physical contacts. */
for(const optimized of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' canonical neutral population does not suppress a lone piercing shot',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game);
  for(let i=0;i<120;i++)g.shapes.push({kind:'shape',id:12000+i,
   x:-900+(i%20)*4,y:-900+Math.floor(i/20)*4,r:12,hp:100});
  for(let i=0;i<960;i++)g.bullets.push({kind:'bullet',id:13000+i,
   ownerId:10+i,x:900+(i%24)*3,y:900+Math.floor(i/24)*3,
   vx:0,vy:0,r:2,dmg:1,ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1);
 });
}

/* Regression-first evidence from PR #344: independent piercing shots must
 * not be starved by unrelated distant projectiles when several expire in
 * one frame. These formerly red acceptance cases now guard production. */
function multiShotRemoteWorld(Game,shotCount,remoteCount,reverse=false){
 const g=new Game(),victims=[];
 for(let i=0;i<shotCount;i++){
  const y=i*160,a={kind:'tank',id:200+i*2,x:40,y,cls:'scout',
   hp:100,alive:true,hitCount:0},b={kind:'tank',id:201+i*2,
   x:65,y,cls:'scout',hp:100,alive:true,hitCount:0};
  g.tanks.push(a,b);victims.push(a,b);
  g.bullets.push({kind:'bullet',id:100+i,ownerId:1,x:0,y,
   vx:6000,vy:0,r:3,dmg:20,ttl:.01,pen:1,hits:0,dead:false,
   shell:false,beam:false});
 }
 for(let i=0;i<120;i++)g.shapes.push({kind:'shape',id:10000+i,
  x:-900+(i%20)*4,y:-900+Math.floor(i/20)*4,r:12,hp:100});
 for(let i=0;i<remoteCount;i++)g.bullets.push({kind:'bullet',
  id:20000+i,ownerId:1000+i,x:900+(i%10)*4,
  y:900+Math.floor(i/10)*4,vx:0,vy:0,r:2,dmg:1,
  ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
 if(reverse)g.bullets.reverse();
 g.damageTank=function(t){t.hitCount++;};
 return {g,victims};
}
for(const optimized of [false,true]){
 const Game=boot(undefined,optimized),mode=optimized?'optimized':'baseline';
 for(const control of [{shots:4,remote:50},{shots:5,remote:0}]){
  test(mode+' local-chronology budget control '+control.shots+
   ' shots, '+control.remote+' distant bullets',()=>{
   const {g,victims}=multiShotRemoteWorld(Game,control.shots,control.remote);
   g.time+=.35/30;g.updateBullets(.35/30);
   assert.deepEqual(victims.map(v=>v.hitCount),
    Array(victims.length).fill(1));
  });
 }
 for(const fps of [30,60]){
  test(mode+' fifth isolated shot must not be starved at '+fps+'Hz',()=>{
   const {g,victims}=multiShotRemoteWorld(Game,5,50);
   const dt=.35/fps;
   for(let frame=0;frame<3;frame++){g.time+=dt;g.updateBullets(dt);}
   assert.deepEqual(victims.map(v=>v.hitCount),
    Array(10).fill(1),'five independent pairs are physically reachable');
  });
 }
 test(mode+' dense multi-shot outcome independent of bullet order',()=>{
  const {g,victims}=multiShotRemoteWorld(Game,5,50,true);
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.deepEqual(victims.map(v=>v.hitCount),Array(10).fill(1));
 });
}


/* Run 375: a spatially local, batch-budgeted recovery must not acquire
 * global density dependence or bypass an independent shot's real defenses.
 * These execute the materialized core and the actual Battlefield overlay. */
for(const optimized of [false,true]){
 const Game=boot(undefined,optimized),mode=optimized?'optimized':'baseline';
 for(const fps of [30,60]){
  test(mode+' multi-shot piercing survives 960 remote bullets at '+fps+'Hz',()=>{
   const {g,victims}=multiShotRemoteWorld(Game,5,960);
   const dt=.35/fps;
   for(let frame=0;frame<3;frame++){g.time+=dt;g.updateBullets(dt);}
   assert.deepEqual(victims.map(v=>v.hitCount),Array(10).fill(1));
  });
 }
 test(mode+' independent non-expiring shots resolve both hulls in one frame',()=>{
  const {g,victims}=multiShotRemoteWorld(Game,5,50);
  for(const b of g.bullets)if(b.ownerId===1)b.ttl=.1;
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.deepEqual(victims.map(v=>v.hitCount),Array(10).fill(1));
 });
 for(const veto of ['interceptor','wall','shield']){
  test(mode+' one '+veto+' veto cannot starve four independent piercing shots',()=>{
   const {g,victims}=multiShotRemoteWorld(Game,5,50);
   if(veto==='interceptor')g.bullets.push({kind:'bullet',id:90099,
    ownerId:888,x:10,y:0,vx:0,vy:0,r:3,dmg:1,ttl:2,
    pen:0,hits:0,dead:false,shell:false,beam:false});
   else if(veto==='wall')g.__novaTerrain=[{id:-999,shape:'rect',
    x:10,y:0,w:4,h:80,solid:true,destructible:false}];
   else victims[0].spawnShieldT=1;
   g.time+=.35/30;g.updateBullets(.35/30);
   assert.deepEqual(victims.slice(2).map(v=>v.hitCount),Array(8).fill(1),
    'unrelated shots remain independently correct');
   assert.equal(victims[1].hitCount,0,
    'the vetoed shot must not damage a target beyond its first obstacle');
   if(veto==='wall')assert.equal(victims[0].hitCount,0);
  });
 }
}


/* Independent-shot recovery is deliberately NOT an event-order resolver.
 * If two piercing shots can damage the same hull, do not let whichever
 * projectile appears first claim the shared victim through this shortcut. */
for(const optimized of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' shared-hull collision attribution is independent of bullet array order',()=>{
  const Game=boot(undefined,optimized);
  function run(reverse){
   const g=new Game(),a={kind:'tank',id:2,x:40,y:5,cls:'scout',
    hp:100,alive:true,owners:[]},b={kind:'tank',id:3,x:65,y:5,
    cls:'scout',hp:100,alive:true,owners:[]};
   g.tanks=[a,b];
   g.damageTank=function(t,dmg,owner){t.hp-=dmg;t.owners.push(owner);};
   g.bullets=[
    {kind:'bullet',id:11,ownerId:111,x:0,y:0,vx:6000,vy:0,
     r:3,dmg:40,ttl:.01,pen:1,hits:0,dead:false,shell:false,beam:false},
    {kind:'bullet',id:12,ownerId:222,x:0,y:10,vx:6000,vy:0,
     r:3,dmg:40,ttl:.01,pen:1,hits:0,dead:false,shell:false,beam:false}
   ];
   for(let i=0;i<120;i++)g.shapes.push({kind:'shape',id:1000+i,
    x:-900+(i%20)*4,y:-900+Math.floor(i/20)*4,r:12,hp:100});
   for(let i=0;i<500;i++)g.bullets.push({kind:'bullet',id:2000+i,
    ownerId:2000+i,x:900+(i%20)*4,y:900+Math.floor(i/20)*4,
    vx:0,vy:0,r:2,dmg:1,ttl:2,pen:0,hits:0,dead:false,
    shell:false,beam:false});
   if(reverse)g.bullets.reverse();
   g.time+=.35/30;g.updateBullets(.35/30);
   return [a.owners,b.owners];
  }
  assert.deepEqual(run(false),run(true),
   'ambiguous shared-hull attribution must not depend on array order');
 });
}


/* Run 375 follow-through: the multi-shot recovery must also work through
 * the real Game.update epoch, where Battlefield requires witnessed motion.
 * Direct updateBullets fixtures alone are not a shipping integration gate. */
for(const optimized of [false,true]){
 const mode=optimized?'optimized':'baseline';
 for(const fps of [30,60]){
  test(mode+' five piercing shots survive remote density through Game.update at '+fps+'Hz',()=>{
   const Game=boot(function(dt){
    this.time+=dt;
    for(const t of this.tanks){
     t.__novaSweepMoveTime=this.time;
     t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
    }
    this.updateBullets(dt);
   },optimized);
   const {g,victims}=multiShotRemoteWorld(Game,5,960),dt=.35/fps;
   for(let frame=0;frame<3;frame++)g.update(dt);
   assert.deepEqual(victims.map(v=>v.hitCount),Array(10).fill(1));
   assert.equal(g.__novaShapeSweepActive,false,
    'live movement epoch must be closed after the update');
  });
 }
 test(mode+' moving first hull vetoes only its own multi-shot recovery',()=>{
  const Game=boot(function(dt){
   this.time+=dt;
   for(const t of this.tanks){
    t.__novaSweepMoveTime=this.time;
    t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
   }
   this.tanks[0].x+=5;
   this.updateBullets(dt);
  },optimized);
  const {g,victims}=multiShotRemoteWorld(Game,5,50);
  g.update(.35/30);
  assert.equal(victims[1].hitCount,0,
   'uncertain moving-hull chronology must not authorize the second contact');
  assert.deepEqual(victims.slice(2).map(v=>v.hitCount),Array(8).fill(1),
   'independent witnessed-stationary shots must still recover');
  assert.equal(g.__novaShapeSweepActive,false);
 });
}


/* Deterministic real-update stress: spatial separation, contact order and
 * victim identity remain invariant under array permutation and frame split. */
for(const optimized of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' seeded multi-shot live epoch preserves all physical victim identities',()=>{
  const Game=boot(function(dt){
   this.time+=dt;
   for(const t of this.tanks){
    t.__novaSweepMoveTime=this.time;
    t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
   }
   this.updateBullets(dt);
  },optimized);
  let seed=375026;
  function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   return seed/4294967296;}
  for(let w=0;w<160;w++){
   const fps=w%2?60:30,{g,victims}=multiShotRemoteWorld(Game,5,50);
   for(let i=0;i<5;i++){
    victims[i*2].x=35+rnd()*12;
    victims[i*2+1].x=64+rnd()*10;
   }
   if(w%3===0)g.bullets.reverse();
   if(w%5===0)g.tanks.reverse();
   const dt=.35/fps;
   for(let frame=0;frame<3;frame++)g.update(dt);
   assert.deepEqual(victims.map(v=>v.hitCount),Array(10).fill(1),
    'all ten stationary hulls must be hit exactly once in world '+w);
   assert.equal(g.__novaShapeSweepActive,false);
  }
 });
}


/* Run 376: optional chronological proof must be local to physically
 * eligible shots, even when OTHER penetrating shots expire this frame.
 * These execute the materialized core + shipping Battlefield/Performance. */
for(const optimized of [false,true]){
 const mode=optimized?'optimized':'baseline';
 for(const fps of [30,60]){
  for(const reverse of [false,true]){
   test(mode+' five valid piercing shots survive five remote piercing shots at '+
    fps+'Hz, reversed='+reverse,()=>{
    const Game=boot(undefined,optimized);
    const {g,victims}=multiShotRemoteWorld(Game,5,50);
    for(let i=0;i<5;i++)g.bullets.push({kind:'bullet',
     id:70000+i,ownerId:5000+i,x:0,y:1100+i*160,
     vx:6000,vy:0,r:3,dmg:20,ttl:.01,pen:1,hits:0,dead:false,
     shell:false,beam:false});
    if(reverse)g.bullets.reverse();
    const dt=.35/fps;
    for(let frame=0;frame<3;frame++){g.time+=dt;g.updateBullets(dt);}
    assert.deepEqual(victims.map(v=>v.hitCount),Array(10).fill(1),
     'remote piercing shots cannot consume a valid local proof budget');
   });
  }
 }
 test(mode+' single useful shot survives seven remote piercing shots through Game.update',()=>{
  const Game=boot(function(dt){
   this.time+=dt;
   for(const t of this.tanks){
    t.__novaSweepMoveTime=this.time;
    t.__novaSweepPrevX=t.x;t.__novaSweepPrevY=t.y;
   }
   this.updateBullets(dt);
  },optimized);
  const {g,victims}=multiShotRemoteWorld(Game,1,50);
  for(let i=0;i<7;i++)g.bullets.push({kind:'bullet',
   id:71000+i,ownerId:5100+i,x:0,y:1100+i*140,
   vx:6000,vy:0,r:3,dmg:20,ttl:.01,pen:1,hits:0,dead:false,
   shell:false,beam:false});
  for(let frame=0;frame<3;frame++)g.update(.35/30);
  assert.deepEqual(victims.map(v=>v.hitCount),[1,1]);
  assert.equal(g.__novaShapeSweepActive,false);
 });
}


for(const optimized of [false,true])for(const fps of [30,60]){
 test((optimized?'optimized':'baseline')+
  ' five valid shots survive 960 remote expiring piercing bullets at '+fps+'Hz',()=>{
  const Game=boot(undefined,optimized);
  const {g,victims}=multiShotRemoteWorld(Game,5,960);
  for(const b of g.bullets)if(b.ownerId!==1){
   b.pen=1;b.ttl=.01;
  }
  const dt=.35/fps;
  for(let frame=0;frame<3;frame++){g.time+=dt;g.updateBullets(dt);}
  assert.deepEqual(victims.map(v=>v.hitCount),Array(10).fill(1));
 });
}


for(const optimized of [false,true])for(const fps of [30,60]){
 test((optimized?'optimized':'baseline')+
  ' non-expiring five-shot chronology ignores 960 remote piercing rounds at '+fps+'Hz',()=>{
  const Game=boot(undefined,optimized);
  const {g,victims}=multiShotRemoteWorld(Game,5,960);
  for(const b of g.bullets){
   b.pen=1;b.ttl=.2;
  }
  const dt=.35/fps;
  for(let frame=0;frame<3;frame++){g.time+=dt;g.updateBullets(dt);}
  assert.deepEqual(victims.map(v=>v.hitCount),Array(10).fill(1));
 });
}


/* Run 376 adversarial: a competing projectile can already be inside the
 * FIRST victim's hull without touching the piercing shot's narrow corridor.
 * The optional shortcut must not reorder that earlier damage and kill credit.
 * Test the materialized core and both shipping Battlefield compositions. */
for(const optimized of [false,true])for(const ttl of [.01,.2]){
 test((optimized?'optimized':'baseline')+
  ' earlier lateral projectile contact vetoes piercing shortcut TTL='+ttl,()=>{
  const Game=boot(undefined,optimized),{g,a}=makeWorld(Game);
  a.hp=45;
  g.bullets[0].ttl=ttl;
  const events=[];
  g.damageTank=function(t,dmg,owner){
   events.push({id:t.id,owner});
   t.hitCount++;t.hp-=dmg;
   if(t.hp<=0)t.alive=false;
  };
  /* At y=19 this bullet is inside the first hull's 21u hit radius at t=0,
   * but it does not overlap the piercing shot's 8u projectile corridor. */
  g.bullets.push({kind:'bullet',id:77000,ownerId:7,x:40,y:19,
   vx:0,vy:0,r:3,dmg:30,ttl:1,pen:0,hits:0,dead:false,
   shell:false,beam:false});
  const dt=.35/30;
  g.time+=dt;g.updateBullets(dt);
  assert.ok(events.length>0,'earlier competitor must apply ordinary damage');
  assert.equal(events[0].owner,7,
   'a t=0 contact must precede the piercing shot at t>0');
 });
}


for(const optimized of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' lateral hull competitor vetoes only its own piercing lane',()=>{
  const Game=boot(undefined,optimized);
  const {g,victims}=multiShotRemoteWorld(Game,5,50);
  g.bullets.push({kind:'bullet',id:77001,ownerId:7,
   x:40,y:19,vx:0,vy:0,r:3,dmg:20,ttl:1,pen:0,
   hits:0,dead:false,shell:false,beam:false});
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.deepEqual(victims.slice(2).map(v=>v.hitCount),Array(8).fill(1),
   'four unrelated stationary two-hull shots must still recover');
  assert.equal(victims[1].hitCount,0,
   'the lane with uncertain prior victim damage must abstain');
 });
}


for(const optimized of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' self-owned lateral bullet does not suppress legitimate piercing contacts',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game);
  g.bullets.push({kind:'bullet',id:77002,ownerId:a.id,
   x:40,y:19,vx:0,vy:0,r:3,dmg:30,ttl:1,pen:0,
   hits:0,dead:false,shell:false,beam:false});
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,1,
   'a tank cannot be damaged by its own unrelated stationary bullet');
 });
}


for(const optimized of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' a projectile arriving after both piercing contacts does not veto them',()=>{
  const Game=boot(undefined,optimized),{g,a,b}=makeWorld(Game);
  const owners=[];
  g.damageTank=function(t,dmg,owner){
   owners.push(owner);t.hitCount++;
  };
  /* At x=65 the competing projectile enters the second hull at t=.010s;
   * the piercing shot reaches that hull at about t=.0073s. */
  g.bullets.push({kind:'bullet',id:77003,ownerId:7,
   x:65,y:25,vx:0,vy:-400,r:3,dmg:10,ttl:1,pen:0,
   hits:0,dead:false,shell:false,beam:false});
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.equal(a.hitCount,1);
  assert.equal(b.hitCount,2);
  assert.deepEqual(owners,[1,1,7],
   'the shortcut must remain available when other damage is provably later');
 });
}


/* Run 387: a SINGLE useful penetrating shot must not lose physical hits
 * merely because >1200 unrelated bullets exist elsewhere. Exercise the
 * materialized core and both shipping Battlefield compositions, including
 * expiry, surviving two-hit penetration and reversed array order. */
for (const optimized of [false,true]) for (const fps of [30,60]) {
 for (const nonExpiring of [false,true]) for (const reverse of [false,true]) {
  test((optimized?'optimized':'baseline')+
   ' single piercing shot ignores 2000 remote bullets at '+fps+
   'Hz, live='+nonExpiring+', reversed='+reverse,()=>{
   const Game=boot(undefined,optimized);
   const {g,victims}=multiShotRemoteWorld(Game,1,2000,reverse);
   if(nonExpiring)g.bullets.find(b=>b.ownerId===1).ttl=.2;
   const dt=.35/fps;
   for(let frame=0;frame<3;frame++){g.time+=dt;g.updateBullets(dt);}
   assert.deepEqual(victims.map(v=>v.hitCount),[1,1],
    'a distant firefight cannot disable two chronological local contacts');
  });
 }
}


/* The 2,000-remote-bullet exception must not reorder an earlier local
 * projectile or tunnel through permanent cover. Both outcomes remain
 * independent of the remote bullet array order. */
for(const optimized of [false,true])for(const reverse of [false,true]){
 test((optimized?'optimized':'baseline')+
  ' 2000 remote bullets cannot bypass earlier lateral projectile, reversed='+reverse,()=>{
  const Game=boot(undefined,optimized),{g,a}=makeWorld(Game);
  const events=[];
  g.damageTank=function(t,dmg,owner){
   events.push({id:t.id,owner});t.hitCount++;t.hp-=dmg;
   if(t.hp<=0)t.alive=false;
  };
  for(let i=0;i<2000;i++)g.bullets.push({kind:'bullet',
   id:80000+i,ownerId:1000+i,x:900+(i%10)*4,
   y:900+Math.floor(i/10)*4,vx:0,vy:0,r:2,dmg:1,
   ttl:2,pen:0,hits:0,dead:false,shell:false,beam:false});
  g.bullets.push({kind:'bullet',id:90000,ownerId:7,x:40,y:19,
   vx:0,vy:0,r:3,dmg:30,ttl:1,pen:0,hits:0,dead:false,
   shell:false,beam:false});
  if(reverse)g.bullets.reverse();
  g.time+=.35/30;g.updateBullets(.35/30);
  assert.ok(events.length>0,'earlier competing contact must still occur');
  assert.equal(events[0].owner,7,
   'local collision chronology cannot be overwritten by a remote-density shortcut');
 });
}


/* Run 419 — neutral-shape piercing chronology.
 * A fast pen=1 round can cross two ordinary stationary neutral hulls
 * within one frame while TTL stays positive. The materialized core
 * and the single-hit swept fallback lose the second contact at 30/60Hz.
 * Use the real Game.update epoch, Battlefield and Performance layers;
 * refuse any unproven movement, kill/fragment, cover or competing fire. */
function neutralPair(Game, secondX=70, reverse=false, firstHp=100) {
  const g=new Game();
  const a={kind:'shape',id:401,type:'square',x:40,y:0,r:12,
    hp:firstHp,maxHp:firstHp,hitCount:0};
  const b={kind:'shape',id:402,type:'square',x:secondX,y:0,r:12,
    hp:100,maxHp:100,hitCount:0};
  g.shapes=reverse?[b,a]:[a,b];
  g.damageShape=function(s,dmg){
    s.hp-=dmg;s.hitCount++;this.hits++;
  };
  g.bullets=[{kind:'bullet',id:400,ownerId:1,x:0,y:0,
    vx:6000,vy:0,r:3,dmg:20,ttl:.5,pen:1,hits:0,
    dead:false,shell:false,beam:false,splash:0}];
  return {g,a,b};
}
for(const optimized of [false,true]){
  const mode=optimized?'Battlefield + Performance':'Battlefield';
  const Game=boot(function(dt){this.time+=dt;this.updateBullets(dt);},optimized);
  for(const fps of [30,60,120,240]){
    test(mode+' neutral pen=1 physically reaches two stationary shapes at '+fps+'Hz',()=>{
      const {g,a,b}=neutralPair(Game);
      for(let frame=0;frame<30&&g.bullets.length;frame++)g.update(1/fps);
      assert.equal(a.hitCount,1,'first neutral receives exactly one hit');
      assert.equal(b.hitCount,1,'second neutral reached before frame/TTL boundary');
      assert.equal(a.hp,80);assert.equal(b.hp,80);
    });
  }
  test(mode+' neutral pair is independent of hash iteration order',()=>{
    const {g,a,b}=neutralPair(Game,70,true);
    g.update(1/30);
    assert.equal(a.hitCount,1);assert.equal(b.hitCount,1);
  });
  test(mode+' neutral pair does not invent a hit beyond this frame',()=>{
    const {g,b}=neutralPair(Game,240);
    g.update(1/30);
    assert.equal(b.hitCount,0);
  });
  test(mode+' neutral pair defers intervening permanent cover',()=>{
    const {g,b}=neutralPair(Game);
    g.__novaTerrain=[{id:-419,shape:'rect',x:55,y:0,w:4,h:80,
      solid:true,destructible:false,hp:0}];
    g.update(1/30);
    assert.equal(b.hitCount,0);
  });
  test(mode+' neutral pair defers nearby competing projectile',()=>{
    const {g,b}=neutralPair(Game);
    g.bullets.push({kind:'bullet',id:499,ownerId:9,x:50,y:0,
      vx:0,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,
      dead:false,shell:false,beam:false,splash:0});
    g.update(1/30);
    assert.equal(b.hitCount,0);
  });
  test(mode+' neutral pair refuses a lethal first shape and fragment ambiguity',()=>{
    const {g,b}=neutralPair(Game,70,false,15);
    g.update(1/30);
    assert.equal(b.hitCount,0);
  });
  test(mode+' neutral pair refuses a moving shape in its corridor',()=>{
    const MovingGame=boot(function(dt){
      this.time+=dt;this.shapes[1].x+=5;this.updateBullets(dt);
    },optimized);
    const {g,b}=neutralPair(MovingGame);
    g.update(1/30);
    assert.equal(b.hitCount,0);
  });
  test(mode+' neutral pair refuses a shape born during this frame',()=>{
    const BornGame=boot(function(dt){
      this.time+=dt;this.shapes[1].born=this.time;this.updateBullets(dt);
    },optimized);
    const {g,b}=neutralPair(BornGame);
    g.update(1/30);
    assert.equal(b.hitCount,0);
  });
  test(mode+' neutral pair refuses missing Game.update movement epoch',()=>{
    const Isolated=boot(undefined,optimized);
    const {g,b}=neutralPair(Isolated);
    g.updateBullets(1/30);
    assert.equal(b.hitCount,0);
  });
}


/* Independent seeded geometry: different speeds, separations, FPS and hash
 * order must preserve the same two physical victim identities. These are
 * controlled nonlethal worlds, not an estimate of natural match frequency. */
for(const optimized of [false,true]){
  const mode=optimized?'optimized':'baseline';
  const Game=boot(function(dt){this.time+=dt;this.updateBullets(dt);},optimized);
  test(mode+' 400 seeded neutral-pair frame partitions preserve two victims',()=>{
    let seed=4192026;
    const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const worlds=Array.from({length:100},(_,i)=>{
      const x1=30+rnd()*50,vx=3000+rnd()*6000;
      return {x1,x2:x1+25+rnd()*45,vx,reverse:i%2===0};
    });
    for(const fps of [30,60,120,240])for(const w of worlds){
      const {g,a,b}=neutralPair(Game,w.x2,w.reverse);
      a.x=w.x1;g.bullets[0].vx=w.vx;
      for(let frame=0;frame<100&&g.bullets.length;frame++)g.update(1/fps);
      assert.equal(a.hitCount,1,'first victim at '+fps+'Hz');
      assert.equal(b.hitCount,1,'second victim at '+fps+'Hz');
      assert.equal(g.hits,2,'no duplicate/phantom contact at '+fps+'Hz');
    }
  });
  test(mode+' remote independent fire does not suppress local shape-pair proof',()=>{
    const {g,a,b}=neutralPair(Game);
    g.bullets.push({kind:'bullet',id:500,ownerId:9,x:2000,y:2000,
      vx:0,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,
      dead:false,shell:false,beam:false,splash:0});
    g.update(1/30);
    assert.equal(a.hitCount,1);assert.equal(b.hitCount,1);
  });
  test(mode+' tangent neutral contact is never upgraded to an invented hit',()=>{
    const {g,b}=neutralPair(Game);
    b.y=15; // exactly bullet.r + shape.r: tangent, not overlap
    g.update(1/30);
    assert.equal(b.hitCount,0);
  });
  test(mode+' unknown newborn remote neutral defers the entire shortcut',()=>{
    const Newborn=boot(function(dt){
      this.time+=dt;
      this.shapes.push({kind:'shape',id:999,type:'circle',
        x:1500,y:1500,r:12,hp:100,born:this.time});
      this.updateBullets(dt);
    },optimized);
    const {g,b}=neutralPair(Newborn);
    g.update(1/30);
    assert.equal(b.hitCount,0);
  });
}


/* Real class envelope, not a 6,000u/s synthetic weapon: Tempest's
 * canonical 500u/s pen=1 shell at 44 earned bullet-speed upgrades reaches
 * 2,370u/s under Game.bulletSpeed. At the actual 0.033s frame cap, two
 * nonlethal Squares are physically crossed in one frame. The old shipping
 * composition misses the second at 30Hz but hits it at 60/120Hz. */
for(const optimized of [false,true]){
  const mode=optimized?'optimized':'baseline';
  const Game=boot(function(dt){this.time+=dt;this.updateBullets(dt);},optimized);
  test(mode+' high-upgrade Tempest neutral penetration is FPS-invariant',()=>{
    assert.match(html,/tempest:[\s\S]{0,1000}bullet:\s*\{ dmg: 6\.2, speed: 500, r: 3\.7, pen: 1/);
    assert.match(html,/bulletSpeed\(t\) \{\s*let s = classes_1\.CLASSES\[t\.cls\]\.bullet\.speed \* \(1 \+ 0\.085 \* t\.stats\.bulletspeed\)/);
    const speed=500*(1+.085*44);
    for(const fps of [30,60,120]){
      const {g,a,b}=neutralPair(Game,65);
      a.x=40;a.r=20;b.r=20;
      g.bullets[0].x=16;g.bullets[0].vx=speed;
      g.bullets[0].r=3.7;g.bullets[0].dmg=8;g.bullets[0].ttl=.82;
      for(let frame=0;frame<30&&g.bullets.length;frame++)
        g.update(Math.min(.033,1/fps));
      assert.equal(a.hitCount,1,'first Square at '+fps+'Hz');
      assert.equal(b.hitCount,1,'second Square at '+fps+'Hz');
      assert.equal(g.hits,2,'no extra hits at '+fps+'Hz');
    }
  });
}


/* Dense-fire proof: other pen=1 rounds can be numerous but physically
 * remote. A global single-projectile gate would make the fix unreachable
 * for real high-rate Tempest play; one local proof may still be unique. */
for(const optimized of [false,true]){
 const mode=optimized?'optimized':'baseline';
 const Game=boot(function(dt){this.time+=dt;this.updateBullets(dt);},optimized);
 test(mode+' 30 remote pen=1 rounds do not suppress a unique local pair',()=>{
  const {g,a,b}=neutralPair(Game,65);
  a.x=40;a.r=20;b.r=20;
  g.bullets[0].x=16;g.bullets[0].vx=500*(1+.085*44);
  g.bullets[0].r=3.7;g.bullets[0].dmg=8;g.bullets[0].ttl=.82;
  for(let i=0;i<30;i++)g.bullets.push({
   kind:'bullet',id:1000+i,ownerId:7,x:1400+i*8,y:1500,
   vx:0,vy:0,r:3,dmg:7,ttl:1,pen:1,hits:0,
   dead:false,shell:false,beam:false,splash:0
  });
  g.update(.033);
  assert.equal(a.hitCount,1);assert.equal(b.hitCount,1);
 });
 test(mode+' two independent shape-pair proofs abstain as a batch',()=>{
  const {g,b}=neutralPair(Game,65);
  g.shapes[0].r=20;b.r=20;
  g.bullets[0].x=16;g.bullets[0].vx=500*(1+.085*44);
  g.bullets[0].r=3.7;g.bullets[0].dmg=8;g.bullets[0].ttl=.82;
  const c={kind:'shape',id:801,type:'square',x:40,y:200,r:20,hp:55};
  const d={kind:'shape',id:802,type:'square',x:65,y:200,r:20,hp:55};
  g.shapes.push(c,d);
  g.bullets.push({...g.bullets[0],id:803,y:200});
  g.update(.033);
  assert.equal(b.hitCount,0,'second victim cannot be picked by bullet-array order');
  assert.equal(d.hp,55,'independent second lane must also abstain');
 });
}


/* Real neutral ecology drifts each frame. A 0.3u observed movement
 * envelope must not turn a physically guaranteed two-Square contact into
 * a 30Hz miss; a larger 5u relocation remains a conservative veto. */
for(const optimized of [false,true]){
 const Game=boot(function(dt){
  this.time+=dt;
  for(const s of this.shapes)s.x+=.3;
  this.updateBullets(dt);
 },optimized);
 test((optimized?'optimized':'baseline')+
  ' slow moving Squares preserve guaranteed Tempest contacts at 30Hz',()=>{
  const {g,a,b}=neutralPair(Game,65);
  a.r=20;b.r=20;
  g.bullets[0].x=15.5;g.bullets[0].vx=500*(1+.085*44);
  g.bullets[0].r=3.7;g.bullets[0].dmg=8;g.bullets[0].ttl=.82;
  g.update(.033);
  assert.equal(a.hitCount,1);assert.equal(b.hitCount,1);
 });
}


/* Run 423: TTL-expiring high-penetration shots have the same certified
 * three-body chronology as pen=2. The 15,000u/s stress geometry deliberately
 * keeps the first target outside the initial 240Hz core endpoint (62.5u),
 * so every FPS tests the SAME fully certified expiry corridor rather than
 * the separate unresolved cross-frame victim-identity problem.
 * This is NOT permission to backdate live pen>=3 shots, four-body chains,
 * cover breaches or uncertain motion. */
function highPenTTLWorld(Game, pen=3, reverse=false) {
  const {g,a,b}=makeWorld(Game,103,reverse);
  a.x=88;
  const c={kind:'tank',id:4,x:120,y:0,cls:'scout',
    hp:100,alive:true,hitCount:0};
  const d={kind:'tank',id:5,x:160,y:0,cls:'scout',
    hp:100,alive:true,hitCount:0};
  g.tanks.push(c,d);
  const shot=g.bullets[0];
  shot.vx=15000;shot.r=5.5;shot.ttl=.007;shot.pen=pen;shot.dmg=21;
  return {g,a,b,c,d,shot};
}
for(const optimized of [false,true]){
 const mode=optimized?'optimized':'baseline',Game=boot(undefined,optimized);
 for(const pen of [3,4]){
  for(const fps of [30,60,120,240]){
   test(mode+' pen='+pen+' TTL three certified hulls at '+fps+'Hz',()=>{
    const {g,a,b,c,d}=highPenTTLWorld(Game,pen);
    for(let i=0;i<40&&g.bullets.length;i++){
     g.time+=1/fps;g.updateBullets(1/fps);
    }
    assert.deepEqual([a.hitCount,b.hitCount,c.hitCount,d.hitCount],
      [1,1,1,0],'no missing or post-expiry hull hits');
    assert.equal(g.hits,3);
   });
  }
  test(mode+' pen='+pen+' preserves first-contact order, not hash order',()=>{
   const {g,a,b,c,d}=highPenTTLWorld(Game,pen,true);
   g.tanks.reverse();
   const order=[];
   g.damageTank=t=>{order.push(t.id);t.hitCount++;g.hits++;};
   g.time+=1/30;g.updateBullets(1/30);
   assert.deepEqual(order,[a.id,b.id,c.id]);
   assert.equal(d.hitCount,0);
  });
  test(mode+' pen='+pen+' refuses an earlier permanent wall',()=>{
   const {g,c}=highPenTTLWorld(Game,pen);
   g.__novaTerrain=[{id:-423,shape:'rect',x:44,y:0,w:3,h:90,
     solid:true,destructible:false}];
   g.time+=1/30;g.updateBullets(1/30);
   assert.equal(c.hitCount,0);
  });
  test(mode+' pen='+pen+' refuses shielded later hull',()=>{
   const {g,c}=highPenTTLWorld(Game,pen);
   c.spawnShieldT=2;
   g.time+=1/30;g.updateBullets(1/30);
   assert.equal(c.hitCount,0);
  });
  test(mode+' pen='+pen+' refuses competing projectile interception',()=>{
   const {g,c}=highPenTTLWorld(Game,pen);
   g.bullets.push({kind:'bullet',id:423,ownerId:9,x:15,y:0,
     vx:0,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,
     dead:false,shell:false,beam:false});
   g.time+=1/30;g.updateBullets(1/30);
   assert.equal(c.hitCount,0);
  });
  test(mode+' pen='+pen+' refuses unknown movement epoch',()=>{
   const {g,c}=highPenTTLWorld(Game,pen);
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=423;
   g.time+=1/30;g.updateBullets(1/30);
   assert.equal(c.hitCount,0);
  });
  test(mode+' pen='+pen+' refuses an unproven four-body chain',()=>{
   const {g,d}=highPenTTLWorld(Game,pen);
   d.x=126; // fourth body is physically reachable, but >3 is unproven
   g.time+=1/30;g.updateBullets(1/30);
   assert.equal(d.hitCount,0);
  });
 }
}


/* The exact Apex class envelopes are playable, not invented projectile
 * budgets. Model the final 33ms of their normal TTL at 30Hz; this is a
 * collision-order stress case, not a measured natural encounter rate. */
for(const optimized of [false,true]){
 const Game=boot(undefined,optimized);
 for(const variant of [
   {name:'specter',pen:3,speed:1220,r:5.2,dmg:31,lastX:62},
   {name:'assassin',pen:4,speed:1500,r:5.8,dmg:47,lastX:65}
 ]){
  test((optimized?'optimized':'baseline')+' canonical '+variant.name+
    ' TTL tail preserves three direct victims at 30Hz',()=>{
   assert.match(html,new RegExp(variant.name+':[\\s\\S]{0,500}bullet: \\{ dmg: '+
     variant.dmg+', speed: '+variant.speed+', r: '+variant.r+
     ', pen: '+variant.pen));
   const {g,a,b,c}=highPenTTLWorld(Game,variant.pen);
   a.x=25;b.x=45;c.x=variant.lastX;
   const shot=g.bullets[0];
   shot.vx=variant.speed;shot.r=variant.r;shot.dmg=variant.dmg;
   shot.ttl=.033;
   g.time+=1/30;g.updateBullets(1/30);
   assert.deepEqual([a.hitCount,b.hitCount,c.hitCount],[1,1,1]);
  });
 }
 for(const pen of [3,4]){
  test((optimized?'optimized':'baseline')+' pen='+pen+
    ' live frame cannot use TTL-only three-hull shortcut',()=>{
   const {g,c}=highPenTTLWorld(Game,pen);
   g.bullets[0].ttl=1;
   g.time+=1/30;g.updateBullets(1/30);
   assert.equal(c.hitCount,0,'live pen>=3 needs a separate full chronology proof');
  });
  test((optimized?'optimized':'baseline')+' pen='+pen+
    ' nearby neutral movement blocks TTL shortcut',()=>{
   const {g,c}=highPenTTLWorld(Game,pen);
   g.shapes=[{kind:'shape',id:423,x:92,y:32,r:12,hp:100}];
   g.time+=1/30;g.updateBullets(1/30);
   assert.equal(c.hitCount,0);
  });
 }
}


/* Deterministic property sweep: all three certified contacts occur strictly
 * before a 2ms TTL. This avoids conflating the TTL fix with unproven
 * cross-frame hit-identity chronology; the fourth hull remains unreachable. */
for(const optimized of [false,true]){
 const Game=boot(undefined,optimized);
 test((optimized?'optimized':'baseline')+
   ' 800 seeded high-penetration expiry corridors preserve exact victims',()=>{
  let seed=4232026;
  const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(const pen of [3,4])for(const fps of [30,60,120,240])
   for(let i=0;i<100;i++){
    const {g,a,b,c,d}=highPenTTLWorld(Game,pen,i%2===0);
    a.x=25+rnd()*5;b.x=37+rnd()*5;c.x=50+rnd()*10;
    d.x=100;
    const shot=g.bullets[0];shot.vx=20000;shot.ttl=.002;
    g.time+=1/fps;g.updateBullets(1/fps);
    assert.deepEqual([a.hitCount,b.hitCount,c.hitCount,d.hitCount],
      [1,1,1,0],'world '+i+' pen='+pen+' fps='+fps);
    assert.equal(g.hits,3);
   }
 });
}

/* Run 433: non-expiring pen=2 partial chronology across frame boundaries.
 * A 120Hz first frame crosses the first TWO hulls, but not the third;
 * the core used to credit only hull 1 then jump to hull 3 next frame.
 * Prove exact victim identities and leave one legitimate later-frame hit. */
function threeHullPen2(Game) {
  const g = new Game();
  g.tanks = [40, 70, 100].map((x, i) => ({
    kind: 'tank', id: i + 2, x, y: 0, cls: 'scout',
    hp: 100, alive: true, hitCount: 0
  }));
  g.damageTank = function(t) { t.hitCount++; this.hits++; };
  g.bullets = [{kind:'bullet',id:1,ownerId:1,x:0,y:0,
    vx:6000,vy:0,r:3,dmg:20,ttl:.2,pen:2,hits:0,
    dead:false,shell:false,beam:false}];
  return g;
}
for (const optimized of [false, true]) {
  const mode = optimized ? 'Battlefield+Performance' : 'Battlefield';
  const Game = boot(undefined, optimized);
  for (const fps of [30, 60, 120, 240]) {
    test(mode+' pen-2 three-hull identity parity across '+fps+'Hz', () => {
      const g = threeHullPen2(Game);
      for (let frame=0;frame<15&&g.bullets.length;frame++) {
        g.time += 1/fps;
        g.updateBullets(1/fps);
      }
      assert.deepEqual(g.tanks.map(t=>t.hitCount), [1,1,1],
        'all three real contacts must occur exactly once');
      assert.equal(g.hits, 3);
      assert.equal(g.bullets.length, 0);
    });
  }
  test(mode+' 120Hz partial proof leaves one later-frame penetration', () => {
    const g = threeHullPen2(Game);
    g.time += 1/120;
    g.updateBullets(1/120);
    assert.deepEqual(g.tanks.map(t=>t.hitCount), [1,1,0]);
    assert.equal(g.bullets.length, 1);
    assert.equal(g.bullets[0].hits, 2);
    assert.equal(g.bullets[0].pen, 0);
    assert.equal(g.bullets[0].x, 50, 'core must advance exactly once');
    assert.equal(g.bullets[0].__novaDirectVictims.size, 2);
    g.time += 1/120;
    g.updateBullets(1/120);
    assert.deepEqual(g.tanks.map(t=>t.hitCount), [1,1,1]);
    assert.equal(g.bullets.length, 0);
  });
  test(mode+' partial proof abstains on knockback', () => {
    const g = threeHullPen2(Game);
    g.bullets[0].knock = 1;
    g.time += 1/120; g.updateBullets(1/120);
    assert.equal(g.tanks[1].hitCount, 0,
      'knockback could move an earlier hull; do not backdate two hits');
  });
  test(mode+' partial proof abstains on uncertain lethal damage', () => {
    const g = threeHullPen2(Game);
    g.tanks[1].hp = 70;
    g.time += 1/120; g.updateBullets(1/120);
    assert.equal(g.tanks[1].hitCount, 0);
  });
  test(mode+' partial proof abstains on intervening permanent cover', () => {
    const g = threeHullPen2(Game);
    g.__novaTerrain = [{id:-433,shape:'rect',x:48,y:0,
      w:3,h:90,solid:true,destructible:false}];
    g.time += 1/120; g.updateBullets(1/120);
    assert.equal(g.tanks[1].hitCount, 0);
  });
  test(mode+' partial proof abstains on uncertain moving hull', () => {
    const g = threeHullPen2(Game);
    g.__novaShapeSweepActive = true;
    g.__novaShapeSweepEpoch = 433;
    g.time += 1/120;
    for(const t of g.tanks) {
      t.__novaSweepMoveTime = g.time;
      t.__novaSweepPrevX = t.x;
      t.__novaSweepPrevY = t.y;
    }
    g.tanks[1].__novaSweepPrevY = 12;
    g.updateBullets(1/120);
    assert.equal(g.tanks[1].hitCount, 0);
  });
  test(mode+' partial proof abstains on nearby neutral corridor', () => {
    const g = threeHullPen2(Game);
    g.shapes = [{kind:'shape',id:433,x:38,y:32,r:12,hp:100}];
    g.time += 1/120; g.updateBullets(1/120);
    assert.equal(g.tanks[1].hitCount, 0);
  });
  test(mode+' partial proof abstains on competing projectile corridor', () => {
    const g = threeHullPen2(Game);
    g.bullets.push({kind:'bullet',id:433,ownerId:9,x:60,y:0,
      vx:0,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false});
    g.damageTank = function(t,dmg,ownerId) {
      t.hitCount++; this.hits++;
      (this.attribution||(this.attribution=[])).push([t.id,ownerId]);
    };
    g.time += 1/120; g.updateBullets(1/120);
    assert.equal((g.attribution||[]).filter(x=>x[0]===3&&x[1]===1).length, 0,
      'the original projectile must not speculate across competing fire');
  });
}

/* Differentially falsifiable seeded cohort: two distinct first-frame swept
 * entries, a third entry only in the following frame, and no other entities.
 * Reverse tank iteration to ensure contact identity is geometric, not array
 * order. This cohort is NOT a natural gameplay hit-frequency estimate. */
for(const optimized of [false,true]) {
  test((optimized?'optimized':'baseline')+
    ' 180 seeded pen-2 partial prefixes preserve all three identities at 120Hz',()=>{
    const Game=boot(undefined,optimized);
    let seed=4331028;
    const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for(let n=0;n<180;n++){
      const x1=28+rand()*10,x2=x1+24+rand()*6,x3=x2+26+rand()*8;
      const g=threeHullPen2(Game);
      g.tanks[0].x=x1;g.tanks[1].x=x2;g.tanks[2].x=x3;
      if(n%2)g.tanks.reverse();
      for(let frame=0;frame<5&&g.bullets.length;frame++){
        g.time+=1/120;g.updateBullets(1/120);
      }
      assert.equal(g.hits,3,'exact three contacts '+n);
      assert.deepEqual(g.tanks.map(t=>t.hitCount).sort(),[1,1,1],
        'no duplicate or skipped victim '+n);
    }
  });
}

/* Shipping-scale ecology plus distant fire must use the local preflight.
 * Otherwise the new two-hull prefix exists only in sparse test arenas. */
for(const optimized of [false,true]) {
  test((optimized?'optimized':'baseline')+
    ' dense neutral ecology and 1300 remote shots retain pen-2 prefix at 120Hz',()=>{
    const Game=boot(undefined,optimized),g=threeHullPen2(Game);
    g.shapes=Array.from({length:120},(_,i)=>({
      kind:'shape',id:500+i,x:1200+i*2,y:1200,
      r:12,hp:100,type:'circle',born:0
    }));
    for(let i=0;i<1300;i++)g.bullets.push({
      kind:'bullet',id:1000+i,ownerId:9,
      x:1000+i*.4,y:1200,vx:0,vy:0,r:3,dmg:5,
      ttl:1,pen:0,hits:0,dead:false
    });
    g.time+=1/120;g.updateBullets(1/120);
    assert.deepEqual(g.tanks.map(t=>t.hitCount),[1,1,0],
      'bounded local preflight must admit the two real first-frame hits');
    g.time+=1/120;g.updateBullets(1/120);
    assert.deepEqual(g.tanks.map(t=>t.hitCount),[1,1,1],
      'third contact remains owned by the next frame');
  });
}

/* Reachable Marksman build: base 1050u/s, eight bullet-speed upgrades
 * (1050*(1+0.085*8)=1764u/s), base pen=2, 21 damage, no gene.
 * At 30Hz the first two hulls are physically contacted before x=58.8;
 * the third first-contact occurs later. */
for(const optimized of [false,true]) {
  test((optimized?'optimized':'baseline')+
    ' upgraded canonical Marksman pen-2 preserves a split-frame third hit',()=>{
    const Game=boot(undefined,optimized),g=threeHullPen2(Game);
    g.tanks[0].x=26;g.tanks[1].x=56;g.tanks[2].x=86;
    const b=g.bullets[0];
    b.vx=1050*(1+.085*8);
    b.dmg=21;
    b.r=5.5*(1+21*.0085);
    b.ttl=1.6;
    g.time+=1/30;g.updateBullets(1/30);
    assert.deepEqual(g.tanks.map(t=>t.hitCount),[1,1,0],
      'two first-frame physical contacts must be credited');
    for(let i=0;i<5&&g.bullets.length;i++){
      g.time+=1/30;g.updateBullets(1/30);
    }
    assert.deepEqual(g.tanks.map(t=>t.hitCount),[1,1,1],
      'the remaining penetration reaches the third hull in a later frame');
  });
}

/* Integrity is calculated from the penetration at launch. A partial prefix
 * must not initialize the surviving bullet AFTER consuming its first two
 * contacts, which would silently weaken projectile-interception HP. */
for(const optimized of [false,true]) {
  test((optimized?'optimized':'baseline')+
    ' partial pen-2 prefix retains original projectile integrity',()=>{
    const Game=boot(undefined,optimized),g=threeHullPen2(Game);
    const bullet=g.bullets[0];
    g.initBulletIntegrity=function(b){
      if(b.maxHp!==undefined)return;
      b.integrityPenAtInit=b.pen;
      b.maxHp=b.dmg*(1+Math.min(8,Math.max(0,b.pen))*.055);
      b.hp=b.maxHp;
    };
    g.time+=1/120;g.updateBullets(1/120);
    assert.equal(bullet.pen,0,'two certified contacts consumed');
    assert.equal(bullet.integrityPenAtInit,2,
      'interception integrity must be calculated before consuming pen');
    assert.equal(bullet.maxHp,20*1.11);
    assert.equal(bullet.hp,bullet.maxHp);
  });
}
